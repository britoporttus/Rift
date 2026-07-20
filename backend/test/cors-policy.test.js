// P1-12 (auditoria 2026-07-20): CORS aceitava QUALQUER subdomínio
// *.trycloudflare.com/*.cloudflareaccess.com por padrão — domínio de túnel
// anônimo/gratuito que qualquer atacante consegue em segundos, combinado com
// `credentials:true`. Agora o wildcard só vale com opt-in explícito.
const { test } = require('node:test')
const assert = require('node:assert')
const { isAllowedOrigin } = require('../src/cors-policy')

const ORIGINS = ['http://localhost:3000', 'https://rift.example.com']

test('sem Origin (same-origin/server-to-server) sempre permite', () => {
  assert.equal(isAllowedOrigin(undefined, { origins: ORIGINS, allowCfWildcard: false }), true)
})

test('origem na allowlist explícita sempre permite', () => {
  assert.equal(isAllowedOrigin('https://rift.example.com', { origins: ORIGINS, allowCfWildcard: false }), true)
})

test('wildcard trycloudflare/cloudflareaccess NEGADO por padrão (allowCfWildcard=false)', () => {
  assert.equal(isAllowedOrigin('https://qualquer-coisa.trycloudflare.com', { origins: ORIGINS, allowCfWildcard: false }), false)
  assert.equal(isAllowedOrigin('https://x.cloudflareaccess.com', { origins: ORIGINS, allowCfWildcard: false }), false)
})

test('wildcard só permite com opt-in explícito (allowCfWildcard=true)', () => {
  assert.equal(isAllowedOrigin('https://qualquer-coisa.trycloudflare.com', { origins: ORIGINS, allowCfWildcard: true }), true)
  assert.equal(isAllowedOrigin('https://x.cloudflareaccess.com', { origins: ORIGINS, allowCfWildcard: true }), true)
})

test('origem fora da allowlist e não-cloudflare é sempre negada', () => {
  assert.equal(isAllowedOrigin('https://attacker.com', { origins: ORIGINS, allowCfWildcard: true }), false)
})

test('não cai em falso positivo com domínio parecido (ex.: trycloudflare.com.attacker.com)', () => {
  assert.equal(isAllowedOrigin('https://x.trycloudflare.com.attacker.com', { origins: ORIGINS, allowCfWildcard: true }), false)
})
