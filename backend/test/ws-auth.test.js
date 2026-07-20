// P1-19 (auditoria 2026-07-20): o WS aceitava JWT via `?token=` na query
// string como fallback — vetor vivo mesmo o frontend não usando mais (fica
// gravado em log de acesso de proxy/CDN). Removido: só cookie HttpOnly ou
// subprotocolo `rift-jwt`. Ver docs/ROADMAP-AUDITORIA-2026-07-20.md.
const { test } = require('node:test')
const assert = require('node:assert')
const { resolveWsToken } = require('../src/ws-auth')

const COOKIE_NAME = 'rift_token'

test('resolve o token do cookie HttpOnly (caminho normal do browser)', () => {
  const token = resolveWsToken(`${COOKIE_NAME}=abc123; outro=x`, '', COOKIE_NAME)
  assert.equal(token, 'abc123')
})

test('resolve o token do subprotocolo rift-jwt quando não há cookie', () => {
  const token = resolveWsToken('', 'rift-jwt, meu-token-aqui', COOKIE_NAME)
  assert.equal(token, 'meu-token-aqui')
})

test('cookie tem precedência sobre o subprotocolo quando ambos presentes', () => {
  const token = resolveWsToken(`${COOKIE_NAME}=do-cookie`, 'rift-jwt, do-subprotocolo', COOKIE_NAME)
  assert.equal(token, 'do-cookie')
})

test('NUNCA aceita token via query string — a função nem recebe a URL como parâmetro', () => {
  // Trava estrutural: a assinatura de resolveWsToken só aceita cookieHeader e
  // protoHeader — não há como uma query string influenciar o resultado, nem
  // por engano futuro (quem for chamar precisa passar exatamente esses 2 dados).
  assert.deepEqual(resolveWsToken.length, 3)
})

test('sem cookie e sem subprotocolo válido → null (401 no chamador)', () => {
  assert.equal(resolveWsToken('', '', COOKIE_NAME), null)
  assert.equal(resolveWsToken('', 'rift-jwt', COOKIE_NAME), null) // só o nome do subprotocolo, sem token
})

test('cookieHeader/protoHeader ausentes (undefined) não lançam erro', () => {
  assert.equal(resolveWsToken(undefined, undefined, COOKIE_NAME), null)
})
