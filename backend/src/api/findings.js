const { Router } = require('express')
const { requireAuth } = require('../auth')
const Finding = require('../models/Finding')

const router = Router()
router.use(requireAuth())

const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info']

router.get('/', async (req, res) => {
  const { engagementId, severity } = req.query
  const filter = {}
  if (engagementId) filter.engagementId = engagementId
  if (severity)     filter.severity = severity

  const findings = await Finding.find(filter)
    .sort({ severity: 1 })
    .lean()

  // Sort by severity order
  findings.sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity))

  res.json(findings.map(f => ({
    id:              f._id,
    engagement_id:   f.engagementId,
    engagement_name: f.engagementName,
    severity:        f.severity,
    title:           f.title,
    description:     f.description,
    evidence:        f.evidence,
    impact:          f.impact,
    recommendation:  f.recommendation,
    cvss:            f.cvss,
    type:            f.type,
    location:        f.location,
    confirmed:       f.confirmed,
  })))
})

router.get('/:engagementId', async (req, res) => {
  const findings = await Finding.find({ engagementId: req.params.engagementId })
    .lean()

  findings.sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity))

  res.json(findings.map(f => ({
    id:              f._id,
    engagement_id:   f.engagementId,
    engagement_name: f.engagementName,
    severity:        f.severity,
    title:           f.title,
    description:     f.description,
    evidence:        f.evidence,
    impact:          f.impact,
    recommendation:  f.recommendation,
    cvss:            f.cvss,
    type:            f.type,
    location:        f.location,
    confirmed:       f.confirmed,
  })))
})

module.exports = router
