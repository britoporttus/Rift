const { Router } = require('express')
const { requireAuth } = require('../auth')
const Domain = require('../models/Domain')
const DomainAsset = require('../models/DomainAsset')
const Finding = require('../models/Finding')
const LeakedCredential = require('../models/LeakedCredential')
const LeakDomain = require('../models/LeakDomain')
const Engagement = require('../models/Engagement')
const { createBuilder, addDomainBundle, normHost, hostMatchesDomain } = require('../graph/build')

// Mapa de Superfície — endpoint de VISUALIZAÇÃO sobre os dados já coletados. Dois modos:
//   GET /api/graph/domain/:id → grafo de UM domínio
//   GET /api/graph            → grafo GLOBAL (todos os domínios + hubs compartilhados)
const router = Router()
router.use(requireAuth())

// P1-18 (auditoria 2026-07-20): o grafo GLOBAL fazia `find()` sem `.limit()` em
// 6 coleções A CADA requisição, sem cache — o custo de MONTAR o payload cresce
// conforme Finding/DomainAsset aumentam (o cap de 2000 nós em graph/build.js só
// protege o tamanho da RESPOSTA, não o custo de chegar lá). É uma camada de
// visualização sobre dado que não muda a cada segundo, então um cache de TTL
// curto é seguro — pior caso, o operador vê o grafo até `GRAPH_CACHE_TTL_MS`
// atrasado em relação ao scan/finding mais recente.
const GRAPH_CACHE_TTL_MS = Number(process.env.GRAPH_CACHE_TTL_MS) || 30_000
let globalGraphCache = null // { at: number, data: object }

function getGlobalGraphCache(now = Date.now()) {
  if (globalGraphCache && (now - globalGraphCache.at) < GRAPH_CACHE_TTL_MS) return globalGraphCache.data
  return null
}
function setGlobalGraphCache(data, now = Date.now()) {
  globalGraphCache = { at: now, data }
}
function clearGlobalGraphCache() { globalGraphCache = null }

function groupBy(arr, key) {
  const m = new Map()
  for (const x of arr) {
    const k = x[key]
    if (k == null) continue
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(x)
  }
  return m
}

// Findings ligam por engagement.target ≈ domínio (apex). Resolve, por domínio, os
// engagementIds cujo target é o domínio ou um subdomínio dele.
function findingsForDomain(domainStr, engagements, findingsByEng) {
  const ids = engagements
    .filter((e) => hostMatchesDomain(normHost(e.target), domainStr))
    .map((e) => e._id)
  const out = []
  for (const id of ids) {
    const fs = findingsByEng.get(id)
    if (fs) out.push(...fs)
  }
  return out
}

// ── Grafo de UM domínio ─────────────────────────────────────────────────────────
router.get('/domain/:id', async (req, res) => {
  const domain = await Domain.findById(req.params.id).lean()
  if (!domain) return res.status(404).json({ error: 'not found' })

  const [assets, leaks, leakDomain, engagements] = await Promise.all([
    DomainAsset.find({ domainId: domain._id }).lean(),
    LeakedCredential.find({ domain: domain.domain }).lean(),
    LeakDomain.findOne({ domain: domain.domain }).lean(),
    Engagement.find({}, { _id: 1, target: 1 }).lean(),
  ])

  const engIds = engagements
    .filter((e) => hostMatchesDomain(normHost(e.target), domain.domain))
    .map((e) => e._id)
  const findings = engIds.length ? await Finding.find({ engagementId: { $in: engIds } }).lean() : []

  const b = createBuilder()
  addDomainBundle(b, {
    domain,
    assets,
    findings,
    leaks,
    aggFamilies: (leakDomain && leakDomain.agg && leakDomain.agg.families) || {},
  })
  res.json(b.result())
})

// ── Grafo GLOBAL ─────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const cached = getGlobalGraphCache()
  if (cached && req.query.fresh !== '1') return res.json(cached)

  const [domains, assets, leaks, leakDomains, engagements, findings] = await Promise.all([
    Domain.find().lean(),
    DomainAsset.find().lean(),
    LeakedCredential.find().lean(),
    LeakDomain.find({}, { domain: 1, agg: 1 }).lean(),
    Engagement.find({}, { _id: 1, target: 1 }).lean(),
    Finding.find().lean(),
  ])

  const assetsByDomainId = groupBy(assets, 'domainId')
  const leaksByDomain = groupBy(leaks, 'domain')
  const findingsByEng = groupBy(findings, 'engagementId')
  const aggByDomain = new Map(leakDomains.map((l) => [l.domain, (l.agg && l.agg.families) || {}]))

  const b = createBuilder()
  for (const domain of domains) {
    addDomainBundle(b, {
      domain,
      assets: assetsByDomainId.get(domain._id) || [],
      findings: findingsForDomain(domain.domain, engagements, findingsByEng),
      leaks: leaksByDomain.get(domain.domain) || [],
      aggFamilies: aggByDomain.get(domain.domain) || {},
    })
  }
  const data = b.result()
  setGlobalGraphCache(data)
  res.json(data)
})

module.exports = router
module.exports.getGlobalGraphCache = getGlobalGraphCache
module.exports.setGlobalGraphCache = setGlobalGraphCache
module.exports.clearGlobalGraphCache = clearGlobalGraphCache
