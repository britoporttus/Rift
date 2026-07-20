const { Router } = require('express')
const { requireAuth } = require('../auth')
const Domain = require('../models/Domain')
const DomainAsset = require('../models/DomainAsset')
const scanner = require('../asm/scanner')
const { isIpLiteral } = require('../net-guard')
const { cooldownRemainingMs, canForceCooldown } = require('../cooldown')

const router = Router()
router.use(requireAuth())

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
router.get('/', async (_req, res) => {
  const list = await Domain.find().sort({ updatedAt: -1 }).lean()
  res.json(list.map((d) => ({ ...d, id: d._id })))
})

router.post('/', async (req, res) => {
  const domain = normalizeDomain(req.body?.domain)
  if (!domain) return res.status(400).json({ error: 'Domínio inválido. Ex.: fornecedor.com' })
  const existing = await Domain.findOne({ domain })
  if (existing) return res.status(409).json({ error: 'Domínio já cadastrado', id: existing._id })

  const kind = ['vendor', 'partner', 'internal', 'other'].includes(req.body?.kind) ? req.body.kind : 'vendor'
  const created = await Domain.create({
    domain,
    name: (req.body?.name || domain).toString().slice(0, 120),
    kind,
    notes: req.body?.notes ? String(req.body.notes).slice(0, 500) : null,
  })
  res.status(201).json(toDto(created))
})

router.get('/:id', async (req, res) => {
  const d = await Domain.findById(req.params.id)
  if (!d) return res.status(404).json({ error: 'not found' })
  res.json(toDto(d))
})

router.patch('/:id', async (req, res) => {
  const patch = {}
  if (req.body?.name != null) patch.name = String(req.body.name).slice(0, 120)
  if (['vendor', 'partner', 'internal', 'other'].includes(req.body?.kind)) patch.kind = req.body.kind
  if (req.body?.notes != null) patch.notes = String(req.body.notes).slice(0, 500)
  const d = await Domain.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true })
  if (!d) return res.status(404).json({ error: 'not found' })
  res.json(toDto(d))
})

router.delete('/:id', requireAuth(['admin']), async (req, res) => {
  const d = await Domain.findByIdAndDelete(req.params.id)
  if (!d) return res.status(404).json({ error: 'not found' })
  // Só remove os ativos ASM. As credenciais vazadas pertencem ao módulo Vazamentos
  // (keyed por string de domínio) e sobrevivem à exclusão do domínio ASM.
  await DomainAsset.deleteMany({ domainId: req.params.id })
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
  const d = await Domain.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true })
  if (!d) return res.status(404).json({ error: 'not found' })
  res.json(toDto(d))
})

// ── Scan ──────────────────────────────────────────────────────────────────────
// Dispara o scan passivo (fire-and-forget). O estado vive no Domain (front faz polling).
router.post('/:id/scan', async (req, res) => {
  const d = await Domain.findById(req.params.id)
  if (!d) return res.status(404).json({ error: 'not found' })
  if (d.scanState === 'scanning') return res.status(409).json({ error: 'scan já em andamento' })

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

  scanner.runScan(d._id, { userName: req.user?.name || req.user?.email })
    .catch((err) => console.error('[asm] runScan falhou:', err?.message))
  res.status(202).json({ ok: true, message: d.authorized ? 'Scan iniciado (passivo + probe ativo autorizado).' : 'Scan iniciado (modo passivo — autorize o domínio para probe ativo).' })
})

// ── Ativos e credenciais ────────────────────────────────────────────────────
router.get('/:id/assets', async (req, res) => {
  const q = { domainId: req.params.id }
  if (req.query.type) q.type = req.query.type
  const list = await DomainAsset.find(q).sort({ severity: 1, alive: -1, value: 1 }).lean()
  res.json(list.map((a) => ({ ...a, id: a._id })))
})

module.exports = router
module.exports.normalizeDomain = normalizeDomain
