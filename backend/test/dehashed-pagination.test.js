// P1-16 (auditoria 2026-07-20): antes só a página 1 era buscada (25 resultados
// no máximo) — `aggregate.found` mostrava o total real, mas a lista de contas
// ficava truncada sem NENHUM sinal pra UI. Ver docs/ROADMAP-AUDITORIA-2026-07-20.md.
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'
const { mergeAgg } = require('../src/leaks/search')

test('mergeAgg preserva truncated/totalAvailable (não descarta o sinal de paginação)', () => {
  const prev = { found: 5, totalAvailable: 5, truncated: false }
  const incoming = { found: 8, totalAvailable: 500, truncated: true }
  const merged = mergeAgg(prev, incoming)
  assert.equal(merged.truncated, true)
  assert.equal(merged.totalAvailable, 500)
})

function fakeResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function withFetch(impl, fn) {
  const original = global.fetch
  global.fetch = impl
  return fn().finally(() => { global.fetch = original })
}

test('busca uma única página quando o total cabe no PAGE_SIZE (sem truncar)', async () => {
  process.env.DEHASHED_PAGE_SIZE = '25'
  process.env.DEHASHED_MAX_PAGES = '4'
  delete require.cache[require.resolve('../src/asm/leak-providers/dehashed')]
  const dehashed = require('../src/asm/leak-providers/dehashed')

  let calls = 0
  await withFetch(async () => {
    calls++
    return fakeResponse({ entries: Array.from({ length: 10 }, (_, i) => ({ email: `u${i}@x.com` })), total: 10, balance: 99 })
  }, async () => {
    const r = await dehashed.search('x.com', { apiKey: 'k' })
    assert.equal(calls, 1, 'não deveria pedir página 2 se a página 1 já veio incompleta (< PAGE_SIZE)')
    assert.equal(r.breaches.length, 10)
    assert.equal(r.aggregate.truncated, false)
    assert.equal(r.aggregate.totalAvailable, 10)
  })
})

test('pagina até esgotar (página cheia seguida de página parcial) e agrega tudo', async () => {
  process.env.DEHASHED_PAGE_SIZE = '2'
  process.env.DEHASHED_MAX_PAGES = '4'
  delete require.cache[require.resolve('../src/asm/leak-providers/dehashed')]
  const dehashed = require('../src/asm/leak-providers/dehashed')

  const pages = [
    { entries: [{ email: 'a@x.com' }, { email: 'b@x.com' }], total: 3, balance: 90 }, // cheia (2) → busca página 2
    { entries: [{ email: 'c@x.com' }], total: 3, balance: 89 }, // parcial (1 < 2) → para
  ]
  let calls = 0
  await withFetch(async () => {
    const body = pages[calls]; calls++
    return fakeResponse(body)
  }, async () => {
    const r = await dehashed.search('x.com', { apiKey: 'k' })
    assert.equal(calls, 2)
    assert.equal(r.breaches.length, 3)
    assert.equal(r.aggregate.truncated, false)
    assert.equal(r.aggregate.totalAvailable, 3)
  })
})

test('respeita o teto de custo MAX_PAGES e sinaliza truncated=true', async () => {
  process.env.DEHASHED_PAGE_SIZE = '2'
  process.env.DEHASHED_MAX_PAGES = '2'
  delete require.cache[require.resolve('../src/asm/leak-providers/dehashed')]
  const dehashed = require('../src/asm/leak-providers/dehashed')

  let calls = 0
  await withFetch(async () => {
    calls++
    // Sempre devolve página CHEIA (2 entries) — domínio com muito mais que o teto.
    return fakeResponse({ entries: [{ email: `u${calls}a@x.com` }, { email: `u${calls}b@x.com` }], total: 500, balance: 1 })
  }, async () => {
    const r = await dehashed.search('x.com', { apiKey: 'k' })
    assert.equal(calls, 2, 'não deveria passar de MAX_PAGES=2, mesmo com mais dado disponível')
    assert.equal(r.breaches.length, 4)
    assert.equal(r.aggregate.truncated, true, 'total (500) > coletado (4) deveria sinalizar truncamento')
    assert.equal(r.aggregate.totalAvailable, 500)
  })
})

test('sem apiKey → not available, sem chamar fetch', async () => {
  delete require.cache[require.resolve('../src/asm/leak-providers/dehashed')]
  const dehashed = require('../src/asm/leak-providers/dehashed')
  let called = false
  await withFetch(async () => { called = true; return fakeResponse({}) }, async () => {
    const r = await dehashed.search('x.com', {})
    assert.equal(r.available, false)
    assert.equal(r.reason, 'no_api_key')
    assert.equal(called, false)
  })
})

test('erro de rede na primeira página → not available; erro em página seguinte → mantém o que já tinha', async () => {
  process.env.DEHASHED_PAGE_SIZE = '2'
  process.env.DEHASHED_MAX_PAGES = '4'
  delete require.cache[require.resolve('../src/asm/leak-providers/dehashed')]
  const dehashed = require('../src/asm/leak-providers/dehashed')

  await withFetch(async () => { throw new Error('boom') }, async () => {
    const r = await dehashed.search('x.com', { apiKey: 'k' })
    assert.equal(r.available, false)
    assert.equal(r.reason, 'network_error: boom')
  })

  let calls = 0
  await withFetch(async () => {
    calls++
    if (calls === 1) return fakeResponse({ entries: [{ email: 'a@x.com' }, { email: 'b@x.com' }], total: 10, balance: 5 })
    throw new Error('rede caiu na página 2')
  }, async () => {
    const r = await dehashed.search('x.com', { apiKey: 'k' })
    assert.equal(r.available, true, 'já tinha página 1 válida — não descarta tudo por falha na 2ª')
    assert.equal(r.breaches.length, 2)
  })
})
