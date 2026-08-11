// Feed de monitoramento risk-triggered (#2b) — os eventos notáveis detectados
// pelos scans de ASM. Responde "o que mudou que importa?".
const { Router } = require('express')
const { requireAuth } = require('../auth')
const { tenantScope } = require('../tenancy')

const router = Router()
router.use(requireAuth())
router.use(tenantScope())

const dto = (e) => ({
  id: e._id, domainId: e.domainId, domain: e.domain, type: e.type,
  severity: e.severity, title: e.title, detail: e.detail, seen: e.seen, at: e.at,
})

// GET /api/monitor/events?limit=&unseen=1 — feed cronológico decrescente.
router.get('/events', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200)
  const q = {}
  if (req.query.unseen === '1') q.seen = false
  const list = await req.db.MonitorEvent.find(q).sort({ at: -1 }).limit(limit).lean()
  const unseen = await req.db.MonitorEvent.countDocuments({ seen: false })
  res.json({ events: list.map(dto), unseen })
})

// POST /api/monitor/events/seen — marca tudo como visto (limpa o badge).
router.post('/events/seen', async (req, res) => {
  await req.db.MonitorEvent.updateMany({ seen: false }, { $set: { seen: true } })
  res.json({ ok: true })
})

module.exports = router
