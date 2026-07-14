const { Router } = require('express')
const os = require('os')
const { execSync } = require('child_process')
const { requireAuth } = require('../auth')
const { readUsage } = require('../store')
const { computeSkuUsage } = require('../sku')
const Usage = require('../models/Usage')

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

router.get('/usage', async (_req, res) => {
  const all = await readUsage()
  const byDay = {}
  for (const entry of all) {
    const day = (entry.ts || entry.date || '').slice(0, 10)
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
  const all = await readUsage()
  const spentUsd    = all.reduce((s, e) => s + (e.usd || 0), 0)
  const tokensTotal = all.reduce((s, e) => s + (e.tokens || 0), 0)
  const limitUsd    = Number(process.env.SKU_LIMIT_USD) || null
  const periodLabel = process.env.SKU_PERIOD || null
  res.json(computeSkuUsage({ limitUsd, spentUsd, tokensTotal, periodLabel }))
})

router.get('/usage/by-user', async (_req, res) => {
  const all = await Usage.find({ userId: { $exists: true } }).sort({ ts: -1 }).lean()

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

    const day = (e.ts || '').toString().slice(0, 10)
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
