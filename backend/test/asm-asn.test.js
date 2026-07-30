// lookupNetblocks (asm/asn.js) — RIPEstat keyless + guarda anti-cloud. fetch stubado.
const { test } = require('node:test')
const assert = require('node:assert')
const { lookupNetblocks, ownsRange, classifyProvider } = require('../src/asm/asn')

// ── classifyProvider (IP é de SaaS/e-mail de terceiro?) ───────────────────────
test('classifyProvider: SaaS/e-mail/CDN → thirdParty com nome', () => {
  assert.equal(classifyProvider('Microsoft Corporation').thirdParty, true)
  assert.equal(classifyProvider('Microsoft Corporation').name, 'Microsoft 365')
  assert.equal(classifyProvider('THEROCKETSCIENCEGROUP - MailChimp').name, 'MailChimp')
  assert.equal(classifyProvider('Cloudflare, Inc.').name, 'Cloudflare')
  assert.equal(classifyProvider('Google LLC').name, 'Google')
})

test('classifyProvider: hospedagem dedicada NÃO é terceiro (é servidor do alvo)', () => {
  assert.equal(classifyProvider('IDC19 SOLUCOES EM TECNOLOGIA DA INFORMACAO LTDA').thirdParty, false)
  assert.equal(classifyProvider('Locaweb Servicos de Internet S/A').thirdParty, false)
  assert.equal(classifyProvider('Hostinger International').thirdParty, false)
  assert.equal(classifyProvider(null).thirdParty, false)
})

// ── ownsRange (o alvo POSSUI a faixa? holder do ASN casa com o domínio) ────────
test('ownsRange: provedor/hospedagem NÃO é dono (trustsis em IDC19/MailChimp)', () => {
  assert.equal(ownsRange('IDC19 SOLUCOES EM TECNOLOGIA DA INFORMACAO LTDA', 'trustsis.com'), false)
  assert.equal(ownsRange('AS-HOSTINGER Hostinger International Limited', 'trustsis.com'), false)
  assert.equal(ownsRange('THEROCKETSCIENCEGROUP - MailChimp', 'trustsis.com'), false)
})

test('ownsRange: casa quando o holder contém o nome do domínio', () => {
  assert.equal(ownsRange('TRUSTSIS LTDA', 'trustsis.com'), true)
  assert.equal(ownsRange('Big Company Telecom', 'bigcompany.com'), true) // espaços ignorados
})

test('ownsRange: rótulos curtos/TLD não geram falso-positivo', () => {
  assert.equal(ownsRange('COM-HOSTING Provider', 'ab.com'), false) // 'ab' curto, 'com' é TLD
  assert.equal(ownsRange('', 'x.com'), false)
  assert.equal(ownsRange('Qualquer Holder', null), false)
})

function stub(map) {
  // map: fn(url) → objeto de dados; retorna resposta fetch-like.
  return async (url) => ({ ok: true, json: async () => ({ data: map(url) }) })
}

test('só expande faixa PRÓPRIA e contida; /16 de cloud e /24 de terceiro ficam de fora', async () => {
  const fetchFn = stub((url) => {
    if (url.includes('network-info') && url.includes('203.0.113.5')) return { asns: ['64500'], prefix: '203.0.113.0/24' }
    if (url.includes('network-info') && url.includes('35.1.2.3')) return { asns: ['15169'], prefix: '35.0.0.0/16' }
    if (url.includes('as-overview') && url.includes('AS64500')) return { holder: 'CLIENTEX TELECOM' }
    if (url.includes('as-overview') && url.includes('AS15169')) return { holder: 'GOOGLE LLC' }
    return {}
  })
  // domínio clientex.com → casa o holder "CLIENTEX TELECOM" (owned) da /24;
  // GOOGLE /16 não casa E é tooLarge.
  const r = await lookupNetblocks(['203.0.113.5', '35.1.2.3'], { fetchFn, targetDomain: 'clientex.com', maxPrefixIps: 1024 })
  assert.deepEqual(r.cidrs, ['203.0.113.0/24'])
  const own = r.asns.find((a) => a.holder === 'CLIENTEX TELECOM')
  assert.equal(own.owned, true)
  assert.equal(own.tooLarge, false)
  const google = r.asns.find((a) => a.holder === 'GOOGLE LLC')
  assert.equal(google.tooLarge, true)
  assert.equal(google.owned, false)
})

test('faixa contida mas de PROVEDOR (não-owned) NÃO é expandida — caso trustsis/IDC19', async () => {
  const fetchFn = stub((url) => {
    if (url.includes('network-info')) return { asns: ['53038'], prefix: '177.73.234.0/24' }
    if (url.includes('as-overview')) return { holder: 'IDC19 SOLUCOES EM TECNOLOGIA DA INFORMACAO LTDA' }
    return {}
  })
  const r = await lookupNetblocks(['177.73.234.85'], { fetchFn, targetDomain: 'trustsis.com', maxPrefixIps: 1024 })
  assert.deepEqual(r.cidrs, [])          // NÃO expande o /24 de terceiro
  assert.equal(r.asns[0].owned, false)   // registrado como contexto
  assert.equal(r.asns[0].tooLarge, false)
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
