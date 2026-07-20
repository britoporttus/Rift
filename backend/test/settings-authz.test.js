// P1-13 (auditoria 2026-07-20): PUT /api/settings/model trocava o modelo do
// agente GLOBALMENTE (todos os engagements/usuários) sem exigir role admin —
// inconsistente com PUT /api/leaks/providers/:id (já admin-only). Ver
// docs/ROADMAP-AUDITORIA-2026-07-20.md.
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'
const router = require('../src/api/settings')
const { signToken, COOKIE_NAME } = require('../src/auth')
const User = require('../src/models/User')

function stubFindById(result) {
  const original = User.findById
  User.findById = () => ({ select: () => ({ lean: async () => result }) })
  return () => { User.findById = original }
}

function fakeRes() {
  const res = { statusCode: null, body: null }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

function routeStack(method, path) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method])
  if (!layer) throw new Error(`rota não encontrada: ${method.toUpperCase()} ${path}`)
  return layer.route.stack.map((s) => s.handle)
}

function reqWithToken(role) {
  const token = signToken({ _id: 'u1', email: 'a@b.com', role, name: 'A', tokenVersion: 0 })
  return { cookies: { [COOKIE_NAME]: token }, headers: {} }
}

test('PUT /model rejeita role "user" com 403 antes de chegar no handler', async () => {
  const restore = stubFindById({ tokenVersion: 0 })
  try {
    const [authzMiddleware] = routeStack('put', '/model')
    const req = reqWithToken('user')
    const res = fakeRes()
    let nextCalled = false
    await authzMiddleware(req, res, () => { nextCalled = true })
    assert.equal(res.statusCode, 403)
    assert.equal(nextCalled, false)
  } finally { restore() }
})

test('PUT /model deixa passar role "admin" (chama next())', async () => {
  const restore = stubFindById({ tokenVersion: 0 })
  try {
    const [authzMiddleware] = routeStack('put', '/model')
    const req = reqWithToken('admin')
    const res = fakeRes()
    let nextCalled = false
    await authzMiddleware(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, true)
    assert.equal(res.statusCode, null)
  } finally { restore() }
})

test('PUT /model tem exatamente 2 estágios (gate de admin + handler) — regressão de "esqueceram o gate"', () => {
  assert.equal(routeStack('put', '/model').length, 2)
})

test('GET /model continua aberto a qualquer autenticado (sem regressão de acesso)', () => {
  assert.equal(routeStack('get', '/model').length, 1)
})
