const { Router } = require('express')
const { requireAuth } = require('../auth')
const { tenantScope } = require('../tenancy')
const { cleanFindings } = require('../findings-count')
const { REMEDIATION_STATES, canTransition, defaultDueDate } = require('../finding-lifecycle')

const router = Router()
router.use(requireAuth())
// Frente 0: resolve o tenant do usuário e injeta req.db (models ligados ao
// banco DELE). Sem tenant resolvido, nega — nunca segue para os models globais.
router.use(tenantScope())

const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info']

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
    phase:             f.phase,
    discoveredBy:      f.discoveredBy,
    // Taxonomia + rastreamento de regressão (antes eram descartados pela API)
    state:             f.state,
    confidence:        f.confidence,
    remediationStatus: f.remediationStatus || 'open',
    owner:             f.owner || null,
    dueDate:           f.dueDate || null,
    statusHistory:     f.statusHistory || [],
    fingerprint:       f.fingerprint,
    firstSeen:         f.firstSeen || (f.createdAt ? new Date(f.createdAt).toISOString() : null),
    lastSeen:          f.lastSeen,
    // Dimensões de classificação (ETAPA 5.2) — antes não iam para a UI:
    reproducible:      f.reproducible,   // Exploração (PoC reproduzível?)
    cvssVector:        f.cvssVector,      // CVSS calculado (tem vetor) vs estimado
    cwe:               f.cwe,
    owasp:             f.owasp,
    poc:               f.poc,
  }
}

function sortBySeverity(findings) {
  return findings.sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity))
}

// P1-22 (auditoria 2026-07-20): sem paginação, GET /api/findings sempre lê a
// coleção INTEIRA (cresce com o histórico de todos os engagements). O dedup
// por fingerprint (cleanFindings) preserva a ordem de PRIMEIRA ocorrência do
// array de entrada — mover isso pra um pipeline de agregação do Mongo ($group)
// não garante essa mesma ordem sem reproduzir com certeza o comportamento que
// corrigiu o bug histórico "191 ≠ 44" (ver findings-count.js). Por segurança,
// a dedup continua em JS; o que dá pra fazer sem risco é paginar a RESPOSTA já
// limpa — `limit`/`page` são opcionais e, se omitidos, o comportamento é
// IDÊNTICO ao de antes (array completo), então nenhum caller existente quebra.
function paginate(list, { limit, page }) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 0, 0), 1000)
  if (!lim) return { items: list, total: list.length }
  const p = Math.max(parseInt(page, 10) || 1, 1)
  const start = (p - 1) * lim
  return { items: list.slice(start, start + lim), total: list.length, page: p, limit: lim }
}

router.get('/', async (req, res) => {
  const { engagementId, severity, remediationStatus, limit, page } = req.query
  const filter = {}
  if (engagementId)      filter.engagementId = engagementId
  if (severity)          filter.severity = severity
  if (remediationStatus) filter.remediationStatus = remediationStatus

  const findings = await req.db.Finding.find(filter).lean()
  // Fonte única: exclui findings de engagements já removidos (órfãos) e deduplica
  // por (engagement, fingerprint). Sem isto o total global inflava (191 vs 44).
  const existingIds = (await req.db.Engagement.find({}, { _id: 1 }).lean()).map((e) => e._id)
  const cleaned = sortBySeverity(cleanFindings(findings, existingIds)).map(toDto)

  if (!limit) return res.json(cleaned) // default: contrato antigo, sem paginação
  const { items, total, page: p, limit: lim } = paginate(cleaned, { limit, page })
  res.json({ items, total, page: p, limit: lim })
})

// PATCH /api/findings/:id/status — operador move o ciclo de vida do achado:
// estado (open → in_progress → fixed/accepted_risk), dono e prazo. Grava o
// histórico de transição (quem, quando) — é o que a visão de gestor lê para
// responder "o que está sendo corrigido".
router.patch('/:id/status', async (req, res) => {
  const { remediationStatus, owner, dueDate } = req.body ?? {}
  const current = await req.db.Finding.findById(req.params.id).lean()
  if (!current) return res.status(404).json({ error: 'finding não encontrado' })

  const set = {}
  const push = []
  const by = req.user?.name || req.user?.email || 'operador'

  if (remediationStatus !== undefined) {
    if (!REMEDIATION_STATES.includes(remediationStatus)) {
      return res.status(400).json({ error: `remediationStatus inválido (use: ${REMEDIATION_STATES.join(', ')})` })
    }
    const from = current.remediationStatus || 'open'
    if (remediationStatus !== from) {
      // `regressed` é atribuído só pelo sistema; ainda assim aceitamos a saída
      // dele para os estados permitidos (o operador trata como um "aberto").
      if (!canTransition(from, remediationStatus)) {
        return res.status(409).json({ error: `transição inválida: ${from} → ${remediationStatus}` })
      }
      set.remediationStatus = remediationStatus
      // Ao entrar em correção sem prazo definido, deriva um do SLA da severidade.
      if (remediationStatus === 'in_progress' && !current.dueDate && dueDate === undefined) {
        set.dueDate = defaultDueDate(current.severity, new Date())
      }
      push.push({ status: remediationStatus, at: new Date(), by, note: req.body?.note || null })
    }
  }
  if (owner !== undefined) set.owner = owner ? String(owner).slice(0, 120) : null
  if (dueDate !== undefined) set.dueDate = dueDate ? new Date(dueDate) : null

  const update = { $set: set }
  if (push.length) update.$push = { statusHistory: { $each: push } }

  const finding = await req.db.Finding.findByIdAndUpdate(req.params.id, update, { new: true }).lean()
  res.json(toDto(finding))
})

// GET /api/findings/:id/trace — reconstrói "como o agente chegou aqui" a
// partir do histórico de ChatMessage já persistido (agent_action/agent_message),
// pela proximidade de horário com o achado. Não há vínculo causal explícito
// (Finding não referencia mensagens) — é aproximação por janela de tempo, mas
// usa dado que já existe, não coleta nada novo.
const TRACE_WINDOW_MS = 30 * 60 * 1000
const TRACE_TYPES = ['agent_action', 'agent_message']

router.get('/:id/trace', async (req, res) => {
  const finding = await req.db.Finding.findById(req.params.id).lean()
  if (!finding) return res.status(404).json({ error: 'finding não encontrado' })

  const at = finding.createdAt ? new Date(finding.createdAt) : new Date()
  const messages = await req.db.ChatMessage.find({
    engagementId: finding.engagementId,
    type: { $in: TRACE_TYPES },
    createdAt: { $gte: new Date(at.getTime() - TRACE_WINDOW_MS), $lte: at },
  }).sort({ createdAt: 1 }).limit(40).lean()

  res.json({
    findingAt: at,
    messages: messages.map((m) => ({ type: m.type, payload: m.payload, at: m.createdAt })),
  })
})

router.get('/:engagementId', async (req, res) => {
  const findings = await req.db.Finding.find({ engagementId: req.params.engagementId }).lean()
  // Dedup por fingerprint (mesma regra do total global) — re-scan não duplica.
  const cleaned = cleanFindings(findings, [req.params.engagementId])
  res.json(sortBySeverity(cleaned).map(toDto))
})

module.exports = router
module.exports.paginate = paginate
