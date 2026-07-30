// lookupNetblocks (asm/asn.js) — RIPEstat keyless + guarda anti-cloud. fetch stubado.
const { test } = require('node:test')
const assert = require('node:assert')
const { lookupNetblocks } = require('../src/asm/asn')

function stub(map) {
  // map: fn(url) → objeto de dados; retorna resposta fetch-like.
  return async (url) => ({ ok: true, json: async () => ({ data: map(url) }) })
}

test('prefixo contido (/24) entra em cidrs; /16 de cloud é tooLarge e fica de fora', async () => {
  const fetchFn = stub((url) => {
    if (url.includes('network-info') && url.includes('203.0.113.5')) return { asns: ['64500'], prefix: '203.0.113.0/24' }
    if (url.includes('network-info') && url.includes('35.1.2.3')) return { asns: ['15169'], prefix: '35.0.0.0/16' }
    if (url.includes('as-overview') && url.includes('AS64500')) return { holder: 'CLIENTE-LTDA' }
    if (url.includes('as-overview') && url.includes('AS15169')) return { holder: 'GOOGLE LLC' }
    return {}
  })
  const r = await lookupNetblocks(['203.0.113.5', '35.1.2.3'], { fetchFn, maxPrefixIps: 1024 })
  assert.deepEqual(r.cidrs, ['203.0.113.0/24'])
  const google = r.asns.find((a) => a.holder === 'GOOGLE LLC')
  assert.equal(google.tooLarge, true)
  const cliente = r.asns.find((a) => a.holder === 'CLIENTE-LTDA')
  assert.equal(cliente.tooLarge, false)
})

test('IPv6 no prefixo é ignorado (só fazemos v4)', async () => {
  const fetchFn = stub((url) => {
    if (url.includes('network-info')) return { asns: ['64500'], prefix: '2001:db8::/32' }
    return { holder: 'X' }
  })
  const r = await lookupNetblocks(['2001:db8::1'], { fetchFn })
  assert.deepEqual(r.cidrs, [])
})

test('erro de rede (fetch rejeita) não lança — degrada pra vazio', async () => {
  const fetchFn = async () => { throw new Error('network down') }
  const r = await lookupNetblocks(['203.0.113.5'], { fetchFn })
  assert.deepEqual(r.cidrs, [])
  assert.deepEqual(r.asns, [])
})

test('resposta sem asn/prefix é pulada', async () => {
  const fetchFn = stub(() => ({}))
  const r = await lookupNetblocks(['203.0.113.5'], { fetchFn })
  assert.deepEqual(r.cidrs, [])
})

test('respeita maxIps (número de IPs consultados)', async () => {
  let calls = 0
  const fetchFn = async (url) => {
    if (url.includes('network-info')) calls++
    return { ok: true, json: async () => ({ data: { asns: ['64500'], prefix: '203.0.113.0/24' } }) }
  }
  await lookupNetblocks(['1.1.1.1', '2.2.2.2', '3.3.3.3', '4.4.4.4', '5.5.5.5', '6.6.6.6'], { fetchFn, maxIps: 2 })
  assert.equal(calls, 2)
})
