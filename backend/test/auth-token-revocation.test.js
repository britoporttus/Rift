// P1-11 (auditoria 2026-07-20): um admin rebaixado/excluído/com senha resetada
// mantinha o JWT válido pela janela inteira de 12h (requireAuth não reconsultava
// o banco). `tokenVersion` no User + `tv` no payload fecham isso. Testado sem
// Mongo real: stub de User.findById/findByIdAndUpdate (mesmo espírito de
// cred-vault.test.js, que evita DB). Ver docs/ROADMAP-AUDITORIA-2026-07-20.md.
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'

const { checkTokenVersion, bumpTokenVersion, signToken } = require('../src/auth')
const User = require('../src/models/User')

function stubFindById(result) {
  const original = User.findById
  User.findById = () => ({ select: () => ({ lean: async () => result }) })
  return () => { User.findById = original }
}

function stubFindByIdAndUpdate(spy) {
  const original = User.findByIdAndUpdate
  User.findByIdAndUpdate = async (...args) => { spy(...args); return null }
  return () => { User.findByIdAndUpdate = original }
}

test('checkTokenVersion aceita quando tv do payload bate com tokenVersion do usuário', async () => {
  const restore = stubFindById({ tokenVersion: 2 })
  try {
    assert.equal(await checkTokenVersion({ sub: 'x', tv: 2 }), true)
  } finally { restore() }
})

test('checkTokenVersion NEGA quando tv do payload está desatualizado (sessão revogada)', async () => {
  const restore = stubFindById({ tokenVersion: 3 })
  try {
    assert.equal(await checkTokenVersion({ sub: 'x', tv: 2 }), false)
  } finally { restore() }
})

test('checkTokenVersion NEGA quando o usuário foi excluído (findById retorna null)', async () => {
  const restore = stubFindById(null)
  try {
    assert.equal(await checkTokenVersion({ sub: 'x', tv: 0 }), false)
  } finally { restore() }
})

test('checkTokenVersion trata token pré-migração (sem `tv`) como tv=0 — não derruba sessões existentes no deploy', async () => {
  const restore = stubFindById({ tokenVersion: 0 })
  try {
    assert.equal(await checkTokenVersion({ sub: 'x' }), true)
  } finally { restore() }
})

test('signToken embute tokenVersion do usuário no campo `tv` do JWT', () => {
  const jwt = require('jsonwebtoken')
  const token = signToken({ _id: 'u1', email: 'a@b.com', role: 'admin', name: 'A', tokenVersion: 5 })
  const decoded = jwt.decode(token)
  assert.equal(decoded.tv, 5)
})

test('bumpTokenVersion incrementa tokenVersion via $inc (revoga tokens emitidos antes)', async () => {
  let called = null
  const restore = stubFindByIdAndUpdate((id, update) => { called = { id, update } })
  try {
    await bumpTokenVersion('user-123')
    assert.equal(called.id, 'user-123')
    assert.deepEqual(called.update, { $inc: { tokenVersion: 1 } })
  } finally { restore() }
})
