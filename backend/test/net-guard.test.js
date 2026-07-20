// Guarda anti-SSRF: literal de IP não deve passar como "domínio", e IP
// privado/loopback/metadata não deve ser alvo de probe ativo (P0-1 da
// auditoria 2026-07-20 — docs/ROADMAP-AUDITORIA-2026-07-20.md).
const { test } = require('node:test')
const assert = require('node:assert')

// `api/domains.js` importa `../auth`, que faz fail-fast (process.exit) se
// JWT_SECRET ausente/fraco — não roda dotenv fora do `server.js`. Mesmo
// padrão de stub de env que `hardening.test.js` usa para `agent-runner`.
process.env.JWT_SECRET = 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'

const { isIpLiteral, isBlockedIp } = require('../src/net-guard')
const { normalizeDomain: normalizeDomainDomains } = require('../src/api/domains')
const { normalizeDomain: normalizeDomainLeaks } = require('../src/leaks/search')
const { isProbeSafe } = require('../src/asm/scanner')

test('isIpLiteral reconhece IPv4 e IPv6, rejeita hostname', () => {
  assert.equal(isIpLiteral('127.0.0.1'), true)
  assert.equal(isIpLiteral('169.254.169.254'), true)
  assert.equal(isIpLiteral('::1'), true)
  assert.equal(isIpLiteral('foo.com'), false)
  assert.equal(isIpLiteral('api.foo.com'), false)
})

test('isBlockedIp bloqueia loopback/RFC1918/link-local/metadata, libera IP público', () => {
  assert.equal(isBlockedIp('127.0.0.1'), true)
  assert.equal(isBlockedIp('10.0.0.5'), true)
  assert.equal(isBlockedIp('172.16.0.1'), true)
  assert.equal(isBlockedIp('172.31.255.255'), true)
  assert.equal(isBlockedIp('172.32.0.1'), false) // fora da faixa RFC1918
  assert.equal(isBlockedIp('192.168.1.1'), true)
  assert.equal(isBlockedIp('169.254.169.254'), true) // metadata AWS/GCP/Azure
  assert.equal(isBlockedIp('::1'), true)
  assert.equal(isBlockedIp('fe80::1'), true)
  assert.equal(isBlockedIp('fd00::1'), true)
  assert.equal(isBlockedIp('8.8.8.8'), false)
  assert.equal(isBlockedIp('1.2.3.4'), false)
})

test('isBlockedIp bloqueia IP malformado (falha para o lado seguro)', () => {
  assert.equal(isBlockedIp('not-an-ip'), true)
  assert.equal(isBlockedIp(''), true)
})

test('normalizeDomain (api/domains.js) rejeita literal de IP mesmo com porta/esquema', () => {
  assert.equal(normalizeDomainDomains('169.254.169.254'), null)
  assert.equal(normalizeDomainDomains('http://127.0.0.1'), null)
  assert.equal(normalizeDomainDomains('10.0.0.5:8080'), null)
  assert.equal(normalizeDomainDomains('fornecedor.com'), 'fornecedor.com')
  assert.equal(normalizeDomainDomains('https://www.Fornecedor.com/'), 'fornecedor.com')
})

test('normalizeDomain (leaks/search.js) rejeita literal de IP', () => {
  assert.equal(normalizeDomainLeaks('169.254.169.254'), null)
  assert.equal(normalizeDomainLeaks('127.0.0.1'), null)
  assert.equal(normalizeDomainLeaks('fornecedor.com'), 'fornecedor.com')
})

test('isProbeSafe (scanner) nega se qualquer IP resolvido for privado/loopback/metadata', () => {
  assert.equal(isProbeSafe(['8.8.8.8']), true)
  assert.equal(isProbeSafe(['8.8.8.8', '10.0.0.1']), false) // um IP ruim já bloqueia
  assert.equal(isProbeSafe(['169.254.169.254']), false)
  assert.equal(isProbeSafe([]), true) // sem IP resolvido não é o problema deste guard
})
