const { Router } = require('express')
const path = require('path')
const fs = require('fs')
const { requireAuth } = require('../auth')
const { readEngagements } = require('../store')

const FRAMEWORK_PATH = process.env.FRAMEWORK_PATH || '/home/digitalbath/pentest-framework-v2'
const router = Router()
router.use(requireAuth())

router.get('/:engagementId', (req, res) => {
  const e = readEngagements().find((e) => e.id === req.params.engagementId)
  if (!e) return res.status(404).json({ error: 'not found' })

  const dir = path.join(FRAMEWORK_PATH, 'clients', e.slug, e.date, 'reports')
  if (!fs.existsSync(dir)) return res.json([])

  const files = fs.readdirSync(dir).map((f) => ({
    name: f,
    url: `/api/reports/${e.id}/download/${f}`,
    size: fs.statSync(path.join(dir, f)).size,
    ext: path.extname(f).toLowerCase(),
  }))
  res.json(files)
})

router.get('/:engagementId/download/:filename', (req, res) => {
  const e = readEngagements().find((e) => e.id === req.params.engagementId)
  if (!e) return res.status(404).json({ error: 'not found' })

  // prevent path traversal
  const filename = path.basename(req.params.filename)
  const filePath = path.join(FRAMEWORK_PATH, 'clients', e.slug, e.date, 'reports', filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file not found' })

  res.download(filePath)
})

module.exports = router
