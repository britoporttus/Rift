// Visões por papel (Fase 6) — endpoints de AGREGAÇÃO para gestor e diretor.
// A lógica pura mora em ../overview.js (testada); aqui só busca os dados no
// tenant e devolve. Técnico não tem endpoint próprio: usa as telas detalhadas.
const { Router } = require('express')
const { requireAuth } = require('../auth')
const { tenantScope } = require('../tenancy')
const { cleanFindings } = require('../findings-count')
const { gestorOverview, diretorOverview, postureTrend } = require('../overview')

const router = Router()
router.use(requireAuth())
router.use(tenantScope())

// Carrega findings (dedup por fingerprint, como no resto da API) + domínios do tenant.
async function loadData(db) {
  const [rawFindings, domains] = await Promise.all([
    db.Finding.find({}).lean(),
    db.Domain.find({}).select('domain riskScore riskLevel').lean(),
  ])
  const findings = cleanFindings(rawFindings, null)
  return { findings, domains }
}

// GET /api/overview/gestor — métricas de correção + fila acionável.
router.get('/gestor', async (req, res) => {
  const { findings } = await loadData(req.db)
  const out = gestorOverview(findings, new Date())
  // Enriquece a fila com o ALVO (Engagement.target) — o "de qual domínio é isso?".
  const ids = [...new Set(out.queue.map((q) => q.engagementId).filter(Boolean))]
  if (ids.length) {
    const engs = await req.db.Engagement.find({ _id: { $in: ids } }).select('target name').lean().catch(() => [])
    const byId = new Map(engs.map((e) => [String(e._id), e.target || e.name]))
    for (const q of out.queue) q.target = byId.get(String(q.engagementId)) || q.engagementName || null
  }
  res.json(out)
})

// GET /api/overview/diretor — veredito + postura + tendência + 3 KPIs.
router.get('/diretor', async (req, res) => {
  const now = new Date()
  const { findings, domains } = await loadData(req.db)
  const base = diretorOverview(domains, findings, now)
  // Tendência real da postura (pior índice/dia) a partir do histórico de scans.
  const scans = await req.db.DomainScan.find({}).select('ranAt riskScore').lean().catch(() => [])
  res.json({ ...base, trend: postureTrend(scans, 30, now) })
})

module.exports = router
