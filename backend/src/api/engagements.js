const { Router } = require('express')
const { v4: uuid } = require('uuid')
const { requireAuth } = require('../auth')
const { readEngagements, getEngagement, createEngagement, updateEngagement, deleteEngagement } = require('../store')
const ChatMessage = require('../models/ChatMessage')
const ChatSession = require('../models/ChatSession')
const scheduler = require('../scheduler')

const router = Router()
router.use(requireAuth())

function toDto(e) {
  return { ...e, id: e._id }
}

router.get('/', async (_req, res) => {
  res.json((await readEngagements()).map(toDto))
})

router.get('/:id', async (req, res) => {
  const e = await getEngagement(req.params.id)
  if (!e) return res.status(404).json({ error: 'not found' })
  res.json(toDto(e))
})

router.post('/', async (req, res) => {
  const { name, target, scope } = req.body ?? {}
  if (!name || !target) return res.status(400).json({ error: 'name e target obrigatórios' })

  const now = new Date()
  const engagement = await createEngagement({
    _id: uuid(),
    name,
    target,
    scope: scope ?? {},
    status: 'idle',
    phase: null,
    progress: 0,
    findingsCount: 0,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    date: now.toISOString().slice(0, 10),
    createdAt: now,
    updatedAt: now,
  })
  res.status(201).json(toDto(engagement))
})

router.patch('/:id', async (req, res) => {
  const allowed = ['name', 'status', 'phase', 'progress', 'findingsCount']
  // target e scope definem a autorização do framework — alterá-los é mudar o escopo.
  // Restrito a admin para evitar que um `user` repontar o engagement para outro alvo.
  const adminOnly = ['target', 'scope']
  const patch = {}
  for (const key of allowed) {
    if (req.body[key] !== undefined) patch[key] = req.body[key]
  }
  if (req.user?.role === 'admin') {
    for (const key of adminOnly) {
      if (req.body[key] !== undefined) patch[key] = req.body[key]
    }
  } else if (adminOnly.some((k) => req.body[k] !== undefined)) {
    return res.status(403).json({ error: 'Apenas administradores podem alterar target/scope' })
  }
  const updated = await updateEngagement(req.params.id, patch)
  if (!updated) return res.status(404).json({ error: 'not found' })
  res.json(toDto(updated))
})

router.delete('/:id', requireAuth(['admin']), async (req, res) => {
  await deleteEngagement(req.params.id)
  await ChatMessage.deleteMany({ engagementId: req.params.id }).catch(() => {})
  await ChatSession.deleteMany({ engagementId: req.params.id }).catch(() => {})
  res.status(204).end()
})

// ── Agendamento de scans recorrentes (admin) ───────────────────────────────────
// Agendar execução autônoma do agente é ação de admin (custo + roda sem supervisão).
const FREQ = ['daily', 'weekly']
const PHASES = ['recon', 'recon_enum', 'full']

router.patch('/:id/schedule', requireAuth(['admin']), async (req, res) => {
  const e = await getEngagement(req.params.id)
  if (!e) return res.status(404).json({ error: 'not found' })

  const cur = e.schedule || {}
  const body = req.body ?? {}
  const next = {
    enabled:        typeof body.enabled === 'boolean' ? body.enabled : (cur.enabled || false),
    frequency:      FREQ.includes(body.frequency) ? body.frequency : (cur.frequency || 'weekly'),
    phases:         PHASES.includes(body.phases) ? body.phases : (cur.phases || 'full'),
    autoExploit:    typeof body.autoExploit === 'boolean' ? body.autoExploit : (cur.autoExploit || false),
    costCeilingUsd: typeof body.costCeilingUsd === 'number'
      ? Math.min(Math.max(body.costCeilingUsd, 0.5), 100)
      : (cur.costCeilingUsd ?? 5),
    nextRunAt:      cur.nextRunAt || null,
    lastRunAt:      cur.lastRunAt || null,
    lastRunStatus:  cur.lastRunStatus || null,
  }
  // Ao habilitar pela primeira vez, agenda um scan-base já para o próximo ciclo do agendador.
  if (next.enabled && !next.nextRunAt) next.nextRunAt = new Date()
  if (!next.enabled) next.nextRunAt = null

  const updated = await updateEngagement(req.params.id, { schedule: next })
  res.json(toDto(updated))
})

// Disparo manual imediato (admin) — útil para testar e para um "scan agora".
router.post('/:id/run-now', requireAuth(['admin']), async (req, res) => {
  const e = await getEngagement(req.params.id)
  if (!e) return res.status(404).json({ error: 'not found' })
  // Usa a config de schedule existente (ou defaults seguros) para o run manual.
  const sched = e.schedule && e.schedule.phases ? e.schedule : { phases: 'full', autoExploit: false, costCeilingUsd: 5 }
  scheduler.triggerRun({ ...e, schedule: sched }).catch((err) => console.error('[run-now]', err.message))
  res.status(202).json({ ok: true, message: 'Scan iniciado em background.' })
})

// ── Messages (filtered by session) ────────────────────────────────────────────
router.get('/:id/messages', async (req, res) => {
  const limit     = Math.min(parseInt(req.query.limit ?? '500'), 1000)
  const sessionId = req.query.sessionId || 'default'
  const msgs = await ChatMessage.find({ engagementId: req.params.id, sessionId })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean()
  res.json(msgs.map((m) => ({ ...m.payload, type: m.type, _dbId: String(m._id) })))
})

// ── Sessions ──────────────────────────────────────────────────────────────────
router.get('/:id/sessions', async (req, res) => {
  const sessions = await ChatSession.find({ engagementId: req.params.id })
    .sort({ lastMessageAt: -1 })
    .lean()

  // Attach message count per session
  const counts = await ChatMessage.aggregate([
    { $match: { engagementId: req.params.id } },
    { $group: { _id: '$sessionId', count: { $sum: 1 } } },
  ])
  const countMap = Object.fromEntries(counts.map(c => [c._id, c.count]))

  const result = sessions.map(s => ({
    id: s._id,
    name: s.name,
    createdAt: s.createdAt,
    lastMessageAt: s.lastMessageAt,
    messageCount: countMap[s._id] ?? 0,
  }))

  // If no sessions exist, return a synthetic default so UI always shows at least one
  if (!result.length) {
    const defaultCount = countMap['default'] ?? 0
    return res.json([{
      id: 'default',
      name: 'Chat',
      createdAt: new Date(0).toISOString(),
      lastMessageAt: new Date(0).toISOString(),
      messageCount: defaultCount,
    }])
  }

  res.json(result)
})

router.post('/:id/sessions', async (req, res) => {
  const engagement = await getEngagement(req.params.id)
  if (!engagement) return res.status(404).json({ error: 'not found' })

  const name = (req.body?.name || 'Novo chat').trim().slice(0, 80)
  const session = await ChatSession.create({ engagementId: req.params.id, name })
  res.status(201).json({
    id: session._id,
    name: session.name,
    createdAt: session.createdAt,
    lastMessageAt: session.lastMessageAt,
    messageCount: 0,
  })
})

router.patch('/:id/sessions/:sid', async (req, res) => {
  const session = await ChatSession.findOneAndUpdate(
    { _id: req.params.sid, engagementId: req.params.id },
    { name: (req.body?.name || '').trim().slice(0, 80) },
    { new: true }
  ).lean()
  if (!session) return res.status(404).json({ error: 'not found' })
  res.json({ id: session._id, name: session.name })
})

router.delete('/:id/sessions/:sid', async (req, res) => {
  await ChatSession.deleteOne({ _id: req.params.sid, engagementId: req.params.id })
  await ChatMessage.deleteMany({ engagementId: req.params.id, sessionId: req.params.sid })
  res.status(204).end()
})

module.exports = router
