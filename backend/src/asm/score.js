// Score de risco do domínio — 0..100, TRANSPARENTE: devolve os motivos que o
// compuseram (a UI mostra o "porquê"). Não é um rating de caixa-preta tipo
// BitSight; é uma soma explicável de sinais de superfície + exposição a vazamento.
const SEV_WEIGHT = { critical: 40, high: 25, medium: 12, low: 5, info: 0 }

function levelFromScore(score) {
  if (score >= 75) return 'critical'
  if (score >= 50) return 'high'
  if (score >= 25) return 'medium'
  if (score > 0)   return 'low'
  return 'info'
}

// assets: DomainAsset[]  |  leaks: LeakedCredential[]
function computeScore({ assets = [], leaks = [] } = {}) {
  let score = 0
  const reasons = []

  // 1) Credenciais vazadas — o sinal mais forte.
  const withPw = leaks.filter((l) => l.hasPassword)
  if (leaks.length) {
    const pts = Math.min(30, leaks.length * 4)
    score += pts
    reasons.push(`${leaks.length} vazamento(s) associado(s) ao domínio (+${pts})`)
  }
  if (withPw.length) {
    const pts = Math.min(25, withPw.length * 6)
    score += pts
    reasons.push(`${withPw.length} com senha exposta (+${pts})`)
  }

  // 2) Exposições notáveis (nuclei/probe classificou severidade > info).
  const exposures = assets.filter((a) => a.severity && a.severity !== 'info')
  for (const e of exposures) {
    const pts = SEV_WEIGHT[e.severity] || 0
    score += pts
    if (pts) reasons.push(`${e.label || e.value} — ${e.severity} (+${pts})`)
  }

  // 3) Tamanho da superfície viva (mais hosts vivos = mais superfície de ataque).
  // Só HOST web vivo (subdomínio). Antes somava `a.alive` de qualquer tipo —
  // portas têm alive:true, então "9 hosts web vivos" na verdade eram 1 host + 8
  // portas. (Fase 2 do roadmap de legibilidade, Bug 2.)
  const alive = assets.filter((a) => a.type === 'subdomain' && a.alive).length
  if (alive) {
    const pts = Math.min(15, Math.floor(alive / 3) + 2)
    score += pts
    reasons.push(`${alive} host(s) web vivo(s) na superfície (+${pts})`)
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  return { score, level: levelFromScore(score), reasons: reasons.slice(0, 8) }
}

module.exports = { computeScore, levelFromScore }
