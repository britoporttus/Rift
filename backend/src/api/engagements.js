const { Router } = require('express')
const { v4: uuid } = require('uuid')
const { requireAuth } = require('../auth')
const { readEngagements, writeEngagements } = require('../store')

const router = Router()
router.use(requireAuth())

router.get('/', (_req, res) => {
  res.json(readEngagements())
})

router.get('/:id', (req, res) => {
  const e = readEngagements().find((e) => e.id === req.params.id)
  if (!e) return res.status(404).json({ error: 'not found' })
  res.json(e)
})

router.post('/', (req, res) => {
  const { name, target, scope } = req.body ?? {}
  if (!name || !target) return res.status(400).json({ error: 'name e target obrigatórios' })

  const now = new Date().toISOString()
  const engagement = {
    id: uuid(),
    name,
    target,
    scope: scope ?? {},
    status: 'idle',
    phase: null,
    progress: 0,
    findingsCount: 0,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    date: now.slice(0, 10),
    createdAt: now,
    updatedAt: now,
  }

  const all = readEngagements()
  all.unshift(engagement)
  writeEngagements(all)
  res.status(201).json(engagement)
})

router.patch('/:id', (req, res) => {
  const all = readEngagements()
  const idx = all.findIndex((e) => e.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'not found' })

  const allowed = ['name', 'target', 'scope', 'status', 'phase', 'progress', 'findingsCount']
  for (const key of allowed) {
    if (req.body[key] !== undefined) all[idx][key] = req.body[key]
  }
  all[idx].updatedAt = new Date().toISOString()
  writeEngagements(all)
  res.json(all[idx])
})

router.delete('/:id', requireAuth(['admin']), (req, res) => {
  const all = readEngagements()
  const idx = all.findIndex((e) => e.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'not found' })
  all.splice(idx, 1)
  writeEngagements(all)
  res.status(204).end()
})

module.exports = router
