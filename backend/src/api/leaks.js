const { Router } = require('express')
const { requireAuth } = require('../auth')
const LeakDomain = require('../models/LeakDomain')
const LeakedCredential = require('../models/LeakedCredential')
const { runSearch, ingest, getAssessment, normalizeDomain } = require('../leaks/search')
const { normalizeHudsonRock } = require('../leaks/hudsonrock')
const { listProviders } = require('../asm/leak-providers')
const { setLeakProviderCreds } = require('../settings')
const { cooldownRemainingMs, canForceCooldown } = require('../cooldown')

const router = Router()
router.use(requireAuth())

// P1-15: cooldown por domínio — evita reconsultar provider pago (DeHashed/
// LeakCheck Pro) repetidamente. Admin pode forçar (`force:true`) uma busca
// antecipada quando genuinamente necessário.
const SEARCH_COOLDOWN_MS = Number(process.env.LEAK_SEARCH_COOLDOWN_MS) || 6 * 60 * 60 * 1000

// ── Providers (status + chaves) — vive aqui pois vazamento é o dono do conceito ──
router.get('/providers', (_req, res) => res.json(listProviders()))

router.put('/providers/:id', requireAuth(['admin']), (req, res) => {
  const id = req.params.id
  if (!['hibp', 'dehashed', 'leakcheck'].includes(id)) return res.status(400).json({ error: 'provider inválido' })
  const { apiKey, apiUser } = req.body || {}
  res.json({ id, configured: setLeakProviderCreds(id, { apiKey, apiUser }) })
})

// ── Ingestão externa (browser-side) ────────────────────────────────────────────
// O navegador do operador consulta uma fonte cujo IP do servidor é bloqueado
// (Hudson Rock) e envia o JSON aqui. Normalizamos, mascaramos e persistimos.
router.post('/ingest', async (req, res) => {
  const { domain, source, raw } = req.body || {}
  if (!normalizeDomain(domain)) return res.status(400).json({ error: 'domínio inválido' })
  if (source !== 'hudsonrock') return res.status(400).json({ error: 'fonte de ingestão não suportada' })
  if (!raw || typeof raw !== 'object') return res.status(400).json({ error: 'payload vazio' })
  console.log('[ingest:hudsonrock]', domain, '| keys:', Object.keys(raw).join(','), '| famílias:', raw.stealerFamilies ? Object.keys(raw.stealerFamilies).length : 0, '| urls:', ((raw.data && (raw.data.all_urls || raw.data.employees_urls)) || []).length)
  const { breaches, aggregate, extra } = normalizeHudsonRock(domain, raw)
  const assessment = await ingest(domain, { breaches, aggregate, extra, providerIds: ['hudsonrock'], userName: req.user?.name || req.user?.email })
  res.json({ domain, source, ingested: breaches.length, thirdParties: (extra && extra.thirdPartyDomains ? extra.thirdPartyDomains.length : 0), assessment })
})

// ── Histórico de buscas ────────────────────────────────────────────────────────
router.get('/', async (_req, res) => {
  const list = await LeakDomain.find().sort({ updatedAt: -1 }).lean()
  res.json(list.map((d) => ({ ...d, id: d._id })))
})

// ── Nova busca (síncrona — providers são chamadas HTTP rápidas / mock offline) ──
router.post('/search', async (req, res) => {
  const domain = normalizeDomain(req.body?.domain)
  if (!domain) return res.status(400).json({ error: 'Domínio inválido. Ex.: fornecedor.com' })

  if (!canForceCooldown(req.body, req.user)) {
    const existing = await LeakDomain.findOne({ domain }).select('lastSearchAt').lean()
    const remaining = cooldownRemainingMs(existing?.lastSearchAt, SEARCH_COOLDOWN_MS)
    if (remaining > 0) {
      res.setHeader('Retry-After', String(Math.ceil(remaining / 1000)))
      return res.status(429).json({
        error: `Busca recente demais para este domínio. Aguarde ${Math.ceil(remaining / 60000)} min ou peça a um admin para forçar.`,
        retryAfterMs: remaining,
      })
    }
  }

  const result = await runSearch(domain, { userName: req.user?.name || req.user?.email })
  res.json(result)
})

// ── Assessment detalhado (KPIs, timeline, famílias, credenciais) ────────────────
// :domain pode ter pontos (penso.com.br) — Express lida bem. /providers já casou acima.
router.get('/:domain', async (req, res) => {
  const data = await getAssessment(req.params.domain)
  if (!data) return res.status(400).json({ error: 'domínio inválido' })
  res.json(data)
})

router.delete('/:domain', requireAuth(['admin']), async (req, res) => {
  const domain = normalizeDomain(req.params.domain)
  if (!domain) return res.status(400).json({ error: 'domínio inválido' })
  await Promise.all([
    LeakDomain.deleteOne({ domain }),
    LeakedCredential.deleteMany({ domain }),
  ])
  res.status(204).end()
})

module.exports = router
