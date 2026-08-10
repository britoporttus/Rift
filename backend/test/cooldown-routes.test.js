// P1-15: confirma que as rotas de fato aplicam o cooldown (não só a função pura).
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'

const leaksRouter = require('../src/api/leaks')
const domainsRouter = require('../src/api/domains')
const LeakDomain = require('../src/models/LeakDomain')
const Domain = require('../src/models/Domain')

// Frente 0: rotas usam req.db; db falso apontando para os models monkeypatchados.
const db = { LeakDomain, Domain }

function fakeRes() {
  const res = { statusCode: null, body: null, headers: {} }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  res.setHeader = (k, v) => { res.headers[k] = v }
  return res
}

function findHandler(router, method, path) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method])
  return layer.route.stack[layer.route.stack.length - 1].handle
}

test('POST /api/leaks/search: 429 quando busca recente (cooldown ativo)', async () => {
  const original = LeakDomain.findOne
  LeakDomain.findOne = () => ({ select: () => ({ lean: async () => ({ lastSearchAt: new Date() }) }) })
  try {
    const handle = findHandler(leaksRouter, 'post', '/search')
    const req = { db, body: { domain: 'fornecedor.com' }, user: { role: 'user' } }
    const res = fakeRes()
    await handle(req, res, (err) => { throw err })
    assert.equal(res.statusCode, 429)
    assert.ok(res.headers['Retry-After'])
  } finally { LeakDomain.findOne = original }
})

// A cobertura do bypass (`force:true` + admin) fica em cooldown.test.js
// (canForceCooldown, pura e rápida) — testar aqui exigiria deixar o handler
// seguir até runSearch(), que bate em Mongo/rede real e pendura o processo de
// teste por ~10s no timeout de buffering do mongoose.

test('POST /api/domains/:id/scan: 429 quando scan recente (cooldown ativo)', async () => {
  const original = Domain.findById
  Domain.findById = async () => ({ _id: 'd1', scanState: 'done', lastScanAt: new Date(), authorized: false, verification: { status: 'verified' } })
  try {
    const handle = findHandler(domainsRouter, 'post', '/:id/scan')
    const req = { db, params: { id: 'd1' }, body: {}, user: { role: 'user' } }
    const res = fakeRes()
    await handle(req, res, (err) => { throw err })
    assert.equal(res.statusCode, 429)
    assert.ok(res.headers['Retry-After'])
  } finally { Domain.findById = original }
})

test('POST /api/domains/:id/scan: scanState=scanning continua barrado com 409 (não regride pro 429)', async () => {
  const original = Domain.findById
  Domain.findById = async () => ({ _id: 'd1', scanState: 'scanning', lastScanAt: new Date(), authorized: false, verification: { status: 'verified' } })
  try {
    const handle = findHandler(domainsRouter, 'post', '/:id/scan')
    const req = { db, params: { id: 'd1' }, body: {}, user: { role: 'user' } }
    const res = fakeRes()
    await handle(req, res, (err) => { throw err })
    assert.equal(res.statusCode, 409)
  } finally { Domain.findById = original }
})
