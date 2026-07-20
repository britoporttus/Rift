const { Router } = require('express')
const { requireAuth } = require('../auth')
const { getAgentModel, setAgentModel, isValidModel, AVAILABLE_MODELS, DEFAULT_MODEL } = require('../settings')
const { listFrameworks, DEFAULT_FRAMEWORK_ID } = require('../frameworks')
const { listDomainPacks, DEFAULT_DOMAIN_PACK_ID } = require('../domain-packs')

const router = Router()
router.use(requireAuth())   // qualquer operador autenticado

// Modelo atual do agente + catálogo para o seletor.
router.get('/model', (_req, res) => {
  res.json({ current: getAgentModel(), default: DEFAULT_MODEL, available: AVAILABLE_MODELS })
})

// Catálogo das VERSÕES do agente (seletor A/B/C). `available` reflete se a pasta
// existe no servidor — a UI desabilita as indisponíveis. A escolha é por-engagement
// (persistida em Engagement.frameworkId via PATCH /engagements/:id).
router.get('/frameworks', (_req, res) => {
  res.json({ default: DEFAULT_FRAMEWORK_ID, available: listFrameworks() })
})

// Catálogo dos DOMAIN PACKS do módulo de pentest (ETAPA 0 multi-domínio). `available`
// = pack executável hoje (status 'ready'); planned (azure/ad/sap) vêm no catálogo mas
// desabilitados no seletor. Escolha por-engagement (Engagement.domainPackId via PATCH).
router.get('/domain-packs', (_req, res) => {
  res.json({ default: DEFAULT_DOMAIN_PACK_ID, available: listDomainPacks() })
})

// Troca o modelo do agente (vale para o PRÓXIMO run de QUALQUER engagement) —
// P1-13: mutação global de config, restrita a admin (mesmo padrão de
// PUT /api/leaks/providers/:id, que já era admin-only).
router.put('/model', requireAuth(['admin']), (req, res) => {
  const model = req.body?.model
  if (!isValidModel(model)) {
    return res.status(400).json({ error: 'Modelo inválido. Use um id claude-* válido.' })
  }
  try {
    const current = setAgentModel(model)
    res.json({ current })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
