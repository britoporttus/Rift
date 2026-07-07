const { Router } = require('express')
const { requireAuth } = require('../auth')
const Finding = require('../models/Finding')

const router = Router()
router.use(requireAuth())

const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info']
const REMEDIATION_STATES = ['open', 'fixed', 'regressed', 'accepted_risk']

function toDto(f) {
  return {
    id:                f._id,
    engagement_id:     f.engagementId,
    engagement_name:   f.engagementName,
    severity:          f.severity,
    title:             f.title,
    description:       f.description,
    evidence:          f.evidence,
    impact:            f.impact,
    recommendation:    f.recommendation,
    cvss:              f.cvss,
    type:              f.type,
    location:          f.location,
    confirmed:         f.confirmed,
    // Taxonomia + rastreamento de regressão (antes eram descartados pela API)
    state:             f.state,
    confidence:        f.confidence,
    remediationStatus: f.remediationStatus || 'open',
    fingerprint:       f.fingerprint,
    firstSeen:         f.firstSeen || (f.createdAt ? new Date(f.createdAt).toISOString() : null),
    lastSeen:          f.lastSeen,
  }
}

function sortBySeverity(findings) {
  return findings.sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity))
}

router.get('/', async (req, res) => {
  const { engagementId, severity, remediationStatus } = req.query
  const filter = {}
  if (engagementId)      filter.engagementId = engagementId
  if (severity)          filter.severity = severity
  if (remediationStatus) filter.remediationStatus = remediationStatus

  const findings = await Finding.find(filter).lean()
  res.json(sortBySeverity(findings).map(toDto))
})

// PATCH /api/findings/:id/status — operador marca o estado de remediação
// (open → fixed → accepted_risk). Fecha o ciclo "achei → corrigi → confirmei".
router.patch('/:id/status', async (req, res) => {
  const { remediationStatus } = req.body ?? {}
  if (!REMEDIATION_STATES.includes(remediationStatus)) {
    return res.status(400).json({ error: `remediationStatus inválido (use: ${REMEDIATION_STATES.join(', ')})` })
  }
  const finding = await Finding.findByIdAndUpdate(
    req.params.id,
    { remediationStatus },
    { new: true }
  ).lean()
  if (!finding) return res.status(404).json({ error: 'finding não encontrado' })
  res.json(toDto(finding))
})

router.get('/:engagementId', async (req, res) => {
  const findings = await Finding.find({ engagementId: req.params.engagementId }).lean()
  res.json(sortBySeverity(findings).map(toDto))
})

module.exports = router
