const { Router } = require('express')
const path = require('path')
const fs = require('fs')
const { requireAuth } = require('../auth')
const { getEngagement } = require('../store')

const FRAMEWORK_PATH = process.env.FRAMEWORK_PATH || '/home/digitalbath/pentest-framework-v2'
const router = Router()
router.use(requireAuth())

router.get('/:engagementId', async (req, res) => {
  const e = await getEngagement(req.params.engagementId)
  if (!e) return res.status(404).json({ error: 'not found' })

  const dir = path.join(FRAMEWORK_PATH, 'clients', e.slug, e.date, 'reports')
  if (!fs.existsSync(dir)) return res.json([])

  const files = fs.readdirSync(dir).map((f) => {
    const ext = path.extname(f).toLowerCase()
    const id = e._id
    return {
      name: f,
      url: `/api/reports/${id}/download/${f}`,
      viewUrl: `/api/reports/${id}/view/${f}`,
      size: fs.statSync(path.join(dir, f)).size,
      ext,
    }
  })
  res.json(files)
})

router.get('/:engagementId/view/:filename', async (req, res) => {
  const e = await getEngagement(req.params.engagementId)
  if (!e) return res.status(404).json({ error: 'not found' })

  const filename = path.basename(req.params.filename)
  const filePath = path.join(FRAMEWORK_PATH, 'clients', e.slug, e.date, 'reports', filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file not found' })

  const ext = path.extname(filename).toLowerCase()
  const mime = ext === '.html' ? 'text/html' : ext === '.md' ? 'text/plain' : 'application/octet-stream'
  res.setHeader('Content-Type', mime)
  res.sendFile(filePath)
})

router.get('/:engagementId/download/:filename', async (req, res) => {
  const e = await getEngagement(req.params.engagementId)
  if (!e) return res.status(404).json({ error: 'not found' })

  const filename = path.basename(req.params.filename)
  const filePath = path.join(FRAMEWORK_PATH, 'clients', e.slug, e.date, 'reports', filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file not found' })

  res.download(filePath)
})

module.exports = router
