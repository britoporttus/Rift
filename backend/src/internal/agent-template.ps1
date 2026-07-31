# Rift - agente de descoberta de rede interna (Windows).
#
# Roda DENTRO da rede do cliente e reporta para a plataforma. Sem dependencia:
# usa so o que existe em qualquer Windows 10/11 e Server 2016+ (PowerShell 5.1).
# Se o nmap estiver disponivel, usa ele para enriquecer (versao de servico +
# deteccao de OS + SMBv1 real); se nao, degrada para varredura nativa em vez de
# falhar. nmap e OPCIONAL: instalar nao e obrigatorio - basta $env:RIFT_NMAP
# apontando pro binario, ou um nmap.exe portatil largado na pasta deste script.
#
# Uso (PowerShell COMO ADMINISTRADOR):
#   $env:RIFT_URL='https://rift.exemplo'; $env:RIFT_TOKEN='xxxx'
#   .\rift-agente.ps1
#   .\rift-agente.ps1 -Watch 900 192.168.0.0/24
#
# Sem CIDR, detecta as sub-redes locais automaticamente - descartando adaptadores
# virtuais (Hyper-V, WSL, VMware, VirtualBox, VPN), que nao sao a rede do cliente.
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)] [string[]] $Cidrs,
    [int] $Watch = 0,
    [switch] $AllowVirtual
)

$ErrorActionPreference = 'Stop'
$VERSION = '2.1'
$RIFT_URL = ($env:RIFT_URL -replace '/+$', '')
$RIFT_TOKEN = $env:RIFT_TOKEN

# Portas da varredura nativa. Lista curada, nao 1-1024: em PowerShell puro cada
# porta custa uma conexao TCP, entao aqui entra so o que alguma regra do Rift
# (classify.js / analyze.js) realmente usa. Com nmap disponivel a varredura e mais ampla.
$PORTS = @(
    21, 22, 23, 25, 53, 69, 80, 88, 110, 111, 135, 139, 143, 161, 389, 427, 443, 445,
    465, 512, 513, 514, 515, 554, 587, 631, 636, 902, 993, 995,
    1433, 1521, 2049, 2179, 3306, 3389, 5060, 5061, 5432, 5480, 5900, 5901, 5985, 5986,
    5989, 6379, 8000, 8006, 8080, 8443, 9100, 9200, 9443, 27017
)

# Adaptadores que nunca sao a rede do cliente.
$VIRTUAL_ADAPTER_RE = 'Hyper-V|Virtual (Ethernet|Adapter)|VMware|VirtualBox|VBox|Loopback|WSL|TAP-|OpenVPN|WireGuard|Bluetooth|WAN Miniport|Npcap'

function Write-Log($msg) { Write-Host "[agente] $msg" -ForegroundColor DarkGray }
function Write-Warn($msg) { Write-Host "[agente] AVISO: $msg" -ForegroundColor Yellow }
function Die($msg) { Write-Host "[agente] ERRO: $msg" -ForegroundColor Red; exit 1 }

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    return (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-LocalSubnets {
    <# Sub-redes reais -> @{ cidrs; warnings }. Descarta virtuais em vez de
       escanea-las: reportar a rede do WSL/Hyper-V como se fosse a LAN do cliente
       produz um inventario falso, que e pior que inventario nenhum. #>
    $cidrs = New-Object System.Collections.Generic.HashSet[string]
    $warnings = @()
    $skipped = @()

    $addrs = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
             Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' }
    foreach ($a in $addrs) {
        $adapter = Get-NetAdapter -InterfaceIndex $a.InterfaceIndex -ErrorAction SilentlyContinue
        $desc = if ($adapter) { "$($adapter.InterfaceDescription) $($adapter.Name)" } else { $a.InterfaceAlias }
        if ($desc -match $VIRTUAL_ADAPTER_RE) {
            $skipped += "$($a.InterfaceAlias)=$($a.IPAddress) (adaptador virtual)"
            continue
        }
        if ($adapter -and $adapter.Status -ne 'Up') { continue }
        $prefix = [int]$a.PrefixLength
        if ($prefix -lt 24) { $prefix = 24 }   # nao escanear /8 sem querer
        if ($prefix -ge 32) {
            $skipped += "$($a.InterfaceAlias)=$($a.IPAddress)/32 (nao e sub-rede)"
            continue
        }
        $octets = $a.IPAddress.Split('.')
        # Só suportamos rede base /24 aqui; prefixos entre 24 e 31 sao tratados
        # como o /24 que os contem, igual ao agente Linux.
        $null = $cidrs.Add("$($octets[0]).$($octets[1]).$($octets[2]).0/24")
    }

    foreach ($s in $skipped) { Write-Warn "ignorando $s" }
    if ($skipped.Count -gt 0 -and $cidrs.Count -eq 0) {
        $warnings += "Nenhuma sub-rede real encontrada - so adaptadores virtuais: $($skipped -join '; ')"
    }
    return @{ cidrs = @($cidrs | Sort-Object); warnings = $warnings }
}

function Invoke-ArpSweep($cidr) {
    <# Descoberta layer 2. Um ping sweep popula a tabela ARP; depois lemos a
       tabela. O truque: mesmo host que IGNORA o ping (Defender/Intune bloqueia
       ICMP por padrao no perfil de dominio) precisa responder ARP para existir
       na rede - entao ele aparece em Get-NetNeighbor mesmo sem responder ao ping.
       E o equivalente nativo do `nmap -PR`. #>
    $base = $cidr -replace '\.0/24$', ''
    Write-Log "descobrindo hosts em $cidr (ARP sweep)..."

    # 2 rodadas com timeout folgado (1s). Dispositivo WiFi (celular/notebook) entra
    # em power-save e IGNORA a primeira sonda — sem retry o ARP nunca resolve e ele
    # some do inventario. Cada ping tambem popula o cache ARP mesmo com o ICMP dropado,
    # entao 2 rodadas + um settle antes da leitura aumentam muito a cobertura em WiFi.
    for ($round = 1; $round -le 2; $round++) {
        $pings = @()
        foreach ($i in 1..254) {
            $p = New-Object System.Net.NetworkInformation.Ping
            $pings += [pscustomobject]@{ Task = $p.SendPingAsync("$base.$i", 1000); Ping = $p }
        }
        try { [Threading.Tasks.Task]::WaitAll(@($pings.Task), 12000) | Out-Null } catch {}
        foreach ($p in $pings) { $p.Ping.Dispose() }
        Start-Sleep -Milliseconds 500   # deixa o cache ARP assentar antes de reler/repetir
    }

    $found = @{}
    Get-NetNeighbor -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.State -in @('Reachable', 'Stale', 'Delay', 'Probe', 'Permanent') } |
        Where-Object { $_.IPAddress -like "$base.*" } |
        ForEach-Object {
            $mac = if ($_.LinkLayerAddress -and $_.LinkLayerAddress -ne '00-00-00-00-00-00') {
                $_.LinkLayerAddress.ToUpper().Replace('-', ':')
            } else { $null }
            $found[$_.IPAddress] = $mac
        }
    Write-Log "  $($found.Count) host(s) vivos"
    return $found
}

function Invoke-NativePortScan($ip) {
    <# Conexoes TCP em paralelo. Usa BeginConnect, NAO ConnectAsync: a sobrecarga
       ConnectAsync(string,int) nao resolve no .NET Framework do Windows PowerShell
       5.1 ("nao foi possivel localizar uma sobrecarga para ConnectAsync"), enquanto
       BeginConnect(string,int,AsyncCallback,Object) existe desde o .NET 2.0 e roda
       em qualquer versao (5.1 e 7+). Nao usa Test-NetConnection: ele serializa e
       levaria minutos por host. #>
    $open = @()
    $tries = @()
    foreach ($port in $PORTS) {
        $c = New-Object System.Net.Sockets.TcpClient
        try {
            $iar = $c.BeginConnect($ip, [int]$port, $null, $null)
            $tries += [pscustomobject]@{ Port = $port; Client = $c; Result = $iar }
        } catch { try { $c.Close() } catch {} }
    }
    Start-Sleep -Milliseconds 1200
    foreach ($t in $tries) {
        $isOpen = $false
        try {
            if ($t.Result.IsCompleted) {
                $t.Client.EndConnect($t.Result)   # lanca se a porta esta fechada/sem resposta
                $isOpen = $t.Client.Connected
            }
        } catch {}
        if ($isOpen) {
            $open += @{ port = $t.Port; proto = 'tcp'; service = $null; product = $null; version = $null }
        }
        try { $t.Client.Close() } catch {}
    }
    return $open
}

function Resolve-HostName($ip) {
    try { return [System.Net.Dns]::GetHostEntry($ip).HostName } catch { return $null }
}

function Get-NmapPath {
    <# Resolve o nmap ou retorna $null. Ordem: $env:RIFT_NMAP -> nmap.exe ao lado
       deste script (portatil, sem instalacao) -> PATH -> local de instalacao
       padrao. Largar um nmap.exe portatil na pasta do agente da cobertura
       completa sem instalar nada (o nmap acha os dados na propria pasta do exe). #>
    if ($env:RIFT_NMAP -and (Test-Path $env:RIFT_NMAP)) { return $env:RIFT_NMAP }
    $here = if ($PSCommandPath) { Split-Path -Parent $PSCommandPath } else { $null }
    if ($here) {
        $bundled = Join-Path $here 'nmap.exe'
        if (Test-Path $bundled) { return $bundled }
    }
    $c = Get-Command nmap -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    foreach ($p in @("$env:ProgramFiles\Nmap\nmap.exe", "${env:ProgramFiles(x86)}\Nmap\nmap.exe")) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

function Test-Npcap {
    <# Npcap presente? No Windows, -O (deteccao de OS) e -sS (SYN) exigem captura
       de pacote cru (Npcap). Sem Npcap, o nmap so faz connect scan (-sT) — que
       ainda entrega versao de servico e SMBv1 (script NSE), mas nao OS. #>
    if (Get-Service -Name npcap -ErrorAction SilentlyContinue) { return $true }
    foreach ($p in @("$env:SystemRoot\System32\Npcap\wpcap.dll", "$env:SystemRoot\System32\wpcap.dll")) {
        if (Test-Path $p) { return $true }
    }
    return $false
}

function Invoke-NmapScan($nmap, $ips) {
    <# Enriquecimento opcional: versao de servico, SMBv1 real (script smb-protocols)
       e OS. -Pn porque a descoberta ja aconteceu no ARP sweep. Retorna
       @{ ByIp = <hash ip->dados>; Warn = <aviso pro painel ou $null> }. #>
    # Lista curada (~54 portas) em vez de 1-1024: o -sV sobre 1024 portas era ~20x
    # mais trabalho sem ganho de classificacao. Somado a host-timeout 120s,
    # max-retries 1 e min-hostgroup 32 (varre os hosts em paralelo).
    $spec = ($PORTS -join ',')
    $tmp = [IO.Path]::GetTempFileName()
    $hasNpcap = Test-Npcap
    # -sT (connect) SEMPRE: como Administrador o nmap defaultaria pra -sS (SYN), que
    # EXIGE Npcap; numa maquina sem Npcap ele sai com erro e a gente perdia ate o
    # -sV/SMBv1 que o connect scan consegue sem driver nenhum. Connect scan cobre
    # versao de servico + NSE; so a deteccao de OS fica de fora sem Npcap.
    $nmapArgs = @('-oX', $tmp, '-Pn', '-sT', '-p', $spec, '-sV', '--version-intensity', '2', '-T4',
                  '--host-timeout', '120s', '--max-retries', '1', '--min-hostgroup', '32',
                  '--script', 'smb-protocols', '--script-timeout', '20s')
    # OS detection so quando ha Npcap (pacote cru) + privilegio. Sem isto, o nmap
    # tentaria -O, falharia, e o codigo de saida != 0 derrubava o resto do resultado.
    if ($hasNpcap -and (Test-Admin)) { $nmapArgs += @('-O', '--osscan-limit', '--max-os-tries', '1') }
    $nmapArgs += $ips
    $modo = if ($hasNpcap) { '' } else { ' (sem Npcap: connect scan, sem OS)' }
    Write-Log "nmap ($nmap) enriquecendo $($ips.Count) host(s)$modo..."
    # Sucesso se julga pelo CODIGO DE SAIDA (0 = ok, mesmo com warnings), nao por ter
    # escrito no stderr. 'Continue' local evita que um WARNING do nmap (comum em -sV,
    # ex.: "soft-matched rtsp/sip" em gateway/camera) vire erro terminante sob o
    # ErrorActionPreference='Stop' do topo do script e descarte um XML valido.
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $code = $null
    try { & $nmap @nmapArgs 2>$null | Out-Null; $code = $LASTEXITCODE }
    catch { $code = -1 }
    finally { $ErrorActionPreference = $prevEAP }

    if ($code -ne 0 -or -not (Test-Path $tmp) -or (Get-Item $tmp).Length -eq 0) {
        Write-Warn "nmap nao completou (codigo $code) - seguindo so com a varredura nativa"
        Remove-Item $tmp -ErrorAction SilentlyContinue
        return [pscustomobject]@{ ByIp = @{}; Warn = "nmap encontrado ($nmap) mas falhou (codigo $code) - inventario caiu pra varredura nativa (sem versao de servico/OS/SMBv1). Verifique a instalacao do nmap e do Npcap." }
    }
    try { [xml]$xml = Get-Content $tmp -Raw }
    catch {
        Write-Warn "nmap: XML invalido - seguindo so com a varredura nativa"
        Remove-Item $tmp -ErrorAction SilentlyContinue
        return [pscustomobject]@{ ByIp = @{}; Warn = "nmap encontrado ($nmap) devolveu XML invalido - inventario caiu pra varredura nativa." }
    }
    Remove-Item $tmp -ErrorAction SilentlyContinue

    $byIp = @{}
    foreach ($h in $xml.nmaprun.host) {
        if ($h.status.state -ne 'up') { continue }
        $ip = ($h.address | Where-Object { $_.addrtype -eq 'ipv4' } | Select-Object -First 1).addr
        if (-not $ip) { continue }
        $ports = @()
        foreach ($p in $h.ports.port) {
            if ($p.state.state -ne 'open') { continue }
            $ports += @{
                port = [int]$p.portid; proto = $p.protocol
                service = $p.service.name; product = $p.service.product; version = $p.service.version
            }
        }
        $protocols = @()
        foreach ($s in $h.hostscript.script) {
            if ($s.id -eq 'smb-protocols' -and ($s.output -match '(?i)SMBv1|NT LM 0\.12')) { $protocols += 'smbv1' }
        }
        $byIp[$ip] = @{
            ports = $ports; protocols = $protocols
            os = ($h.os.osmatch | Select-Object -First 1).name
            mac = ($h.address | Where-Object { $_.addrtype -eq 'mac' } | Select-Object -First 1).addr
            macVendor = ($h.address | Where-Object { $_.addrtype -eq 'mac' } | Select-Object -First 1).vendor
        }
    }
    # Sem Npcap o inventario e bom (servico + SMBv1) mas nao tem OS/MAC-vendor:
    # avisa como chegar la, sem tratar como falha (o resultado ja e util).
    $warn = if (-not $hasNpcap) {
        'nmap sem Npcap: versoes de servico e SMBv1 OK, mas SEM deteccao de OS nem fabricante do MAC. Instale o Npcap (https://npcap.com) para OS/ARP/SYN.'
    } else { $null }
    return [pscustomobject]@{ ByIp = $byIp; Warn = $warn }
}

function Send-Report($hosts, $trigger, $scannedCidrs, $warnings) {
    $payload = @{
        trigger = $trigger
        agent = @{ hostname = $env:COMPUTERNAME; os = 'win32'; version = $VERSION; privileged = (Test-Admin) }
        # O backend so marca host como "sumido" dentro dos CIDRs que ESTA coleta
        # varreu - sem isto, um agente cobrindo uma sub-rede apagaria as outras.
        scannedCidrs = @($scannedCidrs)
        warnings = @($warnings)
        hosts = @($hosts)
    } | ConvertTo-Json -Depth 8 -Compress

    $headers = @{
        'X-Rift-Agent-Token' = $RIFT_TOKEN
        # User-Agent de navegador: sem isto o Cloudflare na frente do Rift bloqueia
        # a requisicao (403 "error code: 1010") por parecer bot.
        'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
        'Accept' = 'application/json'
    }
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $r = Invoke-RestMethod -Uri "$RIFT_URL/api/internal-networks/ingest" -Method Post `
             -Body ([Text.Encoding]::UTF8.GetBytes($payload)) -ContentType 'application/json' `
             -Headers $headers -TimeoutSec 60
        Write-Log "enviado: $($hosts.Count) host(s) -> $($r | ConvertTo-Json -Compress)"
    } catch {
        Write-Warn "falha no envio: $($_.Exception.Message)"
    }
}

function Invoke-ScanOnce($targets, $trigger, $warnings) {
    $alive = @{}
    foreach ($t in $targets) {
        foreach ($kv in (Invoke-ArpSweep $t).GetEnumerator()) { $alive[$kv.Key] = $kv.Value }
    }
    $runWarnings = @($warnings)
    if ($alive.Count -eq 0) {
        $runWarnings += 'Nenhum host respondeu. Rede com isolamento de cliente (Wi-Fi corporativo) ou agente fora do segmento?'
    }

    $ips = @($alive.Keys | Sort-Object)
    $nmap = Get-NmapPath
    $enrich = @{}
    if ($nmap -and $ips.Count -gt 0) {
        $res = Invoke-NmapScan $nmap $ips
        $enrich = $res.ByIp
        if ($res.Warn) { $runWarnings += $res.Warn }
    }
    if (-not $nmap) {
        # Igual ao agente Python: coleta degradada vira aviso VISIVEL no painel, nao
        # so log local - inventario sem nmap nao pode passar por inventario completo.
        $msg = 'nmap nao encontrado - varredura nativa (TCP connect + tabela ARP). Sem versao de servico, deteccao de OS, fabricante do MAC nem SMBv1. Para cobertura completa: instale o nmap, aponte $env:RIFT_NMAP, ou largue um nmap.exe na pasta do agente.'
        Write-Log $msg
        $runWarnings += $msg
    }

    $hosts = @()
    foreach ($ip in $ips) {
        $e = $enrich[$ip]
        $ports = if ($e -and $e.ports.Count -gt 0) { $e.ports } else { Invoke-NativePortScan $ip }
        $hosts += @{
            ip = $ip
            mac = if ($alive[$ip]) { $alive[$ip] } elseif ($e) { $e.mac } else { $null }
            macVendor = if ($e) { $e.macVendor } else { $null }
            hostname = Resolve-HostName $ip
            os = if ($e) { $e.os } else { $null }
            openPorts = @($ports)
            protocols = if ($e) { @($e.protocols) } else { @() }
        }
    }
    Write-Log "$($hosts.Count) host(s) inventariados"
    Send-Report $hosts $trigger $targets $runWarnings
}

# ── main ────────────────────────────────────────────────────────────────────
if (-not $RIFT_URL -or -not $RIFT_TOKEN) { Die 'defina RIFT_URL e RIFT_TOKEN (variaveis de ambiente).' }
if (-not (Test-Admin)) {
    Write-Warn 'sem privilegio de Administrador - a tabela ARP e a deteccao de OS ficam limitadas. Reabra o PowerShell como Administrador.'
}

$explicit = @($Cidrs | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+/\d+$' })
if ($explicit.Count -gt 0) {
    $targets = $explicit; $warnings = @()
} else {
    $detected = Get-LocalSubnets
    $targets = $detected.cidrs; $warnings = $detected.warnings
}

if ($targets.Count -eq 0) {
    Die ("nenhuma sub-rede local real detectada. " + $(if ($warnings.Count) { $warnings[0] } else { 'Passe um CIDR explicito, ex.: 192.168.0.0/24' }))
}
Write-Log "alvos: $($targets -join ', ')"

if ($Watch -gt 0) {
    Write-Log "modo continuo: re-escaneando a cada ${Watch}s. Ctrl+C para parar."
    $first = $true
    while ($true) {
        Invoke-ScanOnce $targets $(if ($first) { 'agent' } else { 'watch' }) $warnings
        $first = $false
        Start-Sleep -Seconds $Watch
    }
} else {
    Invoke-ScanOnce $targets 'agent' $warnings
}
