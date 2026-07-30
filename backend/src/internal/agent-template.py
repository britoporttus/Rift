#!/usr/bin/env python3
# Rift — agente de descoberta de rede interna (Linux/macOS).
#
# Roda DENTRO da rede do cliente (o VPS do Rift não a alcança), escaneia com nmap
# e reporta os resultados para a plataforma automaticamente. Só depende de nmap +
# Python 3 (stdlib). Rode como root: sem privilégio não há ARP ping nem detecção
# de OS/MAC, e a cobertura despenca em rede com endpoint endurecido.
#
# Uso:
#   RIFT_URL=https://rift.exemplo RIFT_TOKEN=xxxx sudo -E python3 rift-agente.py [CIDR ...]
#   # contínuo (re-escaneia a cada 15 min):
#   RIFT_URL=... RIFT_TOKEN=... sudo -E python3 rift-agente.py --watch 900 192.168.0.0/24
#
# Sem CIDR, detecta as sub-redes locais automaticamente — descartando redes
# virtuais (WSL, Hyper-V, Docker, VPN), que não são a rede do cliente.
import os
import re
import sys
import time
import json
import socket
import ipaddress
import subprocess
import urllib.request
import xml.etree.ElementTree as ET

VERSION = "2.0"
RIFT_URL = os.environ.get("RIFT_URL", "").rstrip("/")
RIFT_TOKEN = os.environ.get("RIFT_TOKEN", "")

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


def discover_hosts(cidr):
    """Fase 1: quem está vivo. ARP ping (-PR) quando root, que é layer 2 e passa
    por firewall de endpoint — Defender/Intune bloqueia ICMP e portas, mas o
    Windows PRECISA responder ARP pra existir na rede. Sem root, cai pra sondas
    ICMP/TCP/UDP variadas, bem menos confiáveis."""
    if is_root():
        args = ["nmap", "-sn", "-PR", "-n", "--max-retries", "2", "-oX", "-", cidr]
    else:
        args = ["nmap", "-sn", "-PE", "-PS443,22,3389,445,80", "-PA80", "-PU161",
                "-n", "--max-retries", "2", "-oX", "-", cidr]
    try:
        xml_text = subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL)
    except FileNotFoundError:
        die("nmap não encontrado. Instale: apt install nmap")
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


def scan_ports(ips):
    """Fase 2: portas/serviços/OS só dos hosts vivos. -Pn é obrigatório aqui — a
    descoberta já aconteceu na fase 1, e sem -Pn o nmap re-sondaria e descartaria
    justamente os hosts endurecidos que o ARP tinha encontrado."""
    if not ips:
        return ""
    # Otimização de tempo: host-timeout 120s (era 180 — cauda de latência com hosts
    # filtrados), max-retries 1, e min-hostgroup 32 pra o nmap varrer os hosts em
    # paralelo em vez de quase-serial. PORT_SPEC já é a lista curada (~54 portas).
    args = ["nmap", "-oX", "-", "-Pn", "-p", PORT_SPEC, "-sV", "--version-intensity", "2",
            "-T4", "--host-timeout", "120s", "--max-retries", "1", "--min-hostgroup", "32",
            "--script", "smb-protocols", "--script-timeout", "20s"]
    if is_root():
        args += ["-O", "--osscan-limit", "--max-os-tries", "1", "-sS"]  # OS + SYN exigem root
    args += ips
    try:
        return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL)
    except FileNotFoundError:
        die("nmap não encontrado. Instale: apt install nmap")
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


def scan_once(targets, trigger, warnings):
    alive = []
    for t in targets:
        print(f"[agente] descobrindo hosts em {t} ...", file=sys.stderr)
        found = discover_hosts(t)
        print(f"[agente]   {len(found)} host(s) vivos", file=sys.stderr)
        alive.extend(found)
    alive = sorted(set(alive))
    run_warnings = list(warnings)
    if not alive:
        run_warnings.append("Nenhum host respondeu. Rede com isolamento de cliente "
                            "(Wi-Fi corporativo) ou agente fora do segmento?")
    print(f"[agente] varrendo portas de {len(alive)} host(s) ...", file=sys.stderr)
    hosts = parse_nmap(scan_ports(alive))
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

    if not is_root():
        warn("sem root — sem ARP ping nem detecção de OS/MAC. A cobertura cai muito. Use sudo -E.")
    print(f"[agente] alvos: {', '.join(targets)}", file=sys.stderr)

    if watch:
        print(f"[agente] modo contínuo: re-escaneando a cada {watch}s. Ctrl+C para parar.", file=sys.stderr)
        first = True
        while True:
            scan_once(targets, "agent" if first else "watch", warnings)
            first = False
            time.sleep(watch)
    else:
        scan_once(targets, "agent", warnings)


if __name__ == "__main__":
    main()
