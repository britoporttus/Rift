// P2-34 (auditoria 2026-07-20): requireAuth() aceitava cookie HttpOnly OU
// header Authorization: Bearer — o fallback reabria a superfície que o cookie
// existe pra fechar (roubo de token via XSS/log). Nenhum client real deste
// repo usa Bearer contra o próprio backend do Rift — removido. Ver
// docs/ROADMAP-AUDITORIA-2026-07-20.md.
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'
const { requireAuth, signToken, COOKIE_NAME } = require('../src/auth')
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

test('requireAuth NEGA um token válido enviado só via Authorization: Bearer (sem cookie)', async () => {
  const restore = stubFindById({ tokenVersion: 0 })
  try {
    const token = signToken({ _id: 'u1', email: 'a@b.com', role: 'user', name: 'A', tokenVersion: 0 })
    const req = { cookies: {}, headers: { authorization: `Bearer ${token}` } }
    const res = fakeRes()
    let nextCalled = false
    await requireAuth()(req, res, () => { nextCalled = true })
    assert.equal(res.statusCode, 401)
    assert.equal(nextCalled, false)
  } finally { restore() }
})

test('requireAuth continua aceitando o cookie HttpOnly normalmente', async () => {
  const restore = stubFindById({ tokenVersion: 0 })
  try {
    const token = signToken({ _id: 'u1', email: 'a@b.com', role: 'user', name: 'A', tokenVersion: 0 })
    const req = { cookies: { [COOKIE_NAME]: token }, headers: {} }
    const res = fakeRes()
    let nextCalled = false
    await requireAuth()(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, true)
    assert.equal(res.statusCode, null)
  } finally { restore() }
})
