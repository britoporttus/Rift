// P1-15 (auditoria 2026-07-20): sem rate-limit, qualquer usuário autenticado
// podia disparar buscas/scans repetidos sem cooldown (abuso de custo em
// provider pago / recursos do scanner). Ver docs/ROADMAP-AUDITORIA-2026-07-20.md.
const { test } = require('node:test')
const assert = require('node:assert')
const { cooldownRemainingMs, canForceCooldown } = require('../src/cooldown')

test('sem lastAt (nunca rodou) → sem cooldown', () => {
  assert.equal(cooldownRemainingMs(null, 60000, 1000000), 0)
  assert.equal(cooldownRemainingMs(undefined, 60000, 1000000), 0)
})

test('dentro da janela → retorna o restante em ms', () => {
  const now = 1_000_000
  const lastAt = new Date(now - 30_000) // 30s atrás
  assert.equal(cooldownRemainingMs(lastAt, 60_000, now), 30_000)
})

test('fora da janela → 0 (pode rodar de novo)', () => {
  const now = 1_000_000
  const lastAt = new Date(now - 61_000) // 61s atrás, cooldown de 60s
  assert.equal(cooldownRemainingMs(lastAt, 60_000, now), 0)
})

test('exatamente no limite → 0 (não bloqueia por 1ms de imprecisão)', () => {
  const now = 1_000_000
  const lastAt = new Date(now - 60_000)
  assert.equal(cooldownRemainingMs(lastAt, 60_000, now), 0)
})

test('cooldownMs=0 ou ausente → desliga o cooldown mesmo com lastAt recente', () => {
  const now = 1_000_000
  const lastAt = new Date(now - 10)
  assert.equal(cooldownRemainingMs(lastAt, 0, now), 0)
  assert.equal(cooldownRemainingMs(lastAt, undefined, now), 0)
})

test('aceita string ISO em lastAt (formato vindo do .lean() do Mongo)', () => {
  const now = Date.parse('2026-01-01T12:00:00.000Z')
  const lastAt = '2026-01-01T11:59:30.000Z' // 30s atrás
  assert.equal(cooldownRemainingMs(lastAt, 60_000, now), 30_000)
})

test('canForceCooldown: só admin COM force:true explícito pode pular o cooldown', () => {
  assert.equal(canForceCooldown({ force: true }, { role: 'admin' }), true)
  assert.equal(canForceCooldown({ force: true }, { role: 'user' }), false)
  assert.equal(canForceCooldown({}, { role: 'admin' }), false) // force ausente
  assert.equal(canForceCooldown({ force: 'true' }, { role: 'admin' }), false) // string, não boolean
  assert.equal(canForceCooldown(null, { role: 'admin' }), false)
  assert.equal(canForceCooldown({ force: true }, null), false)
})
