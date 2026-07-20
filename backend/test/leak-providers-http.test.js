// P2-36 (auditoria 2026-07-20): hibp/leakcheck-pro/leakcheck-public repetiam o
// mesmo bloco de tratamento de erro HTTP (rede/401/403/429/!ok) — extraído
// pra asm/leak-providers/http.js. Testa o helper compartilhado + os 3
// providers refatorados (dehashed já tinha teste próprio, ver
// dehashed-pagination.test.js, e não foi tocado aqui). Ver
// docs/ROADMAP-AUDITORIA-2026-07-20.md.
const { test } = require('node:test')
const assert = require('node:assert')

function fakeResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}
function withFetch(impl, fn) {
  const original = global.fetch
  global.fetch = impl
  return fn().finally(() => { global.fetch = original })
}

// ── http.js (helper compartilhado) ────────────────────────────────────────────
const { fetchSafe, networkErrorResult, commonErrorResult } = require('../src/asm/leak-providers/http')

test('fetchSafe: sucesso devolve {res}, sem networkError', async () => {
  await withFetch(async () => fakeResponse({ ok: true }), async () => {
    const { res, networkError } = await fetchSafe('https://x', {})
    assert.equal(networkError, undefined)
    assert.equal(res.status, 200)
  })
})

test('fetchSafe: exceção do fetch vira {networkError}, nunca lança', async () => {
  await withFetch(async () => { throw new Error('boom') }, async () => {
    const { res, networkError } = await fetchSafe('https://x', {})
    assert.equal(res, undefined)
    assert.equal(networkError.message, 'boom')
  })
})

test('networkErrorResult: shape padrão', () => {
  assert.deepEqual(networkErrorResult(new Error('falhou')), { available: false, reason: 'network_error: falhou', breaches: [] })
})

test('commonErrorResult: 401/403 → unauthorizedReason (default "unauthorized")', () => {
  assert.deepEqual(commonErrorResult(fakeResponse({}, 401)), { available: false, reason: 'unauthorized', breaches: [] })
  assert.deepEqual(commonErrorResult(fakeResponse({}, 403), { unauthorizedReason: 'custom' }), { available: false, reason: 'custom', breaches: [] })
})

test('commonErrorResult: 429 → rate_limited só quando checkRateLimit=true (default)', () => {
  assert.deepEqual(commonErrorResult(fakeResponse({}, 429)), { available: false, reason: 'rate_limited', breaches: [] })
  // Desligar o check ESPECÍFICO de rate-limit não bypassa o fallback genérico
  // !res.ok (429 continua não-2xx) — só troca o rótulo de 'rate_limited' pra
  // 'http_429'. É exatamente o comportamento original do leakcheck-public
  // (nunca teve tratamento especial de 429, só o genérico).
  assert.deepEqual(commonErrorResult(fakeResponse({}, 429), { checkRateLimit: false }), { available: false, reason: 'http_429', breaches: [] })
})

test('commonErrorResult: checkAuth=false não dá o rótulo "unauthorized", mas 401 continua não-ok (fallback http_401)', () => {
  assert.deepEqual(commonErrorResult(fakeResponse({}, 401), { checkAuth: false }), { available: false, reason: 'http_401', breaches: [] })
})

test('commonErrorResult: !res.ok genérico → http_<status>', () => {
  assert.deepEqual(commonErrorResult(fakeResponse({}, 500)), { available: false, reason: 'http_500', breaches: [] })
})

test('commonErrorResult: res.ok → null (segue pro parse normal)', () => {
  assert.equal(commonErrorResult(fakeResponse({}, 200)), null)
})

// ── hibp.js ────────────────────────────────────────────────────────────────────
const hibp = require('../src/asm/leak-providers/hibp')

test('hibp: sem apiKey → not available, sem chamar fetch', async () => {
  let called = false
  await withFetch(async () => { called = true; return fakeResponse({}) }, async () => {
    const r = await hibp.search('x.com', {})
    assert.equal(r.available, false)
    assert.equal(r.reason, 'no_api_key')
    assert.equal(called, false)
  })
})

test('hibp: 404 é "sem vazamentos" (available:true, breaches:[]) — não é erro', async () => {
  await withFetch(async () => fakeResponse({}, 404), async () => {
    const r = await hibp.search('x.com', { apiKey: 'k' })
    assert.deepEqual(r, { available: true, breaches: [] })
  })
})

test('hibp: 401/403 → unauthorized_or_unverified_domain', async () => {
  await withFetch(async () => fakeResponse({}, 401), async () => {
    const r = await hibp.search('x.com', { apiKey: 'k' })
    assert.equal(r.available, false)
    assert.equal(r.reason, 'unauthorized_or_unverified_domain')
  })
})

test('hibp: erro de rede', async () => {
  await withFetch(async () => { throw new Error('dns falhou') }, async () => {
    const r = await hibp.search('x.com', { apiKey: 'k' })
    assert.equal(r.reason, 'network_error: dns falhou')
  })
})

// ── leakcheck-pro.js ───────────────────────────────────────────────────────────
const leakcheckPro = require('../src/asm/leak-providers/leakcheck-pro')

test('leakcheck-pro: 401 → unauthorized', async () => {
  await withFetch(async () => fakeResponse({}, 401), async () => {
    const r = await leakcheckPro.search('x.com', { apiKey: 'k' })
    assert.deepEqual(r, { available: false, reason: 'unauthorized', breaches: [] })
  })
})

test('leakcheck-pro: 429 → rate_limited', async () => {
  await withFetch(async () => fakeResponse({}, 429), async () => {
    const r = await leakcheckPro.search('x.com', { apiKey: 'k' })
    assert.deepEqual(r, { available: false, reason: 'rate_limited', breaches: [] })
  })
})

test('leakcheck-pro: sucesso parseia resultados normalmente (regressão do parser)', async () => {
  await withFetch(async () => fakeResponse({
    success: true, found: 1,
    result: [{ email: 'a@x.com', source: { name: 'BreachX', breach_date: '2024-01-01' }, fields: ['email', 'password'], password: true }],
  }), async () => {
    const r = await leakcheckPro.search('x.com', { apiKey: 'k' })
    assert.equal(r.available, true)
    assert.equal(r.breaches.length, 1)
    assert.equal(r.breaches[0].account, 'a@x.com')
    assert.equal(r.breaches[0].hasPassword, true)
  })
})

// ── leakcheck-public.js ──────────────────────────────────────────────────────
const leakcheckPublic = require('../src/asm/leak-providers/leakcheck-public')

test('leakcheck-public: 401 NÃO é tratado como unauthorized (keyless — cai no http_401 genérico)', async () => {
  await withFetch(async () => fakeResponse({}, 401), async () => {
    const r = await leakcheckPublic.search('x.com')
    assert.deepEqual(r, { available: false, reason: 'http_401', breaches: [] })
  })
})

test('leakcheck-public: success:false → available:true com breaches vazio (resposta real, sem resultado)', async () => {
  await withFetch(async () => fakeResponse({ success: false }), async () => {
    const r = await leakcheckPublic.search('x.com')
    assert.deepEqual(r, { available: true, breaches: [] })
  })
})

test('leakcheck-public: sucesso agrega found/sources/stealer corretamente (regressão do parser)', async () => {
  await withFetch(async () => fakeResponse({
    success: true, found: 3, fields: ['email', 'password'],
    sources: [{ name: 'Stealer Logs' }, { name: 'BreachY', date: '2023-01-01' }],
  }), async () => {
    const r = await leakcheckPublic.search('x.com')
    assert.equal(r.available, true)
    assert.equal(r.aggregate.found, 3)
    assert.equal(r.aggregate.stealer, true)
    assert.equal(r.breaches.length, 1) // só a fonte NOMEADA (BreachY), Stealer Logs genérico fica só no agregado
    assert.equal(r.breaches[0].breachName, 'BreachY')
  })
})
