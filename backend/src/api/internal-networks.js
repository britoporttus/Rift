const { Router } = require('express')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { requireAuth } = require('../auth')
const { tenantScope, resolveByTenantSecret } = require('../tenancy')
const { ingestReport } = require('../internal/ingest')

const router = Router()

// Scripts do agente carregados 1x (sem segredo embutido — o token vai por env).
// Duas plataformas: Python/nmap para Linux/macOS, PowerShell para Windows (que é
// a superfície mais comum dentro de rede de cliente e não tem Python garantido).
function loadAgent(file) {
  try { return fs.readFileSync(path.join(__dirname, '..', 'internal', file), 'utf8') }
  catch { return '# agente indisponível\n' }
}
const AGENT_SCRIPTS = {
  linux: { body: loadAgent('agent-template.py'), type: 'text/x-python' },
  windows: { body: loadAgent('agent-template.ps1'), type: 'text/plain' },
}

function toDto(d) {
  const o = d.toObject ? d.toObject() : d
  const dto = { ...o, id: o._id, _id: undefined }
  delete dto.enrollToken   // NUNCA expor o token nos DTOs normais — só via /agent-command (admin)
  return dto
}

// ── Rotas do AGENTE — auth por TOKEN (não cookie). ANTES do requireAuth global ──
// O agente roda dentro da rede do cliente e não tem sessão; autentica pelo
// enrollToken da rede. O parser JSON grande desta rota é montado no server.js.
router.post('/ingest', async (req, res) => {
  const token = String(req.headers['x-rift-agent-token'] || '')
  if (!token) return res.status(401).json({ error: 'token ausente' })
  // Frente 0: o agente não tem sessão, então o tenant é resolvido pelo próprio
  // enrollToken — que só existe dentro do banco de um tenant. Sem usuário, não
  // há `req.db` do middleware; esta é a única rota de dados que resolve assim.
  const hit = await resolveByTenantSecret('InternalNetwork', { enrollToken: token })
  if (!hit) return res.status(401).json({ error: 'token inválido' })
  const { db, doc: net } = hit
  if (!net.authorized) return res.status(403).json({ error: 'rede não autorizada — autorize no painel antes de coletar' })

  try {
    const result = await ingestReport(db, net._id, req.body || {}, { trigger: req.body?.trigger })
    res.status(202).json({ ok: true, ...result })
  } catch (err) {
    console.error('[internal:ingest]', err?.message)
    res.status(500).json({ error: 'falha ao processar coleta' })
  }
})

// Script do agente — público (não contém segredo; o token vai separado por env).
// ?platform=windows serve o PowerShell; sem parâmetro, o Python (compatível com
// os comandos já distribuídos).
router.get('/agent-script', (req, res) => {
  const p = req.query.platform === 'windows' ? 'windows' : 'linux'
  res.type(AGENT_SCRIPTS[p].type).send(AGENT_SCRIPTS[p].body)
})

// ── Daqui pra baixo: auth por cookie (operador logado) ──────────────────────────
router.use(requireAuth())
// Frente 0: resolve o tenant do usuário e injeta req.db (models ligados ao
// banco DELE). Sem tenant resolvido, nega — nunca segue para os models globais.
router.use(tenantScope())

router.get('/', async (req, res) => {
  const list = await req.db.InternalNetwork.find().sort({ updatedAt: -1 }).lean()
  res.json(list.map((d) => { const { enrollToken, ...rest } = d; return { ...rest, id: d._id } }))
})

router.post('/', async (req, res) => {
  const name = (req.body?.name || '').toString().trim().slice(0, 120)
  if (!name) return res.status(400).json({ error: 'Nome da rede é obrigatório' })
  const kind = ['lan', 'dmz', 'cloud', 'other'].includes(req.body?.kind) ? req.body.kind : 'lan'
  const scanDepth = ['medium', 'full'].includes(req.body?.scanDepth) ? req.body.scanDepth : 'medium'
  const authorized = req.body?.authorized === true
  const created = await req.db.InternalNetwork.create({
    name, kind, scanDepth,
    description: req.body?.description ? String(req.body.description).slice(0, 500) : null,
    authorized,
    authorizedBy: authorized ? (req.user?.name || req.user?.email || 'operador') : null,
    authorizedAt: authorized ? new Date() : null,
    authorizationNote: req.body?.authorizationNote ? String(req.body.authorizationNote).slice(0, 300) : null,
  })
  res.status(201).json(toDto(created))
})

router.get('/:id', async (req, res) => {
  const d = await req.db.InternalNetwork.findById(req.params.id)
  if (!d) return res.status(404).json({ error: 'not found' })
  res.json(toDto(d))
})

router.patch('/:id', async (req, res) => {
  const patch = {}
  if (req.body?.name != null) patch.name = String(req.body.name).slice(0, 120)
  if (['lan', 'dmz', 'cloud', 'other'].includes(req.body?.kind)) patch.kind = req.body.kind
  if (req.body?.description != null) patch.description = String(req.body.description).slice(0, 500)
  const d = await req.db.InternalNetwork.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true })
  if (!d) return res.status(404).json({ error: 'not found' })
  res.json(toDto(d))
})

router.delete('/:id', requireAuth(['admin']), async (req, res) => {
  const d = await req.db.InternalNetwork.findByIdAndDelete(req.params.id)
  if (!d) return res.status(404).json({ error: 'not found' })
  await Promise.all([
    req.db.InternalHost.deleteMany({ networkId: req.params.id }),
    req.db.InternalScan.deleteMany({ networkId: req.params.id }),
  ])
  res.status(204).end()
})

// Gate legal — o operador confirma que tem permissão de escanear a rede.
router.patch('/:id/authorization', requireAuth(['admin']), async (req, res) => {
  const authorized = !!req.body?.authorized
  const patch = {
    authorized,
    authorizedBy: authorized ? (req.user?.name || req.user?.email || 'admin') : null,
    authorizedAt: authorized ? new Date() : null,
    authorizationNote: req.body?.note ? String(req.body.note).slice(0, 300) : null,
  }
  const d = await req.db.InternalNetwork.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true })
  if (!d) return res.status(404).json({ error: 'not found' })
  res.json(toDto(d))
})

// ?status=online devolve só os presentes na última coleta que cobriu o CIDR
// deles; sem o filtro vêm todos (os sumidos com status='gone'), pra o painel
// poder mostrar o histórico do que deixou a rede.
router.get('/:id/hosts', async (req, res) => {
  const q = { networkId: req.params.id }
  if (req.query.status === 'online') q.status = { $ne: 'gone' }
  const list = await req.db.InternalHost.find(q).sort({ status: 1, severity: 1, ip: 1 }).lean()
  res.json(list.map((h) => ({ ...h, id: h._id })))
})

router.get('/:id/history', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200)
  const list = await req.db.InternalScan.find({ networkId: req.params.id }).sort({ ranAt: -1 }).limit(limit).lean()
  res.json(list.map((s) => ({ ...s, id: s._id })))
})

// Regera o token (invalida o agente antigo) — admin.
router.post('/:id/regenerate-token', requireAuth(['admin']), async (req, res) => {
  const token = crypto.randomBytes(24).toString('hex')
  const d = await req.db.InternalNetwork.findByIdAndUpdate(req.params.id, { $set: { enrollToken: token } }, { new: true })
  if (!d) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true, token })
})

// Comando do agente (com token em claro) — só admin pode ver o token.
router.get('/:id/agent-command', requireAuth(['admin']), async (req, res) => {
  const d = await req.db.InternalNetwork.findById(req.params.id)
  if (!d) return res.status(404).json({ error: 'not found' })
  // Origem que o operador acessou (respeita proxy do Next) → URL correta no comando.
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0]
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'localhost')
  const base = `${proto}://${host}`
  const depth = d.scanDepth === 'full' ? 'full' : 'medium'   // agente lê via RIFT_DEPTH
  res.json({
    token: d.enrollToken,
    scanDepth: depth,
    scriptUrl: `${base}/api/internal-networks/agent-script`,
    // Linux: precisa de root (ARP ping + detecção de OS). Windows: PowerShell
    // como Administrador, mesmo motivo.
    command: `curl -s ${base}/api/internal-networks/agent-script -o rift-agente.py && RIFT_URL=${base} RIFT_TOKEN=${d.enrollToken} RIFT_DEPTH=${depth} sudo -E python3 rift-agente.py`,
    commandWindows: `$env:RIFT_URL='${base}'; $env:RIFT_TOKEN='${d.enrollToken}'; $env:RIFT_DEPTH='${depth}'; ` +
      `iwr '${base}/api/internal-networks/agent-script?platform=windows' -OutFile rift-agente.ps1; ` +
      `powershell -ExecutionPolicy Bypass -File .\\rift-agente.ps1`,
    watchHint: `# contínuo (a cada 15 min): acrescente --watch 900 (Linux) ou -Watch 900 (Windows) ao final`,
  })
})

module.exports = router
