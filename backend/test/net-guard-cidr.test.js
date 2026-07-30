// Helpers de CIDR do net-guard — o guarda anti-SSRF ao expandir faixas de ASN
// para o port scan. Crítico: nenhum IP privado/metadata pode escapar da expansão.
const { test } = require('node:test')
const assert = require('node:assert')
const { parseCidrV4, ipInCidr, ipInAnyCidr, expandCidrsV4, isBlockedIp } = require('../src/net-guard')

test('parseCidrV4: parseia e normaliza a base pela máscara', () => {
  const c = parseCidrV4('203.0.113.5/24')
  assert.equal(c.prefix, 24)
  assert.equal(c.first, ((203 << 24) >>> 0) + (0 << 16) + (113 << 8) + 0)
  assert.equal(c.last, c.first + 255)
})

test('parseCidrV4: rejeita lixo', () => {
  assert.equal(parseCidrV4('nope'), null)
  assert.equal(parseCidrV4('203.0.113.0'), null)      // sem prefixo
  assert.equal(parseCidrV4('999.0.0.0/24'), null)     // octeto inválido
  assert.equal(parseCidrV4('203.0.113.0/33'), null)   // prefixo inválido
})

test('ipInCidr / ipInAnyCidr', () => {
  assert.ok(ipInCidr('203.0.113.42', '203.0.113.0/24'))
  assert.ok(!ipInCidr('203.0.114.1', '203.0.113.0/24'))
  assert.ok(ipInAnyCidr('10.0.0.5', ['203.0.113.0/24', '10.0.0.0/8']))
  assert.ok(!ipInAnyCidr('8.8.8.8', ['203.0.113.0/24', '10.0.0.0/8']))
})

test('expandCidrsV4: expande /30 removendo rede e broadcast', () => {
  const { ips } = expandCidrsV4(['203.0.113.0/30'], { minPrefix: 24 })
  // /30 = .0(rede) .1 .2 .3(broadcast) → sobram .1 e .2
  assert.deepEqual(ips, ['203.0.113.1', '203.0.113.2'])
})

test('expandCidrsV4: NUNCA inclui IP privado/metadata (filtro isBlockedIp)', () => {
  // Uma faixa "pública" que por engano contivesse metadata não passa —
  // aqui usamos ranges privados inteiros: devem sair vazios.
  const { ips } = expandCidrsV4(['10.0.0.0/28', '192.168.1.0/28', '169.254.169.0/28'], { minPrefix: 24 })
  assert.deepEqual(ips, [])
})

test('expandCidrsV4: pula faixas grandes demais (prefixo < minPrefix)', () => {
  const { ips } = expandCidrsV4(['203.0.0.0/8'], { minPrefix: 16, maxIps: 100 })
  assert.deepEqual(ips, []) // /8 é grande demais → ignorada
})

test('expandCidrsV4: respeita o cap total (maxIps) e sinaliza truncated', () => {
  const { ips, truncated } = expandCidrsV4(['203.0.113.0/24'], { minPrefix: 16, maxIps: 10 })
  assert.equal(ips.length, 10)
  assert.equal(truncated, true)
})

test('expandCidrsV4: /32 e /31 (sem rede/broadcast reservados)', () => {
  const a = expandCidrsV4(['203.0.113.7/32'], { minPrefix: 24 })
  assert.deepEqual(a.ips, ['203.0.113.7'])
  const b = expandCidrsV4(['203.0.113.8/31'], { minPrefix: 24 })
  assert.deepEqual(b.ips, ['203.0.113.8', '203.0.113.9'])
})

test('sanidade: isBlockedIp continua bloqueando privado e liberando público', () => {
  assert.ok(isBlockedIp('10.1.2.3'))
  assert.ok(isBlockedIp('169.254.169.254'))
  assert.ok(!isBlockedIp('203.0.113.10'))
})
