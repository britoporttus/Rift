const { test } = require('node:test')
const assert = require('node:assert')
const { analyzeLogin } = require('../src/session-harness')

test('corpo com "credenciais inválidas" reprova mesmo com cookie', () => {
  const r = analyzeLogin({ status: 200, setCookie: ['sid=abc'], body: 'Credenciais inválidas' }, null)
  assert.equal(r.verdict, 'failed')
  assert.equal(r.sessionEstablished, false)
})

test('cookie de sessão + página protegida sem login = ok', () => {
  const login = { status: 200, setCookie: ['session=xyz; HttpOnly', 'csrf=1'], body: '<html>bem-vindo</html>' }
  const prot = { status: 200, body: '<html>painel do usuário</html>' }
  const r = analyzeLogin(login, prot)
  assert.equal(r.verdict, 'ok')
  assert.equal(r.sessionEstablished, true)
  assert.equal(r.sustained, true)
  assert.deepEqual(r.evidence.cookies, ['session', 'csrf'])
})

test('redirect para fora do login estabelece sessão', () => {
  const login = { status: 302, setCookie: [], location: '/dashboard', body: '' }
  const r = analyzeLogin(login, null)
  assert.equal(r.sessionEstablished, true)
  assert.equal(r.verdict, 'inconclusive', 'sem etapa de sustentação → inconclusivo, não ok')
})

test('redirect de volta para /login NÃO estabelece sessão', () => {
  const login = { status: 302, setCookie: [], location: '/login?error=1', body: '' }
  const r = analyzeLogin(login, null)
  assert.equal(r.sessionEstablished, false)
  assert.equal(r.verdict, 'inconclusive')
})

test('página protegida que volta a pedir senha = sessão não sustentou', () => {
  const login = { status: 200, setCookie: ['sid=1'], body: 'ok' }
  const prot = { status: 200, body: '<form><input type="password" name="password"></form>' }
  const r = analyzeLogin(login, prot)
  assert.equal(r.sustained, false)
  assert.equal(r.verdict, 'failed')
})

test('página protegida 401 = não sustentou', () => {
  const r = analyzeLogin({ status: 200, setCookie: ['sid=1'], body: 'ok' }, { status: 401, body: '' })
  assert.equal(r.sustained, false)
  assert.equal(r.verdict, 'failed')
})

test('successContains reforça o veredito', () => {
  const login = { status: 200, setCookie: ['sid=1'], body: 'Olá, admin@corp.com — sua conta' }
  const prot = { status: 200, body: 'dashboard' }
  const r = analyzeLogin(login, prot, { successContains: 'admin@corp.com' })
  assert.equal(r.verdict, 'ok')
  assert.equal(r.evidence.successMarker, true)
})
