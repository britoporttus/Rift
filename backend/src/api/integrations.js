// Integrações / abas de conexão (#5) — hub de ticketing. Só operador interno
// configura conexões (segredo de plataforma). O adapter faz o I/O; aqui só
// orquestra e guarda a config (token cifrado, nunca devolvido).
const { Router } = require('express')
const { requireAuth } = require('../auth')
const { tenantScope } = require('../tenancy')
const { catalog, getAdapter } = require('../integrations')
const { encryptSecret, decryptSecret } = require('../settings')

const router = Router()
router.use(requireAuth(['admin', 'user']))
router.use(tenantScope())

// Nunca devolve o token. Só se ESTÁ configurado.
const dto = (c) => ({
  id: c._id, type: c.type, label: c.label, config: c.config || {},
  configured: !!c.tokenEnc, createdBy: c.createdBy, createdAt: c.createdAt,
})

// GET /api/integrations — catálogo de adapters + conexões já salvas.
router.get('/', async (req, res) => {
  const conns = await req.db.Connection.find({}).lean()
  res.json({ catalog: catalog(), connections: conns.map(dto) })
})

// POST /api/integrations — cria/atualiza uma conexão. body: { type, label, config, token }
router.post('/', async (req, res) => {
  const { type, label, config, token } = req.body ?? {}
  const adapter = getAdapter(type)
  if (!adapter) return res.status(400).json({ error: 'integração desconhecida ou indisponível' })
  if (adapter.needsToken && !token) return res.status(400).json({ error: 'token obrigatório para esta integração' })

  const tokenEnc = token ? encryptSecret(token) : undefined
  if (token && !tokenEnc) return res.status(500).json({ error: 'SETTINGS_ENCRYPTION_KEY não configurada — não dá para guardar o token com segurança' })

  const doc = await req.db.Connection.create({
    type, label: label || adapter.label, config: config && typeof config === 'object' ? config : {},
    tokenEnc: tokenEnc || null, createdBy: req.user?.name || req.user?.email || null,
  })
  res.status(201).json(dto(doc))
})

// POST /api/integrations/:id/test — testa a conexão salva.
router.post('/:id/test', async (req, res) => {
  const c = await req.db.Connection.findById(req.params.id).lean()
  if (!c) return res.status(404).json({ error: 'conexão não encontrada' })
  const adapter = getAdapter(c.type)
  if (!adapter) return res.status(400).json({ error: 'adapter indisponível' })
  const token = c.tokenEnc ? decryptSecret(c.tokenEnc) : null
  const result = await adapter.testConnection(c.config || {}, token)
  res.json(result)
})

// DELETE /api/integrations/:id
router.delete('/:id', async (req, res) => {
  await req.db.Connection.findByIdAndDelete(req.params.id)
  res.status(204).end()
})

module.exports = router
