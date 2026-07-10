const { Router } = require('express')
const { requireAuth } = require('../auth')
const { getAgentModel, setAgentModel, isValidModel, AVAILABLE_MODELS, DEFAULT_MODEL } = require('../settings')

const router = Router()
router.use(requireAuth())   // qualquer operador autenticado

// Modelo atual do agente + catálogo para o seletor.
router.get('/model', (_req, res) => {
  res.json({ current: getAgentModel(), default: DEFAULT_MODEL, available: AVAILABLE_MODELS })
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
