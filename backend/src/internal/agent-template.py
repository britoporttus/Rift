#!/usr/bin/env python3
# Rift — agente de descoberta de rede interna (Linux/macOS).
#
# Roda DENTRO da rede do cliente (o VPS do Rift não a alcança), escaneia a LAN e
# reporta os resultados para a plataforma automaticamente. Depende só de Python 3
# (stdlib): a descoberta e a varredura de portas funcionam SEM nmap.
#
# O nmap é OPCIONAL, mas recomendado — quando presente, ele enriquece o resultado
# com versão de serviço, detecção de OS, fabricante do MAC e SMBv1 real (via NSE),
# o que melhora muito a classificação. Sem nmap, o agente degrada para varredura
# nativa (TCP connect + tabela ARP do kernel) em vez de falhar.
#
# Como o Rift acha o nmap (nesta ordem): $RIFT_NMAP → binário `nmap` ao lado deste
# script → PATH → local de instalação comum. Ou seja: instalar não é obrigatório —
# basta largar um nmap PORTÁTIL (estático) na mesma pasta do agente.
#
# Rode como root: sem privilégio o nmap não faz ARP ping, SYN scan nem detecção de
# OS, e a cobertura despenca em rede com endpoint endurecido. A varredura nativa
# funciona sem root (ping + connect scan), mas também não traz OS/versão.
#
# Uso:
#   RIFT_URL=https://rift.exemplo RIFT_TOKEN=xxxx sudo -E python3 rift-agente.py [CIDR ...]
#   # contínuo (re-escaneia a cada 15 min):
#   RIFT_URL=... RIFT_TOKEN=... sudo -E python3 rift-agente.py --watch 900 192.168.0.0/24
#   # nmap portátil explícito:
#   RIFT_NMAP=/opt/rift/nmap sudo -E python3 rift-agente.py
#
# Sem CIDR, detecta as sub-redes locais automaticamente — descartando redes
# virtuais (WSL, Hyper-V, Docker, VPN), que não são a rede do cliente.
import os
import re
import sys
import time
import json
import shutil
import socket
import ipaddress
import subprocess
import concurrent.futures
import urllib.request
import xml.etree.ElementTree as ET

VERSION = "2.1"
RIFT_URL = os.environ.get("RIFT_URL", "").rstrip("/")
RIFT_TOKEN = os.environ.get("RIFT_TOKEN", "")
# Profundidade do scan (RIFT_DEPTH): "medium" (curada, rápido — default) ou "full"
# (1-1024 + extras, amplo). Só afeta a AMPLITUDE de portas do nmap; a descoberta e a
# classificação são as mesmas. Valor inválido cai para medium.
RIFT_DEPTH = (os.environ.get("RIFT_DEPTH", "medium") or "medium").strip().lower()
if RIFT_DEPTH not in ("medium", "full"):
    RIFT_DEPTH = "medium"

# Portas varridas. Lista EXPLÍCITA em vez de --top-ports: cada porta aqui existe
# porque alguma regra de classificação (classify.js) ou de risco (analyze.js) do
# Rift depende dela. --top-ports 1000 não contém 5480/8006/2179/5989 e fazia o
# painel perder hypervisor — o alvo mais valioso de um pentest interno.
PORT_SPEC = (
    "1-1024,"                          # bem-conhecidas (inclui 22,23,80,443,445,515,554,902...)
    "1433,1521,2179,3306,3389,5432,"   # bancos, RDP, Hyper-V VMConnect
    "5480,5900-5902,5989,6379,"        # VAMI, VNC, CIM, redis
    "8000,8006,8080,8443,"             # http alt, Proxmox, https alt
    "9100,9200,9443,27017"             # jetdirect, elastic, vSphere UI, mongo
)

# Lista curada para a varredura NATIVA (connect scan). Em Python puro cada porta
# custa uma conexão TCP, então aqui entra só o que alguma regra do Rift usa — a
# mesma lista do agente Windows, pra os dois produzirem o mesmo inventário. É o
# subconjunto de PORT_SPEC que importa para classify.js/analyze.js.
NATIVE_PORTS = [
    21, 22, 23, 25, 53, 69, 80, 88, 110, 111, 135, 139, 143, 161, 389, 427, 443, 445,
    465, 512, 513, 514, 515, 554, 587, 631, 636, 902, 993, 995,
    1433, 1521, 2049, 2179, 3306, 3389, 5060, 5061, 5432, 5480, 5900, 5901, 5985, 5986,
    5989, 6379, 8000, 8006, 8080, 8443, 9100, 9200, 9443, 27017,
]

# Spec de portas que o nmap varre, por profundidade. medium = a lista curada acima
# (as portas que classify.js/analyze.js usam — rápido). full = PORT_SPEC (1-1024 +
# extras — amplo, encontra mais serviços, porém bem mais lento).
NMAP_SPEC = PORT_SPEC if RIFT_DEPTH == "full" else ",".join(str(p) for p in NATIVE_PORTS)

# Teto de hosts por alvo na varredura nativa: um /24 tem 254, mas um /16 passado à
# mão teria 65k — ping sweep + connect scan nesse volume é inviável. Acima disto,
# limita e avisa (nmap não tem esse teto: ele varre o CIDR inteiro nativamente).
MAX_NATIVE_HOSTS = 4096

# Interfaces que nunca são a rede do cliente: bridges de container, VPN, switches
# virtuais de hipervisor, loopback do túnel de DNS do WSL.
VIRTUAL_IFACE_RE = re.compile(
    r"^(lo|docker|br-|veth|virbr|vboxnet|vmnet|vnic|tun|tap|wg|zt|tailscale|utun|loopback)",
    re.IGNORECASE,
)


def die(msg):
    print(f"[agente] ERRO: {msg}", file=sys.stderr)
    sys.exit(1)


def warn(msg):
    print(f"[agente] AVISO: {msg}", file=sys.stderr)


def is_root():
    return (os.geteuid() == 0) if hasattr(os, "geteuid") else False


def is_wsl():
    """WSL não alcança a LAN em modo NAT (o padrão) — só as redes virtuais do host."""
    if os.path.exists("/proc/sys/fs/binfmt_misc/WSLInterop"):
        return True
    try:
        with open("/proc/version") as f:
            v = f.read().lower()
        return "microsoft" in v or "wsl" in v
    except OSError:
        return False


# ── localização do nmap (opcional) ────────────────────────────────────────────
def find_nmap():
    """Resolve o nmap ou retorna None. Ordem: override explícito ($RIFT_NMAP) →
    binário largado ao lado deste script (nmap portátil, sem instalação) → PATH →
    local de instalação comum. Deixar um nmap estático na pasta do agente dá
    cobertura completa sem `apt install`."""
    override = os.environ.get("RIFT_NMAP")
    if override and os.path.isfile(override) and os.access(override, os.X_OK):
        return override
    here = os.path.dirname(os.path.abspath(__file__))
    for name in ("nmap", "nmap.bin"):
        cand = os.path.join(here, name)
        if os.path.isfile(cand) and os.access(cand, os.X_OK):
            return cand
    found = shutil.which("nmap")
    if found:
        return found
    for p in ("/usr/bin/nmap", "/usr/local/bin/nmap", "/opt/nmap/bin/nmap", "/snap/bin/nmap"):
        if os.path.isfile(p) and os.access(p, os.X_OK):
            return p
    return None


def nmap_works(path):
    """Confirma que o binário resolvido REALMENTE executa (`nmap --version`). Sem
    isto, um nmap quebrado/incompatível derrubaria a coleta no meio; melhor
    detectar aqui e cair pra varredura nativa."""
    try:
        subprocess.run([path, "--version"], stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, timeout=15, check=True)
        return True
    except Exception:
        return False


def nmap_extra_args(nmap):
    """Se o nmap for portátil (largado junto do agente) e os arquivos de dados
    estiverem na mesma pasta, aponta --datadir pra lá — assim -sV/-O/NSE acham
    nmap-services/nmap-os-db/scripts sem instalação no sistema."""
    d = os.path.dirname(os.path.abspath(nmap))
    if os.path.isfile(os.path.join(d, "nmap-services")):
        return ["--datadir", d]
    return []


def gateway_is_hypervisor_switch(net):
    """True se o .1 da sub-rede resolve pra *.mshome.net — assinatura do switch
    virtual Hyper-V/WSL. É o sinal que distingue 'LAN real 172.18.x' de 'NAT do WSL'."""
    try:
        gw = str(next(ipaddress.ip_network(net).hosts()))
        name = socket.gethostbyaddr(gw)[0].lower()
        return name.endswith(".mshome.net")
    except Exception:
        return False


def iter_interfaces():
    """[(nome_da_interface, cidr), ...] a partir de `ip addr` (Linux) ou `ifconfig` (macOS)."""
    try:
        out = subprocess.check_output(["ip", "-o", "-4", "addr", "show"], text=True)
    except Exception:
        try:
            return _parse_ifconfig(subprocess.check_output(["ifconfig"], text=True))
        except Exception:
            return []
    found = []
    for line in out.splitlines():  # "2: eth0    inet 192.168.0.5/24 brd ..."
        parts = line.split()
        if len(parts) < 4:
            continue
        iface = parts[1]
        for p in parts:
            if re.match(r"^\d+\.\d+\.\d+\.\d+/\d+$", p):
                found.append((iface, p))
                break
    return found


def _parse_ifconfig(out):
    """macOS/BSD: 'inet 192.168.0.5 netmask 0xffffff00' → (iface, cidr)."""
    found, iface = [], None
    for line in out.splitlines():
        if line and not line[0].isspace():
            iface = line.split(":")[0]
        m = re.search(r"inet (\d+\.\d+\.\d+\.\d+) netmask (0x[0-9a-fA-F]+)", line)
        if m and iface:
            bits = bin(int(m.group(2), 16)).count("1")
            found.append((iface, f"{m.group(1)}/{bits}"))
    return found


def local_cidrs():
    """Sub-redes locais reais → (cidrs, avisos). Descarta virtuais em vez de
    escaneá-las: reportar a rede do WSL como se fosse a LAN do cliente produz um
    inventário falso, que é pior que inventário nenhum."""
    cidrs, warnings, skipped = set(), [], []

    for iface, addr in iter_interfaces():
        if addr.startswith("127."):
            continue
        try:
            net = ipaddress.ip_network(addr, strict=False)
        except ValueError:
            continue
        if not net.is_private or net.is_loopback or net.is_link_local:
            continue
        if VIRTUAL_IFACE_RE.match(iface):
            skipped.append(f"{iface}={net} (interface virtual)")
            continue
        if net.prefixlen == 32:
            skipped.append(f"{iface}={net} (endereço /32, não é sub-rede)")
            continue
        if net.prefixlen < 24:  # limita a /24 pra não escanear /8 sem querer
            net = ipaddress.ip_network(f"{net.network_address}/24", strict=False)
        if gateway_is_hypervisor_switch(net):
            skipped.append(f"{iface}={net} (switch virtual Hyper-V/WSL)")
            continue
        cidrs.add(str(net))

    for s in skipped:
        warn(f"ignorando {s}")
    if is_wsl():
        warnings.append(
            "Agente rodando dentro do WSL. Em modo NAT (padrão) o WSL não alcança a LAN — "
            "só as redes virtuais do próprio Windows. Use networkingMode=mirrored no .wslconfig, "
            "rode o agente PowerShell no Windows, ou rode de uma máquina Linux na rede."
        )
    if skipped and not cidrs:
        warnings.append("Nenhuma sub-rede real encontrada — só interfaces virtuais: " + "; ".join(skipped))
    return sorted(cidrs), warnings


# ── descoberta e varredura via nmap (caminho enriquecido) ─────────────────────
def discover_hosts_nmap(cidr, nmap):
    """Fase 1: quem está vivo. ARP ping (-PR) quando root, que é layer 2 e passa
    por firewall de endpoint — Defender/Intune bloqueia ICMP e portas, mas o
    Windows PRECISA responder ARP pra existir na rede. Sem root, cai pra sondas
    ICMP/TCP/UDP variadas, bem menos confiáveis."""
    base = [nmap] + nmap_extra_args(nmap)
    if is_root():
        args = base + ["-sn", "-PR", "-n", "--max-retries", "2", "-oX", "-", cidr]
    else:
        args = base + ["-sn", "-PE", "-PS443,22,3389,445,80", "-PA80", "-PU161",
                       "-n", "--max-retries", "2", "-oX", "-", cidr]
    try:
        xml_text = subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL)
    except FileNotFoundError:
        warn("nmap sumiu durante a descoberta — pulando esta sub-rede")
        return []
    except subprocess.CalledProcessError as e:
        xml_text = e.output or ""
    ips = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return ips
    for h in root.findall("host"):
        st = h.find("status")
        if st is not None and st.get("state") != "up":
            continue
        for addr in h.findall("address"):
            if addr.get("addrtype") == "ipv4":
                ips.append(addr.get("addr"))
    return ips


def scan_ports_nmap(ips, nmap):
    """Fase 2: portas/serviços/OS só dos hosts vivos. -Pn é obrigatório aqui — a
    descoberta já aconteceu na fase 1, e sem -Pn o nmap re-sondaria e descartaria
    justamente os hosts endurecidos que o ARP tinha encontrado."""
    if not ips:
        return ""
    # Otimização de tempo: host-timeout 120s (era 180 — cauda de latência com hosts
    # filtrados), max-retries 1, e min-hostgroup 32 pra o nmap varrer os hosts em
    # paralelo em vez de quase-serial. NMAP_SPEC = curada (medium) ou 1-1024+ (full).
    args = [nmap] + nmap_extra_args(nmap) + [
        "-oX", "-", "-Pn", "-p", NMAP_SPEC, "-sV", "--version-intensity", "2",
        "-T4", "--host-timeout", "120s", "--max-retries", "1", "--min-hostgroup", "32",
        "--script", "smb-protocols", "--script-timeout", "20s"]
    if is_root():
        args += ["-O", "--osscan-limit", "--max-os-tries", "1", "-sS"]  # OS + SYN exigem root
    args += ips
    try:
        return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL)
    except FileNotFoundError:
        warn("nmap sumiu durante a varredura de portas")
        return ""
    except subprocess.CalledProcessError as e:
        return e.output or ""


def parse_nmap(xml_text):
    """XML do nmap → lista de hosts no shape que o Rift espera."""
    hosts = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return hosts
    for h in root.findall("host"):
        status = h.find("status")
        if status is not None and status.get("state") != "up":
            continue
        ip = mac = vendor = hostname = os_name = None
        for addr in h.findall("address"):
            t = addr.get("addrtype")
            if t == "ipv4":
                ip = addr.get("addr")
            elif t == "mac":
                mac = addr.get("addr")
                vendor = addr.get("vendor")
        hn = h.find("hostnames/hostname")
        if hn is not None:
            hostname = hn.get("name")
        osmatch = h.find("os/osmatch")
        if osmatch is not None:
            os_name = osmatch.get("name")
        ports = []
        for p in h.findall("ports/port"):
            st = p.find("state")
            if st is None or st.get("state") != "open":
                continue
            svc = p.find("service")
            ports.append({
                "port": int(p.get("portid")),
                "proto": p.get("protocol", "tcp"),
                "service": svc.get("name") if svc is not None else None,
                "product": svc.get("product") if svc is not None else None,
                "version": svc.get("version") if svc is not None else None,
            })
        # SMBv1 REAL, via script smb-protocols. A versão anterior gravava o rótulo
        # "smb" só por ver a porta 445 — e o Rift testa "smbv1", então a regra de
        # severidade alta nunca disparava.
        protocols = []
        for s in h.findall("hostscript/script"):
            if s.get("id") != "smb-protocols":
                continue
            out = (s.get("output") or "").lower()
            if "smbv1" in out or "nt lm 0.12" in out:
                protocols.append("smbv1")
        if not ip:
            continue
        hosts.append({
            "ip": ip, "mac": mac, "macVendor": vendor, "hostname": hostname,
            "os": os_name, "openPorts": ports, "protocols": protocols,
        })
    return hosts


# ── descoberta e varredura NATIVAS (sem nmap, sem root) ───────────────────────
def _ping_cmd(ip):
    """Um ping, timeout curto. As flags diferem por SO: no macOS -W é em ms."""
    if sys.platform == "darwin":
        return ["ping", "-c", "1", "-W", "1000", "-t", "2", ip]
    return ["ping", "-c", "1", "-W", "1", ip]


def _hosts_in_cidr(cidr):
    """IPs varríveis de um CIDR, limitado a MAX_NATIVE_HOSTS. Retorna (ips, estourou)."""
    try:
        net = ipaddress.ip_network(cidr, strict=False)
    except ValueError:
        return [], False
    ips, overflow = [], False
    for h in net.hosts():
        if len(ips) >= MAX_NATIVE_HOSTS:
            overflow = True
            break
        ips.append(str(h))
    return ips, overflow


def _norm_mac(raw):
    """Normaliza MAC pra AA:BB:CC:DD:EE:FF. O `arp -an` do macOS mostra octetos sem
    zero à esquerda (a:b:c:1:2:3) — daí a normalização."""
    parts = str(raw).split(":")
    if len(parts) != 6:
        return None
    try:
        mac = ":".join(f"{int(p, 16):02X}" for p in parts)
    except ValueError:
        return None
    return None if mac == "00:00:00:00:00:00" else mac


def _read_neighbors():
    """IP → MAC a partir da tabela de vizinhança do kernel (populada como efeito
    colateral do ping sweep). Não precisa de root. `ip neigh` no Linux, `arp -an`
    no macOS/BSD. Só entradas com MAC e estado resolvido."""
    table = {}
    try:
        out = subprocess.check_output(["ip", "neigh", "show"], text=True, stderr=subprocess.DEVNULL)
        for line in out.splitlines():
            # "192.168.0.1 dev eth0 lladdr 3c:37:86:aa:bb:cc REACHABLE"
            m = re.match(r"^(\d+\.\d+\.\d+\.\d+)\s+dev\s+\S+\s+lladdr\s+([0-9a-fA-F:]{17})\s+(\w+)", line)
            if m and m.group(3).upper() in ("REACHABLE", "STALE", "DELAY", "PROBE", "PERMANENT"):
                mac = _norm_mac(m.group(2))
                if mac:
                    table[m.group(1)] = mac
        if table:
            return table
    except Exception:
        pass
    try:
        out = subprocess.check_output(["arp", "-an"], text=True, stderr=subprocess.DEVNULL)
        for line in out.splitlines():
            # "? (192.168.0.1) at 3c:37:86:1:2:3 on en0 ifscope [ethernet]"
            if "incomplete" in line.lower():
                continue
            m = re.search(r"\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9a-fA-F]{1,2}(?::[0-9a-fA-F]{1,2}){5})", line)
            if m:
                mac = _norm_mac(m.group(2))
                if mac:
                    table[m.group(1)] = mac
    except Exception:
        pass
    return table


def discover_hosts_native(cidr):
    """Fase 1 sem nmap: ping sweep em paralelo (popula a tabela ARP do kernel como
    efeito colateral — mesmo host que IGNORA o ICMP precisa responder ARP pra
    receber o pacote, então passa a existir na tabela) e depois lê a tabela. É o
    equivalente nativo do `nmap -PR`, e não precisa de root. Retorna {ip: mac|None}."""
    ips, overflow = _hosts_in_cidr(cidr)
    if overflow:
        warn(f"{cidr} é grande demais pra varredura nativa — limitando aos primeiros "
             f"{MAX_NATIVE_HOSTS} hosts. Instale/embarque o nmap pra varrer o CIDR inteiro.")
    if not ips:
        return {}
    responded = set()

    def ping(ip):
        try:
            r = subprocess.run(_ping_cmd(ip), stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, timeout=3)
            if r.returncode == 0:
                responded.add(ip)
        except Exception:
            pass

    # 2 rodadas: dispositivo WiFi (celular/notebook) entra em power-save e ignora a
    # primeira sonda — sem retry o ARP nunca resolve e ele some. Cada ping popula o
    # cache ARP mesmo com o ICMP dropado; um settle antes de ler deixa assentar.
    for _ in range(2):
        with concurrent.futures.ThreadPoolExecutor(max_workers=128) as ex:
            list(ex.map(ping, ips))
        time.sleep(0.5)

    neigh = _read_neighbors()
    alive = {}
    for ip in ips:
        mac = neigh.get(ip)
        # Vivo se respondeu ao ping OU se tem entrada ARP resolvida (host que
        # dropa ICMP mas responde ARP — o endpoint endurecido que mais interessa).
        if ip in responded or mac:
            alive[ip] = mac
    return alive


def scan_ports_native(ips):
    """Fase 2 sem nmap: TCP connect (socket.connect_ex) em paralelo. Sem versão de
    serviço, OS, fabricante do MAC nem SMBv1 — isso é o que o nmap agrega. Retorna
    hosts no mesmo shape de parse_nmap (openPorts só com o número da porta)."""
    if not ips:
        return []
    results = {ip: [] for ip in ips}

    def probe(pair):
        ip, port = pair
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1.0)
        try:
            if s.connect_ex((ip, port)) == 0:
                results[ip].append(port)
        except OSError:
            pass
        finally:
            s.close()

    pairs = [(ip, p) for ip in ips for p in NATIVE_PORTS]
    with concurrent.futures.ThreadPoolExecutor(max_workers=256) as ex:
        list(ex.map(probe, pairs))

    hosts = []
    for ip in ips:
        open_ports = [{"port": p, "proto": "tcp", "service": None, "product": None, "version": None}
                      for p in sorted(results[ip])]
        hosts.append({
            "ip": ip, "mac": None, "macVendor": None, "hostname": None,
            "os": None, "openPorts": open_ports, "protocols": [],
        })
    return hosts


def resolve_hostname(ip):
    """DNS reverso (PTR). No modo nativo é o único sinal de nome — e classify.js
    tem um fallback inteiro baseado em hostname pra endpoint endurecido que só
    responde ARP. O nmap já traz isto no XML, então só usamos aqui."""
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        return None


def report(hosts, trigger, scanned_cidrs, warnings):
    payload = {
        "trigger": trigger,
        "agent": {"hostname": socket.gethostname(), "os": sys.platform,
                  "version": VERSION, "privileged": is_root()},
        # O backend só marca host como "sumido" dentro dos CIDRs que ESTA coleta
        # varreu — sem isto, um agente cobrindo uma sub-rede apagaria as outras.
        "scannedCidrs": scanned_cidrs,
        "warnings": warnings,
        "hosts": hosts,
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{RIFT_URL}/api/internal-networks/ingest",
        data=data, method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Rift-Agent-Token": RIFT_TOKEN,
            # User-Agent de navegador: sem isto, o Cloudflare na frente do Rift
            # bloqueia a requisição (403 "error code: 1010") por parecer bot antes
            # de chegar ao backend.
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            print(f"[agente] enviado: {len(hosts)} host(s) → {r.status} {r.read().decode()}", file=sys.stderr)
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:200]
        if e.code == 403 and "1010" in detail:
            detail += " (bloqueio do Cloudflare — verifique RIFT_URL/atualize o agente)"
        print(f"[agente] falha no envio: {e.code} {detail}", file=sys.stderr)
    except Exception as e:
        print(f"[agente] falha no envio: {e}", file=sys.stderr)


def scan_once(targets, trigger, warnings, nmap):
    """Um ciclo completo. Com nmap: descoberta + enriquecimento (versão/OS/SMBv1).
    Sem nmap: descoberta nativa (ping+ARP) + connect scan, preenchendo MAC (tabela
    ARP) e hostname (DNS reverso) no lugar do que o nmap traria."""
    run_warnings = list(warnings)
    alive = {}  # ip -> mac|None
    for t in targets:
        mode = "nmap" if nmap else "nativo"
        print(f"[agente] descobrindo hosts em {t} ({mode}) ...", file=sys.stderr)
        if nmap:
            for ip in discover_hosts_nmap(t, nmap):
                alive.setdefault(ip, None)
        else:
            for ip, mac in discover_hosts_native(t).items():
                if mac or ip not in alive:
                    alive[ip] = mac
        print(f"[agente]   {len(alive)} host(s) vivos (acumulado)", file=sys.stderr)

    ips = sorted(alive)
    if not ips:
        run_warnings.append("Nenhum host respondeu. Rede com isolamento de cliente "
                            "(Wi-Fi corporativo) ou agente fora do segmento?")

    print(f"[agente] varrendo portas de {len(ips)} host(s) ({'nmap' if nmap else 'nativo'}) ...", file=sys.stderr)
    if nmap:
        hosts = parse_nmap(scan_ports_nmap(ips, nmap))
    else:
        hosts = scan_ports_native(ips)
        for h in hosts:
            if not h.get("mac") and alive.get(h["ip"]):
                h["mac"] = alive[h["ip"]]
            if not h.get("hostname"):
                h["hostname"] = resolve_hostname(h["ip"])

    seen, uniq = set(), []
    for h in hosts:
        if h["ip"] in seen:
            continue
        seen.add(h["ip"])
        uniq.append(h)
    print(f"[agente] {len(uniq)} host(s) inventariados", file=sys.stderr)
    report(uniq, trigger, targets, run_warnings)


def main():
    if not RIFT_URL or not RIFT_TOKEN:
        die("defina RIFT_URL e RIFT_TOKEN (variáveis de ambiente).")
    args = sys.argv[1:]
    watch = 0
    if "--watch" in args:
        i = args.index("--watch")
        try:
            watch = int(args[i + 1])
        except (IndexError, ValueError):
            die("--watch precisa de um intervalo em segundos, ex.: --watch 900")
        del args[i:i + 2]
    allow_virtual = "--allow-virtual" in args
    if allow_virtual:
        args.remove("--allow-virtual")

    explicit = [a for a in args if not a.startswith("-")]
    if explicit:
        targets, warnings = explicit, []
    else:
        targets, warnings = local_cidrs()

    if not targets:
        die("nenhuma sub-rede local real detectada. " +
            (warnings[0] if warnings else "Passe um CIDR explícito, ex.: 192.168.0.0/24"))
    if warnings and is_wsl() and not explicit and not allow_virtual:
        # Falhar alto é proposital: um inventário da rede virtual do WSL entra no
        # painel parecendo legítimo, com score de risco e tudo. Melhor não coletar.
        die(warnings[0] + "\n  Para coletar assim mesmo: --allow-virtual")

    # nmap é opcional: resolve, verifica que executa, e degrada pra nativo se faltar.
    nmap = find_nmap()
    if nmap and not nmap_works(nmap):
        warn(f"nmap em {nmap} não executou — usando varredura nativa")
        nmap = None
    if nmap:
        print(f"[agente] nmap: {nmap}", file=sys.stderr)
        if not is_root():
            warn("sem root — nmap não faz ARP ping, SYN scan nem detecção de OS. "
                 "A cobertura cai muito. Use sudo -E.")
    else:
        warnings.append(
            "nmap não encontrado — varredura nativa (TCP connect + tabela ARP). Sem "
            "versão de serviço, detecção de OS, fabricante do MAC nem SMBv1. Para "
            "cobertura completa: instale o nmap OU largue um nmap portátil na pasta "
            "do agente (ou aponte $RIFT_NMAP)."
        )
        warn(warnings[-1])
    print(f"[agente] alvos: {', '.join(targets)}", file=sys.stderr)

    if watch:
        print(f"[agente] modo contínuo: re-escaneando a cada {watch}s. Ctrl+C para parar.", file=sys.stderr)
        first = True
        while True:
            scan_once(targets, "agent" if first else "watch", warnings, nmap)
            first = False
            time.sleep(watch)
    else:
        scan_once(targets, "agent", warnings, nmap)


if __name__ == "__main__":
    main()
