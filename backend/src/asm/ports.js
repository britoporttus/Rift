// Análise de porta EXTERNA exposta — função pura (estilo asm/score.js). Uma porta
// que é normal dentro da LAN (SMB, RDP, banco) vira achado sério quando está
// aberta na INTERNET. Retorna { severity, label } para o asset de porta.
//
// Diferente do analyze.js do módulo interno: aqui o contexto é internet-facing,
// então o peso é maior (banco/SMB/RDP exposto ao mundo = high).

// port → { sev, label }. `service` (do fingerprint do naabu/nmap) refina quando há.
const PORT_RISK = {
  23:   { sev: 'high',   label: 'Telnet exposto à internet (texto claro)' },
  3389: { sev: 'high',   label: 'RDP exposto à internet' },
  445:  { sev: 'high',   label: 'SMB exposto à internet' },
  139:  { sev: 'high',   label: 'NetBIOS exposto à internet' },
  135:  { sev: 'medium', label: 'RPC (MS-RPC) exposto à internet' },
  512:  { sev: 'high',   label: 'rexec exposto à internet' },
  513:  { sev: 'high',   label: 'rlogin exposto à internet' },
  514:  { sev: 'high',   label: 'rsh exposto à internet' },
  21:   { sev: 'medium', label: 'FTP exposto à internet (texto claro)' },
  69:   { sev: 'medium', label: 'TFTP exposto à internet' },
  5900: { sev: 'high',   label: 'VNC exposto à internet' },
  5901: { sev: 'high',   label: 'VNC exposto à internet' },
  5902: { sev: 'high',   label: 'VNC exposto à internet' },
  5985: { sev: 'medium', label: 'WinRM exposto à internet' },
  5986: { sev: 'medium', label: 'WinRM (TLS) exposto à internet' },
  161:  { sev: 'medium', label: 'SNMP exposto à internet' },
  389:  { sev: 'medium', label: 'LDAP exposto à internet' },
  636:  { sev: 'medium', label: 'LDAPS exposto à internet' },
  // Bancos de dados — nunca deveriam estar na internet.
  3306: { sev: 'high',   label: 'MySQL exposto à internet' },
  5432: { sev: 'high',   label: 'PostgreSQL exposto à internet' },
  1433: { sev: 'high',   label: 'MS SQL Server exposto à internet' },
  1521: { sev: 'high',   label: 'Oracle DB exposto à internet' },
  27017:{ sev: 'high',   label: 'MongoDB exposto à internet' },
  6379: { sev: 'high',   label: 'Redis exposto à internet' },
  9200: { sev: 'high',   label: 'Elasticsearch exposto à internet' },
  11211:{ sev: 'high',   label: 'Memcached exposto à internet' },
  2049: { sev: 'medium', label: 'NFS exposto à internet' },
  873:  { sev: 'medium', label: 'rsync exposto à internet' },
}

// Serviços (por nome do fingerprint) que reforçam risco mesmo em porta atípica.
const SERVICE_RISK = {
  telnet: 'high', ftp: 'medium', rdp: 'high', 'ms-wbt-server': 'high',
  vnc: 'high', mysql: 'high', 'ms-sql-s': 'high', postgresql: 'high',
  mongodb: 'high', redis: 'high', elasticsearch: 'high', smb: 'high',
  'microsoft-ds': 'high', netbios: 'high', snmp: 'medium', ldap: 'medium',
  rsync: 'medium',
}

const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 }
function worst(a, b) { return SEV_RANK[a] >= SEV_RANK[b] ? a : b }

// analyzePort({ port, service }) → { severity, label }. Portas comuns de web
// (80/443/8080/8443) e serviços não-arriscados ficam em 'info' (viram asset, mas
// não achado) — o probe web já é coberto pelo httpx.
function analyzePort({ port, service } = {}) {
  const p = Number(port)
  const svc = String(service || '').toLowerCase()
  let severity = 'info'
  let label = null

  const byPort = PORT_RISK[p]
  if (byPort) { severity = byPort.sev; label = byPort.label }

  for (const [name, sev] of Object.entries(SERVICE_RISK)) {
    if (svc.includes(name)) {
      severity = worst(severity, sev)
      if (!label) label = `${service} exposto à internet`
    }
  }
  return { severity, label }
}

module.exports = { analyzePort, PORT_RISK }
