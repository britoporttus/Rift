// Análise de segurança de host + score de rede — funções PURAS (estilo asm/score.js).
// Regras determinísticas sobre serviços/portas. Sem LLM.

// Serviços/portas inseguros → severidade + rótulo. Cada regra é (match, sev, label).
// match recebe { ports:Set, svc:(…)=>bool } e devolve bool.
const RULES = [
  { sev: 'high',   label: 'Telnet exposto (texto claro)',        test: (c) => c.ports.has(23) || c.svc('telnet') },
  { sev: 'high',   label: 'SMBv1 habilitado',                    test: (c) => c.protocols.has('smbv1') },
  // SLP em ESXi é o vetor do ESXiArgs (CVE-2021-21974): ransomware que cifrou
  // milhares de hosts em 2023 sem autenticação. Vale high sozinho.
  { sev: 'high',   label: 'SLP exposto em hypervisor (vetor ESXiArgs/CVE-2021-21974)',
    test: (c) => c.isHypervisor && (c.ports.has(427) || c.svc('slp', 'svrloc')) },
  { sev: 'medium', label: 'Interface de gerência de hypervisor exposta na rede',
    test: (c) => c.isHypervisor && [443, 5480, 8006, 9443].some((p) => c.ports.has(p)) },
  { sev: 'medium', label: 'CIM/gerência de hardware exposta (5989)',
    test: (c) => c.ports.has(5989) },
  { sev: 'high',   label: 'rlogin/rsh/rexec exposto',            test: (c) => c.ports.has(513) || c.ports.has(514) || c.ports.has(512) },
  { sev: 'medium', label: 'FTP exposto (texto claro)',           test: (c) => c.ports.has(21) || c.svc('ftp') },
  { sev: 'medium', label: 'RDP exposto',                         test: (c) => c.ports.has(3389) || c.svc('ms-wbt', 'rdp') },
  { sev: 'medium', label: 'VNC exposto',                         test: (c) => [5900, 5901, 5902].some((p) => c.ports.has(p)) || c.svc('vnc') },
  { sev: 'medium', label: 'SNMP exposto',                        test: (c) => c.ports.has(161) || c.svc('snmp') },
  { sev: 'medium', label: 'Compartilhamento SMB/NetBIOS exposto', test: (c) => c.ports.has(445) || c.ports.has(139) },
  { sev: 'medium', label: 'Banco de dados exposto na rede',      test: (c) => [3306, 5432, 1433, 27017, 6379, 9200].some((p) => c.ports.has(p)) },
  { sev: 'low',    label: 'HTTP sem TLS',                        test: (c) => c.ports.has(80) && !c.ports.has(443) },
  { sev: 'low',    label: 'TFTP exposto',                        test: (c) => c.ports.has(69) || c.svc('tftp') },
]

const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 }
function worst(a, b) { return SEV_RANK[a] >= SEV_RANK[b] ? a : b }

// analyzeHost(host) → { severity, labels }. Não muta o host.
function analyzeHost(host = {}) {
  const ports = new Set((host.openPorts || []).map((p) => Number(p.port)).filter(Boolean))
  const services = (host.openPorts || []).map((p) => String(p.service || '').toLowerCase())
  const protocols = new Set((host.protocols || []).map((s) => String(s).toLowerCase()))
  const ctx = {
    ports, protocols,
    isHypervisor: host.deviceType === 'hypervisor',
    svc: (...names) => services.some((s) => names.some((n) => s.includes(n))),
  }

  let severity = 'info'
  const labels = []
  for (const r of RULES) {
    if (r.test(ctx)) { labels.push(r.label); severity = worst(severity, r.sev) }
  }
  // Dispositivo não identificado numa rede é sinal por si só (rogue candidato).
  if (host.deviceType === 'unknown') {
    labels.push('Dispositivo não identificado')
    severity = worst(severity, 'low')
  }
  return { severity, labels }
}

const SEV_WEIGHT = { critical: 40, high: 20, medium: 10, low: 3, info: 0 }

function levelFromScore(score) {
  if (score >= 75) return 'critical'
  if (score >= 50) return 'high'
  if (score >= 25) return 'medium'
  if (score > 0)   return 'low'
  return 'info'
}

// computeNetworkScore({ hosts }) → { score, level, reasons } (transparente, 0-100).
// O risco da rede é função exclusiva dos ACHADOS de segurança — NÃO do tamanho
// dela. Uma rede grande e limpa não é arriscada; uma pequena com um banco exposto
// é. Por isso não há mais bônus por "quantidade de hosts". O dispositivo não
// identificado também não conta à parte: ele já entra aqui como achado `low` (via
// analyzeHost), então somá-lo de novo seria contar o mesmo risco duas vezes.
function computeNetworkScore({ hosts = [] } = {}) {
  let score = 0
  const reasons = []

  const bySev = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const h of hosts) {
    if (h.severity && h.severity !== 'info' && bySev[h.severity] != null) bySev[h.severity]++
  }
  for (const sev of ['critical', 'high', 'medium', 'low']) {
    const n = bySev[sev]
    if (!n) continue
    const pts = Math.min(SEV_WEIGHT[sev] * n, SEV_WEIGHT[sev] * 3)  // teto por classe
    score += pts
    reasons.push(`${n} host(s) com achado ${sev} (+${pts})`)
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  return { score, level: levelFromScore(score), reasons: reasons.slice(0, 8) }
}

module.exports = { analyzeHost, computeNetworkScore, levelFromScore }
