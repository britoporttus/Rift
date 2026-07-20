// P0-2 da auditoria 2026-07-20: o `fingerprint` de LeakedCredential persistia
// o e-mail cru (via `b.account` embutido na string, herdado pelo Mongo através
// do filtro do upsert) mesmo com `account` mascarado — e a API devolvia o
// documento inteiro sem projeção, vazando PII. Ver docs/ROADMAP-AUDITORIA-2026-07-20.md.
const { test } = require('node:test')
const assert = require('node:assert')
const { maskAccount, sanitizeCredential } = require('../src/leaks/mask')
const { buildFingerprint } = require('../src/leaks/search')

test('buildFingerprint nunca contém o e-mail em texto claro (é um hash)', () => {
  const b = { provider: 'dehashed', category: 'breach', account: 'joao.silva@acme.com', breachName: 'X', seenDate: '2024-01-01' }
  const fp = buildFingerprint('acme.com', b)
  assert.equal(typeof fp, 'string')
  assert.equal(fp.length, 64) // sha256 hex
  assert.equal(/^[0-9a-f]{64}$/.test(fp), true)
  assert.equal(fp.includes('joao.silva'), false)
  assert.equal(fp.includes('acme.com'), false) // nem o domínio, que dirá o e-mail
})

test('buildFingerprint é determinístico e sensível a cada campo (dedup continua funcionando)', () => {
  const base = { provider: 'dehashed', category: 'breach', account: 'a@x.com', breachName: 'B', seenDate: '2024-01-01' }
  const fp1 = buildFingerprint('x.com', base)
  const fp2 = buildFingerprint('x.com', { ...base })
  assert.equal(fp1, fp2, 'mesmos campos → mesmo fingerprint (upsert deduplica)')

  const fp3 = buildFingerprint('x.com', { ...base, account: 'b@x.com' })
  assert.notEqual(fp1, fp3, 'conta diferente → fingerprint diferente')
})

test('sanitizeCredential remove fingerprint (e __v) antes de expor via API', () => {
  const doc = {
    _id: 'abc', domain: 'acme.com', account: 'j***a@acme.com',
    fingerprint: 'e4b2...conteria-hash-ou-pior-cru', __v: 0, category: 'breach',
  }
  const clean = sanitizeCredential(doc)
  assert.equal('fingerprint' in clean, false)
  assert.equal('__v' in clean, false)
  assert.equal(clean.account, 'j***a@acme.com')
  assert.equal(clean._id, 'abc') // demais campos preservados
})

test('maskAccount continua mascarando (guarda de regressão do comportamento existente)', () => {
  assert.equal(maskAccount('joao.silva@acme.com'), 'j********a@acme.com')
  assert.equal(maskAccount(null), null)
})
