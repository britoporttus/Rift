const { Router } = require('express')
const { requireAuth } = require('../auth')
const { tenantScope } = require('../tenancy')
const { generateToken, verificationInstructions, verifyDomain } = require('../domain-verify')
const { canAddDomain, planFor } = require('../plans')
const scanner = require('../asm/scanner')
const { absFor } = require('../asm/screenshots')
const { isIpLiteral } = require('../net-guard')
const { cooldownRemainingMs, canForceCooldown } = require('../cooldown')
const { assertSafeHost, fetchRaw } = require('../session-harness')
const { extractEmails, derivePattern, correlate } = require('../people-discovery')

const router = Router()
router.use(requireAuth())
// Frente 0: resolve o tenant do usuário e injeta req.db (models ligados ao
// banco DELE). Sem tenant resolvido, nega — nunca segue para os models globais.
router.use(tenantScope())

// P1-15: cooldown por domínio — evita reabrir scan (nmap/httpx/nuclei via
// binários externos) em loop apertado. Admin pode forçar (`force:true`).
const SCAN_COOLDOWN_MS = Number(process.env.ASM_SCAN_COOLDOWN_MS) || 30 * 60 * 1000

// Normaliza uma entrada de domínio: tira esquema/caminho/porta/www, minúsculas.
// Valida formato de domínio (evita lixo / injeção — mesmo que execFile já isole).
// Rejeita literais de IP (127.0.0.1, 169.254.169.254, etc.) — cadastrar um IP
// como "domínio" contornaria a validação de rede privada/metadata do scanner
// (SSRF), já que o probe ativo (httpx/nuclei) trata qualquer host cadastrado
// como alvo legítimo.
function normalizeDomain(raw) {
  if (!raw || typeof raw !== 'string') return null
  let d = raw.trim().toLowerCase()
  d = d.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].replace(/^www\./, '').replace(/\.$/, '')
  if (isIpLiteral(d)) return null
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) return null
  return d
}

function toDto(d) {
  const o = d.toObject ? d.toObject() : d
  return { ...o, id: o._id, _id: undefined }
}

// ── CRUD de domínios ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const list = await req.db.Domain.find().sort({ updatedAt: -1 }).lean()
  // Resumo de findings por severidade (exposições) por domínio — a home mostra isso
  // como um strip colorido. Uma agregação só pra toda a lista (barata).
  const agg = await req.db.DomainAsset.aggregate([
    { $match: { type: 'exposure', severity: { $in: ['critical', 'high', 'medium', 'low'] } } },
    { $group: { _id: { domainId: '$domainId', severity: '$severity' }, n: { $sum: 1 } } },
  ]).catch(() => [])
  const bySev = {}
  for (const r of agg) {
    const did = r._id.domainId
    ;(bySev[did] = bySev[did] || {})[r._id.severity] = r.n
  }
  res.json(list.map((d) => ({ ...d, id: d._id, severityCounts: bySev[d._id] || {} })))
})

router.post('/', async (req, res) => {
  const domain = normalizeDomain(req.body?.domain)
  if (!domain) return res.status(400).json({ error: 'Domínio inválido. Ex.: fornecedor.com' })
  const existing = await req.db.Domain.findOne({ domain })
  if (existing) return res.status(409).json({ error: 'Domínio já cadastrado', id: existing._id })

  // Teto de domínios do plano (free = 3 por padrão). Explica o motivo em vez de
  // só recusar — o 403 seco não diz ao cliente o que fazer.
  const count = await req.db.Domain.countDocuments()
  const gate = canAddDomain(req.tenant, count)
  if (!gate.allowed) {
    return res.status(403).json({
      error: `O plano ${planFor(req.tenant).label} permite até ${gate.limit} domínios (você tem ${gate.current}).`,
      code: 'PLAN_DOMAIN_LIMIT', limit: gate.limit, current: gate.current,
    })
  }

  const kind = ['vendor', 'partner', 'internal', 'other'].includes(req.body?.kind) ? req.body.kind : 'vendor'
  // Nasce PENDENTE de verificação, com token já emitido: a UI mostra a
  // instrução imediatamente, sem um passo extra de "pedir para verificar".
  const token = generateToken()
  const created = await req.db.Domain.create({
    domain,
    name: (req.body?.name || domain).toString().slice(0, 120),
    kind,
    notes: req.body?.notes ? String(req.body.notes).slice(0, 500) : null,
    verification: { status: 'pending', token, issuedAt: new Date() },
  })
  res.status(201).json({ ...toDto(created), instructions: verificationInstructions(domain, token) })
})

// ── Prova de posse ────────────────────────────────────────────────────────────
// GET: o que publicar. Reemite o token se o domínio ainda não tem um.
router.get('/:id/verification', async (req, res) => {
  const d = await req.db.Domain.findById(req.params.id)
  if (!d) return res.status(404).json({ error: 'not found' })
  let token = d.verification?.token
  if (!token) {
    token = generateToken()
    await req.db.Domain.findByIdAndUpdate(d._id, { $set: { 'verification.token': token, 'verification.issuedAt': new Date() } })
  }
  res.json({
    status: d.verification?.status || 'pending',
    method: d.verification?.method || null,
    verifiedAt: d.verification?.verifiedAt || null,
    lastError: d.verification?.lastError || null,
    instructions: verificationInstructions(d.domain, token),
  })
})

// POST: roda a checagem agora (DNS primeiro, depois HTTP).
router.post('/:id/verification', async (req, res) => {
  const d = await req.db.Domain.findById(req.params.id)
  if (!d) return res.status(404).json({ error: 'not found' })
  if (d.verification?.status === 'verified') return res.json({ status: 'verified', method: d.verification.method })

  let token = d.verification?.token
  if (!token) {
    token = generateToken()
    await req.db.Domain.findByIdAndUpdate(d._id, { $set: { 'verification.token': token, 'verification.issuedAt': new Date() } })
  }

  const result = await verifyDomain(d.domain, token)
  const now = new Date()
  const set = result.ok
    ? { 'verification.status': 'verified', 'verification.method': result.method, 'verification.verifiedAt': now, 'verification.lastCheckAt': now, 'verification.lastError': null }
    : { 'verification.status': 'failed', 'verification.lastCheckAt': now, 'verification.lastError': String(result.error).slice(0, 400) }
  const updated = await req.db.Domain.findByIdAndUpdate(d._id, { $set: set, $inc: { 'verification.attempts': 1 } }, { new: true })

  if (!result.ok) {
    return res.status(422).json({
      status: 'failed', error: result.error,
      instructions: verificationInstructions(d.domain, token),
    })
  }
  res.json({ status: 'verified', method: result.method, domain: toDto(updated) })
})

router.get('/:id', async (req, res) => {
  const d = await req.db.Domain.findById(req.params.id)
  if (!d) return res.status(404).json({ error: 'not found' })
  res.json(toDto(d))
})

router.patch('/:id', async (req, res) => {
  const patch = {}
  if (req.body?.name != null) patch.name = String(req.body.name).slice(0, 120)
  if (['vendor', 'partner', 'internal', 'other'].includes(req.body?.kind)) patch.kind = req.body.kind
  if (req.body?.notes != null) patch.notes = String(req.body.notes).slice(0, 500)
  const d = await req.db.Domain.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true })
  if (!d) return res.status(404).json({ error: 'not found' })
  res.json(toDto(d))
})

router.delete('/:id', requireAuth(['admin']), async (req, res) => {
  const d = await req.db.Domain.findByIdAndDelete(req.params.id)
  if (!d) return res.status(404).json({ error: 'not found' })
  // Só remove os ativos ASM + histórico de scans. As credenciais vazadas pertencem
  // ao módulo Vazamentos (keyed por string de domínio) e sobrevivem à exclusão.
  await Promise.all([
    req.db.DomainAsset.deleteMany({ domainId: req.params.id }),
    req.db.DomainScan.deleteMany({ domainId: req.params.id }),
  ])
  res.status(204).end()
})

// ── Autorização (gate legal — só admin) ───────────────────────────────────────
// Autorizar desbloqueia probe ativo (httpx/nuclei) e providers reais de leak.
// Representa a cláusula contratual/onboarding do fornecedor.
router.patch('/:id/authorization', requireAuth(['admin']), async (req, res) => {
  const authorized = !!req.body?.authorized
  const patch = {
    authorized,
    authorizedBy: authorized ? (req.user?.name || req.user?.email || 'admin') : null,
    authorizedAt: authorized ? new Date() : null,
    authorizationNote: req.body?.note ? String(req.body.note).slice(0, 300) : null,
  }
  const d = await req.db.Domain.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true })
  if (!d) return res.status(404).json({ error: 'not found' })
  res.json(toDto(d))
})

// ── Scan ──────────────────────────────────────────────────────────────────────
// Dispara o scan passivo (fire-and-forget). O estado vive no Domain (front faz polling).
router.post('/:id/scan', async (req, res) => {
  const d = await req.db.Domain.findById(req.params.id)
  if (!d) return res.status(404).json({ error: 'not found' })
  if (d.scanState === 'scanning') return res.status(409).json({ error: 'scan já em andamento' })

  // Prova de posse antes de qualquer coisa. O gate também existe dentro do
  // scanner (para o scheduler não contornar); aqui ele responde um erro
  // ACIONÁVEL — com a instrução do que publicar — em vez de só recusar.
  const blocked = scanner.scanBlockReason(d)
  if (blocked) {
    return res.status(403).json({
      error: blocked, code: 'DOMAIN_NOT_VERIFIED',
      instructions: verificationInstructions(d.domain, d.verification?.token || null),
    })
  }

  if (!canForceCooldown(req.body, req.user)) {
    const remaining = cooldownRemainingMs(d.lastScanAt, SCAN_COOLDOWN_MS)
    if (remaining > 0) {
      res.setHeader('Retry-After', String(Math.ceil(remaining / 1000)))
      return res.status(429).json({
        error: `Scan recente demais para este domínio. Aguarde ${Math.ceil(remaining / 60000)} min ou peça a um admin para forçar.`,
        retryAfterMs: remaining,
      })
    }
  }

  scanner.runScan(req.db, d._id, { userName: req.user?.name || req.user?.email, trigger: 'manual' })
    .catch((err) => console.error('[asm] runScan falhou:', err?.message))
  res.status(202).json({ ok: true, message: d.authorized ? 'Scan iniciado (passivo + probe ativo autorizado).' : 'Scan iniciado (modo passivo — autorize o domínio para probe ativo).' })
})

// ── Histórico de monitoramento ──────────────────────────────────────────────
// Linha do tempo de scans do domínio (monitoramento é contínuo/sempre-ativo).
router.get('/:id/history', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200)
  const list = await req.db.DomainScan.find({ domainId: req.params.id }).sort({ ranAt: -1 }).limit(limit).lean()
  res.json(list.map((s) => ({ ...s, id: s._id })))
})

// GET /:id/people — correlação leve (#4): e-mails/pessoas do domínio, cruzados
// com os vazamentos já coletados. Fonte principal = superfície pública do PRÓPRIO
// alvo (compliant). Anti-SSRF no fetch (mesmo padrão do ASM/harness).
const PEOPLE_PATHS = ['/', '/contato', '/contact', '/sobre', '/about', '/equipe', '/team', '/quem-somos']
router.get('/:id/people', async (req, res) => {
  const dom = await req.db.Domain.findById(req.params.id).lean()
  if (!dom) return res.status(404).json({ error: 'domínio não encontrado' })

  // 1) Superfície pública: busca poucas páginas comuns, extrai e-mails do domínio.
  const surface = new Set()
  const fetched = []
  for (const path of PEOPLE_PATHS.slice(0, 6)) {
    const url = `https://${dom.domain}${path}`
    try {
      await assertSafeHost(dom.domain)
      const r = await fetchRaw(url, { method: 'GET', headers: { 'user-agent': 'Rift-PeopleDiscovery/1.0' }, timeoutMs: 7000 })
      fetched.push({ path, status: r.status })
      if (r.status >= 200 && r.status < 400) for (const e of extractEmails(r.body, dom.domain)) surface.add(e)
    } catch (e) {
      fetched.push({ path, error: e instanceof Error ? e.message : 'falha' })
      // anti-SSRF recusou o host inteiro → não adianta tentar os outros paths
      if (/anti-SSRF|resolver/.test(String(e?.message))) break
    }
  }
  const emails = [...surface]

  // 2) Cruza com os vazamentos já coletados (LeakedCredential.account já mascarado).
  const leaks = await req.db.LeakedCredential.find({ domain: dom.domain }).select('account').lean().catch(() => [])
  const leakedSet = new Set(leaks.map((l) => l.account).filter(Boolean))

  // 3) Correlaciona (mascara + marca vazado) e junta contas vazadas que não
  //    apareceram na superfície (pessoas em breach, mas não publicadas).
  // Operador INTERNO (admin/user) vê o e-mail completo — é dado público do próprio
  // alvo e ele precisa validar a pessoa. CLIENTE segue mascarado (LGPD). Contas de
  // vazamento só existem mascaradas na base, então ficam mascaradas para todos.
  const internal = !!req.user && req.user.role !== 'client'
  const surfacePeople = correlate(emails, leakedSet)
  const surfaceMasked = new Set(surfacePeople.map((p) => p.masked))
  const leakedOnly = [...leakedSet].filter((a) => !surfaceMasked.has(a)).map((masked) => ({ email: masked, masked, role: false, inLeak: true, source: 'leak' }))
  const people = [...surfacePeople.map((p) => ({ ...p, source: 'surface' })), ...leakedOnly]
    .sort((a, b) => Number(b.inLeak) - Number(a.inLeak) || Number(a.role) - Number(b.role))
    .map((p) => ({ account: internal ? p.email : p.masked, role: p.role, inLeak: p.inLeak, source: p.source }))

  res.json({
    domain: dom.domain,
    pattern: derivePattern(emails),
    people,
    counts: {
      people: people.filter((p) => !p.role).length,
      roles: people.filter((p) => p.role).length,
      leaked: people.filter((p) => p.inLeak).length,
    },
    providers: [
      { id: 'surface', label: 'Superfície pública do alvo', configured: true },
      { id: 'hunter', label: 'Hunter.io', needsKey: true, configured: false },   // plugável quando houver chave
    ],
    fetched,
  })
})

// ── Ativos e credenciais ────────────────────────────────────────────────────
router.get('/:id/assets', async (req, res) => {
  const q = { domainId: req.params.id }
  if (req.query.type) q.type = req.query.type
  const list = await req.db.DomainAsset.find(q).sort({ severity: 1, alive: -1, value: 1 }).lean()
  res.json(list.map((a) => ({ ...a, id: a._id })))
})

// Screenshot do recon visual (Fase 4). Autenticado (cookie) como todo o router →
// o <img> do front envia o cookie sozinho. O caminho vem do asset (não do usuário);
// mesmo assim absFor() valida que resolve DENTRO do storage (guard de travessia).
router.get('/:id/screenshot/:assetId', async (req, res) => {
  const asset = await req.db.DomainAsset.findOne({ _id: req.params.assetId, domainId: req.params.id })
    .select('screenshotPath').lean()
  if (!asset || !asset.screenshotPath) return res.status(404).end()
  const abs = absFor(asset.screenshotPath)
  if (!abs) return res.status(404).end()
  res.type('png')
  res.sendFile(abs, (err) => { if (err && !res.headersSent) res.status(404).end() })
})

module.exports = router
module.exports.normalizeDomain = normalizeDomain
