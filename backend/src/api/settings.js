const { Router } = require('express')
const { requireAuth } = require('../auth')
const { getAgentModel, setAgentModel, isValidModel, AVAILABLE_MODELS, DEFAULT_MODEL } = require('../settings')
const { listFrameworks, DEFAULT_FRAMEWORK_ID } = require('../frameworks')

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

// Troca o modelo do agente (vale para o PRÓXIMO run de qualquer engagement).
router.put('/model', (req, res) => {
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
