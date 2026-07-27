#!/usr/bin/env python3
# Rift — agente de descoberta de rede interna.
#
# Roda DENTRO da rede do cliente (o VPS do Rift não a alcança), escaneia com nmap
# e reporta os resultados para a plataforma automaticamente. Só depende de nmap +
# Python 3 (stdlib). Rode como root para detecção de OS/MAC completa.
#
# Uso:
#   RIFT_URL=https://rift.exemplo RIFT_TOKEN=xxxx sudo -E python3 agente.py [CIDR ...]
#   # contínuo (re-escaneia a cada 15 min):
#   RIFT_URL=... RIFT_TOKEN=... sudo -E python3 agente.py --watch 900 192.168.0.0/24
#
# Sem CIDR, detecta as sub-redes locais automaticamente.
import os
import sys
import time
import json
import socket
import ipaddress
import subprocess
import urllib.request
import xml.etree.ElementTree as ET

VERSION = "1.0"
RIFT_URL = os.environ.get("RIFT_URL", "").rstrip("/")
RIFT_TOKEN = os.environ.get("RIFT_TOKEN", "")


def die(msg):
    print(f"[agente] ERRO: {msg}", file=sys.stderr)
    sys.exit(1)


def local_cidrs():
    """Descobre as sub-redes /24 locais a partir dos IPs das interfaces."""
    cidrs = set()
    try:
        out = subprocess.check_output(["ip", "-o", "-4", "addr", "show"], text=True)
        for line in out.splitlines():
            parts = line.split()
            for p in parts:
                if "/" in p and not p.startswith("127."):
                    try:
                        net = ipaddress.ip_network(p, strict=False)
                        if net.prefixlen < 24:  # limita a /24 pra não escanear /8 sem querer
                            net = ipaddress.ip_network(f"{net.network_address}/24", strict=False)
                        if net.is_private:
                            cidrs.add(str(net))
                    except ValueError:
                        pass
    except Exception:
        # fallback: IP do socket de saída
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            cidrs.add(str(ipaddress.ip_network(ip + "/24", strict=False)))
        except Exception:
            pass
    return sorted(cidrs)


def run_nmap(targets):
    """Roda nmap com detecção de serviço/OS e devolve o XML."""
    is_root = (os.geteuid() == 0) if hasattr(os, "geteuid") else False
    args = ["nmap", "-oX", "-", "--top-ports", "1000", "-sV", "-T4",
            "--host-timeout", "90s", "--max-retries", "2"]
    if is_root:
        args += ["-O", "-sS"]  # OS detection + SYN scan exigem root
    else:
        print("[agente] aviso: sem root — sem detecção de OS/MAC. Rode com sudo p/ inventário completo.", file=sys.stderr)
    args += targets
    print(f"[agente] nmap {' '.join(targets)} ...", file=sys.stderr)
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
        protocols = []
        for p in h.findall("ports/port"):
            st = p.find("state")
            if st is None or st.get("state") != "open":
                continue
            svc = p.find("service")
            entry = {
                "port": int(p.get("portid")),
                "proto": p.get("protocol", "tcp"),
                "service": svc.get("name") if svc is not None else None,
                "product": svc.get("product") if svc is not None else None,
                "version": svc.get("version") if svc is not None else None,
            }
            ports.append(entry)
            # marca SMBv1 se o script detectar (best-effort)
            if svc is not None and (svc.get("name") or "").startswith("microsoft-ds"):
                protocols.append("smb")
        if not ip:
            continue
        hosts.append({
            "ip": ip, "mac": mac, "macVendor": vendor, "hostname": hostname,
            "os": os_name, "openPorts": ports, "protocols": protocols,
        })
    return hosts


def report(hosts, trigger):
    payload = {
        "trigger": trigger,
        "agent": {"hostname": socket.gethostname(), "os": sys.platform, "version": VERSION},
        "hosts": hosts,
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{RIFT_URL}/api/internal-networks/ingest",
        data=data, method="POST",
        headers={"Content-Type": "application/json", "X-Rift-Agent-Token": RIFT_TOKEN},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read().decode()
            print(f"[agente] enviado: {len(hosts)} host(s) → {r.status} {body}", file=sys.stderr)
    except urllib.error.HTTPError as e:
        print(f"[agente] falha no envio: {e.code} {e.read().decode()[:200]}", file=sys.stderr)
    except Exception as e:
        print(f"[agente] falha no envio: {e}", file=sys.stderr)


def scan_once(targets, trigger):
    all_hosts = []
    for t in targets:
        all_hosts.extend(parse_nmap(run_nmap([t])))
    # dedup por IP
    seen, uniq = set(), []
    for h in all_hosts:
        if h["ip"] in seen:
            continue
        seen.add(h["ip"])
        uniq.append(h)
    print(f"[agente] {len(uniq)} host(s) descobertos", file=sys.stderr)
    report(uniq, trigger)


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
    targets = args or local_cidrs()
    if not targets:
        die("nenhuma sub-rede local detectada; passe um CIDR, ex.: 192.168.0.0/24")

    if watch:
        print(f"[agente] modo contínuo: re-escaneando a cada {watch}s. Ctrl+C para parar.", file=sys.stderr)
        first = True
        while True:
            scan_once(targets, "agent" if first else "watch")
            first = False
            time.sleep(watch)
    else:
        scan_once(targets, "agent")


if __name__ == "__main__":
    main()
