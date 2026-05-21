const { Router } = require('express')
const path = require('path')
const fs = require('fs')
const yaml = require('js-yaml')
const { requireAuth } = require('../auth')
const { readEngagements } = require('../store')

const FRAMEWORK_PATH = process.env.FRAMEWORK_PATH || '/home/digitalbath/pentest-framework-v2'
const router = Router()
router.use(requireAuth())

function loadForEngagement(engagement) {
  const dir = path.join(FRAMEWORK_PATH, 'clients', engagement.slug, engagement.date, 'findings')
  if (!fs.existsSync(dir)) return []

  return fs.readdirSync(dir)
    .filter((f) => /\.(json|ya?ml)$/.test(f))
    .flatMap((f) => {
      try {
        const raw = fs.readFileSync(path.join(dir, f), 'utf-8')
        const finding = /\.ya?ml$/.test(f) ? yaml.load(raw) : JSON.parse(raw)
        if (!finding) return []
        return [{
          ...finding,
          id: finding.id || f.replace(/\.[^.]+$/, ''),
          severity: (finding.severity || 'info').toLowerCase(),
          engagement_id: engagement.id,
          engagement_name: engagement.name,
        }]
      } catch {
        return []
      }
    })
}

router.get('/', (req, res) => {
  const { engagementId, severity } = req.query
  let findings = []

  for (const e of readEngagements()) {
    if (engagementId && e.id !== engagementId) continue
    findings.push(...loadForEngagement(e))
  }

  if (severity) findings = findings.filter((f) => f.severity === severity)
  const order = ['critical', 'high', 'medium', 'low', 'info']
  findings.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
  res.json(findings)
})

router.get('/:engagementId', (req, res) => {
  const e = readEngagements().find((e) => e.id === req.params.engagementId)
  if (!e) return res.status(404).json({ error: 'engagement not found' })
  res.json(loadForEngagement(e))
})

module.exports = router
