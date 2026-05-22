const { Router } = require('express')
const { v4: uuid } = require('uuid')
const { requireAuth } = require('../auth')
const { readEngagements, getEngagement, createEngagement, updateEngagement, deleteEngagement } = require('../store')
const ChatMessage = require('../models/ChatMessage')

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
  const allowed = ['name', 'target', 'scope', 'status', 'phase', 'progress', 'findingsCount']
  const patch = {}
  for (const key of allowed) {
    if (req.body[key] !== undefined) patch[key] = req.body[key]
  }
  const updated = await updateEngagement(req.params.id, patch)
  if (!updated) return res.status(404).json({ error: 'not found' })
  res.json(toDto(updated))
})

router.delete('/:id', requireAuth(['admin']), async (req, res) => {
  await deleteEngagement(req.params.id)
  await ChatMessage.deleteMany({ engagementId: req.params.id }).catch(() => {})
  res.status(204).end()
})

router.get('/:id/messages', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit ?? '500'), 1000)
  const msgs = await ChatMessage.find({ engagementId: req.params.id })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean()
  res.json(msgs.map((m) => ({ ...m.payload, type: m.type, _dbId: String(m._id) })))
})

module.exports = router
