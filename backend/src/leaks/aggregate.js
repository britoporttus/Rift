// Agregação de exposição de vazamento por domínio — transforma as linhas de
// LeakedCredential nos números/gráficos do módulo Vazamentos (estilo QuimeraX):
// KPIs, timeline mensal de exposição de infostealer e famílias de stealer.
function monthKey(dateStr) {
  if (!dateStr) return null
  const m = String(dateStr).match(/^(\d{4})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}` : null
}

function levelFromScore(s) {
  if (s >= 80) return 'critical'
  if (s >= 55) return 'high'
  if (s >= 30) return 'medium'
  if (s > 0)   return 'low'
  return 'info'
}

// Score de exposição 0-100 — pesado em infostealer + senhas (o que dói de verdade
// em TPRM). Transparente: também devolve reasons.
function exposureScore({ malware, withPassword, employees, breachCount }) {
  let s = 0
  const reasons = []
  if (malware)      { const p = Math.min(45, malware * 2);   s += p; reasons.push(`${malware} credencial(is) em logs de infostealer (+${p})`) }
  if (withPassword) { const p = Math.min(25, Math.ceil(withPassword / 3)); s += p; reasons.push(`${withPassword} com senha exposta (+${p})`) }
  if (employees)    { const p = Math.min(20, employees * 3); s += p; reasons.push(`${employees} funcionário(s) corporativo(s) exposto(s) (+${p})`) }
  if (breachCount)  { const p = Math.min(10, breachCount * 3); s += p; reasons.push(`${breachCount} vazamento(s) de base de dados (+${p})`) }
  s = Math.max(0, Math.min(100, Math.round(s)))
  return { score: s, level: levelFromScore(s), reasons: reasons.slice(0, 6) }
}

// creds: LeakedCredential[] (POJO). `agg` (opcional) = estatística de fontes que
// dão agregado por domínio, não record-level:
//   LeakCheck público → { found, hasPassword, stealer, sources[] }
//   Hudson Rock       → { employees, users, malware, families:{name:count}, stealer, sources[] }
// As métricas/famílias dobram record-level com o agregado via Math.max (não soma —
// evita duplicar quando as fontes se sobrepõem).
function computeExposure(creds, agg = {}) {
  const malwareCreds = creds.filter((c) => c.category === 'malware')
  const breachCreds = creds.filter((c) => c.category !== 'malware')

  const distinct = (arr, k) => new Set(arr.map((x) => x[k]).filter(Boolean)).size
  const aggFound = Number(agg.found) || 0
  const aggNamed = (agg.sources || []).filter((s) => !/stealer\s*logs/i.test(s || '')).length

  const employeesAtRisk = Math.max(distinct(malwareCreds, 'account'), Number(agg.employees) || 0, agg.stealer ? aggFound : 0)
  const affectedUsers = Math.max(distinct(creds, 'account'), Number(agg.users) || 0, aggFound)
  const leakedPasswords = Math.max(creds.filter((c) => c.hasPassword).length, agg.hasPassword ? aggFound : 0)
  const breachCount = Math.max(distinct(breachCreds.filter((c) => c.category === 'breach'), 'breachName'), aggNamed)
  const malwareCompromises = Math.max(malwareCreds.length, Number(agg.malware) || 0, agg.stealer ? aggFound : 0)

  // Timeline mensal (exposição de infostealer). Vem dos records com data.
  const byMonth = {}
  for (const c of malwareCreds) { const k = monthKey(c.seenDate); if (k) byMonth[k] = (byMonth[k] || 0) + 1 }
  const timeline = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }))

  // Famílias de stealer: dos records + o mapa agregado (Hudson Rock dá isso nativo).
  const fam = {}
  for (const c of malwareCreds) { const f = c.stealerFamily || 'Unknown'; fam[f] = (fam[f] || 0) + 1 }
  for (const [name, count] of Object.entries(agg.families || {})) { fam[name] = Math.max(fam[name] || 0, Number(count) || 0) }
  const totalFam = Object.values(fam).reduce((a, b) => a + b, 0) || 1
  const stealerFamilies = Object.entries(fam).sort(([, a], [, b]) => b - a)
    .map(([name, count]) => ({ name, count, pct: Math.round((count / totalFam) * 1000) / 10 }))

  const { score, level, reasons } = exposureScore({ malware: malwareCompromises, withPassword: leakedPasswords, employees: employeesAtRisk, breachCount })

  return {
    riskScore: score, riskLevel: level, riskReasons: reasons,
    metrics: { malwareCompromises, leakedPasswords, employeesAtRisk, affectedUsers, breachCount },
    timeline, stealerFamilies,
  }
}

module.exports = { computeExposure, monthKey, levelFromScore }
