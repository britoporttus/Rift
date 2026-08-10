const { Router } = require('express')
const os = require('os')
const { execSync } = require('child_process')
const { requireAuth } = require('../auth')
const { computeSkuUsage } = require('../sku')

const router = Router()
router.use(requireAuth(['admin']))

router.get('/metrics', (_req, res) => {
  const cpus = os.cpus()
  const totalMem = os.totalmem()
  const freeMem = os.freemem()

  let diskTotal = 0, diskUsed = 0
  try {
    const df = execSync('df -BM / | tail -1', { encoding: 'utf-8' }).trim().split(/\s+/)
    diskTotal = parseInt(df[1])
    diskUsed = parseInt(df[2])
  } catch {}

  res.json({
    cpu: {
      model: cpus[0]?.model ?? 'unknown',
      cores: cpus.length,
      loadAvg: os.loadavg(),
    },
    memory: {
      total: totalMem,
      free: freeMem,
      used: totalMem - freeMem,
      usedPercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
    },
    disk: { total: diskTotal, used: diskUsed },
    uptime: os.uptime(),
  })
})

// Frente 0: o painel admin é a ÚNICA superfície que legitimamente agrega entre
// tenants (é a visão da operação, não a de um cliente). Ele já está atrás de
// `requireAuth(['admin'])`, e admin é papel interno — `client` nunca chega aqui.
//
// A agregação é um fan-out por tenant, não uma query global: mesmo aqui não
// existe mais "uma coleção com tudo". O custo é N queries por request; aceitável
// para um painel de operação, e o caminho de escala é o espelho de Usage no
// control plane (decisão de 2026-08-01), não voltar à coleção compartilhada.
async function usageAcrossTenants() {
  const { forEachTenant } = require('../tenancy')
  const results = await forEachTenant(({ tenant, db }) =>
    db.Usage.find().sort({ ts: -1 }).lean().then((rows) => rows.map((r) => ({ ...r, tenantSlug: tenant.slug }))))
  return results.filter((r) => r.ok).flatMap((r) => r.value || [])
}

// `Usage.ts` é `Date` no schema, mas registros antigos gravaram string. O
// agrupamento por dia fazia `(entry.ts || '').slice(0,10)` — que estoura com
// `TypeError: slice is not a function` assim que encontra um Date de verdade.
// Bug pré-existente que só apareceu agora porque o fan-out garante que a rota
// realmente lê registros. Normaliza os dois formatos para 'YYYY-MM-DD'.
function dayOf(entry) {
  const v = entry?.ts ?? entry?.date
  if (!v) return null
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10)
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  return isNaN(d) ? null : d.toISOString().slice(0, 10)
}

router.get('/usage', async (_req, res) => {
  const all = await usageAcrossTenants()
  const byDay = {}
  for (const entry of all) {
    const day = dayOf(entry)
    if (!day) continue
    if (!byDay[day]) byDay[day] = { date: day, usd: 0, tokens: 0 }
    byDay[day].usd += entry.usd || 0
    byDay[day].tokens += entry.tokens || 0
  }
  res.json(Object.values(byDay).sort((a, b) => b.date.localeCompare(a.date)))
})

// ETAPA 2.2: utilização da SKU. Consumo REAL (soma de Usage) + limite APENAS se o
// operador declarou o teto do plano em SKU_LIMIT_USD. Sem limite → available:false
// (a UI mostra "indisponível — integração não configurada", sem simular).
router.get('/sku', async (_req, res) => {
  const all = await usageAcrossTenants()
  const spentUsd    = all.reduce((s, e) => s + (e.usd || 0), 0)
  const tokensTotal = all.reduce((s, e) => s + (e.tokens || 0), 0)
  const limitUsd    = Number(process.env.SKU_LIMIT_USD) || null
  const periodLabel = process.env.SKU_PERIOD || null
  res.json(computeSkuUsage({ limitUsd, spentUsd, tokensTotal, periodLabel }))
})

router.get('/usage/by-user', async (_req, res) => {
  const all = (await usageAcrossTenants()).filter((e) => e.userId)

  // group by user → day → engagement
  const byUser = {}
  for (const e of all) {
    const uid = e.userId
    if (!byUser[uid]) {
      byUser[uid] = { userId: uid, userName: e.userName, userEmail: e.userEmail, totalUsd: 0, totalTokens: 0, days: {} }
    }
    const u = byUser[uid]
    u.totalUsd    += e.usd    || 0
    u.totalTokens += e.tokens || 0

    const day = dayOf(e)
    if (!u.days[day]) u.days[day] = { date: day, usd: 0, tokens: 0, engagements: {} }
    const d = u.days[day]
    d.usd    += e.usd    || 0
    d.tokens += e.tokens || 0

    const eid = e.engagementId || 'unknown'
    if (!d.engagements[eid]) d.engagements[eid] = { engagementId: eid, engagementName: e.engagementName || eid, usd: 0, tokens: 0 }
    d.engagements[eid].usd    += e.usd    || 0
    d.engagements[eid].tokens += e.tokens || 0
  }

  const result = Object.values(byUser).map((u) => ({
    ...u,
    days: Object.values(u.days)
      .map((d) => ({ ...d, engagements: Object.values(d.engagements) }))
      .sort((a, b) => b.date.localeCompare(a.date)),
  })).sort((a, b) => b.totalTokens - a.totalTokens)

  res.json(result)
})

module.exports = router
