// P1-18 (auditoria 2026-07-20): GET /api/graph fazia find() sem .limit() em 6
// coleções A CADA requisição, sem cache — custo cresce conforme
// Finding/DomainAsset aumentam. Cache de TTL curto (visualização sobre dado
// que não muda a cada segundo). Ver docs/ROADMAP-AUDITORIA-2026-07-20.md.
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'
const router = require('../src/api/graph')
const Domain = require('../src/models/Domain')
const DomainAsset = require('../src/models/DomainAsset')
const LeakedCredential = require('../src/models/LeakedCredential')
const LeakDomain = require('../src/models/LeakDomain')
const Engagement = require('../src/models/Engagement')
const Finding = require('../src/models/Finding')

function findHandler(method, path) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method])
  return layer.route.stack[layer.route.stack.length - 1].handle
}

function fakeRes() {
  const res = { body: null }
  res.json = (body) => { res.body = body; return res }
  return res
}

function stubAllModels() {
  let calls = 0
  const lean = (v) => ({ lean: async () => v })
  const originals = {
    Domain: Domain.find, DomainAsset: DomainAsset.find, LeakedCredential: LeakedCredential.find,
    LeakDomain: LeakDomain.find, Engagement: Engagement.find, Finding: Finding.find,
  }
  Domain.find = () => { calls++; return lean([]) }
  DomainAsset.find = () => lean([])
  LeakedCredential.find = () => lean([])
  LeakDomain.find = () => lean([])
  Engagement.find = () => lean([])
  Finding.find = () => lean([])
  const restore = () => {
    Domain.find = originals.Domain
    DomainAsset.find = originals.DomainAsset
    LeakedCredential.find = originals.LeakedCredential
    LeakDomain.find = originals.LeakDomain
    Engagement.find = originals.Engagement
    Finding.find = originals.Finding
  }
  return { getCalls: () => calls, restore }
}

test('GET /api/graph: segunda chamada dentro do TTL usa cache (não bate no banco de novo)', async () => {
  router.clearGlobalGraphCache()
  const { getCalls, restore } = stubAllModels()
  try {
    const handle = findHandler('get', '/')
    await handle({ query: {} }, fakeRes(), (e) => { throw e })
    await handle({ query: {} }, fakeRes(), (e) => { throw e })
    assert.equal(getCalls(), 1, 'segunda chamada deveria vir do cache, sem nova query')
  } finally { restore() }
})

test('GET /api/graph: ?fresh=1 ignora o cache', async () => {
  router.clearGlobalGraphCache()
  const { getCalls, restore } = stubAllModels()
  try {
    const handle = findHandler('get', '/')
    await handle({ query: {} }, fakeRes(), (e) => { throw e })
    await handle({ query: { fresh: '1' } }, fakeRes(), (e) => { throw e })
    assert.equal(getCalls(), 2, '?fresh=1 deveria forçar nova query mesmo com cache válido')
  } finally { restore() }
})

test('GET /api/graph: cache expirado (TTL) força nova query', async () => {
  router.clearGlobalGraphCache()
  const { getCalls, restore } = stubAllModels()
  try {
    const handle = findHandler('get', '/')
    await handle({ query: {} }, fakeRes(), (e) => { throw e })
    // Simula expiração sem depender de tempo real: seta o cache com timestamp
    // no passado (bem além do TTL) diretamente via setGlobalGraphCache.
    router.setGlobalGraphCache({ nodes: [], edges: [], stats: {} }, Date.now() - 10 * 60 * 1000)
    await handle({ query: {} }, fakeRes(), (e) => { throw e })
    assert.equal(getCalls(), 2, 'cache expirado deveria forçar nova query')
  } finally { restore() }
})

test('GET /api/graph: cache dentro do TTL devolve exatamente o mesmo objeto (sem remontar)', async () => {
  router.clearGlobalGraphCache()
  const { restore } = stubAllModels()
  try {
    const handle = findHandler('get', '/')
    const res1 = fakeRes()
    await handle({ query: {} }, res1, (e) => { throw e })
    const res2 = fakeRes()
    await handle({ query: {} }, res2, (e) => { throw e })
    assert.strictEqual(res1.body, res2.body)
  } finally { restore() }
})
