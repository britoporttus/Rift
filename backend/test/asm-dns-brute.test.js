// dns-brute.js — bruteforce DNS nativo com resolver injetado (sem DNS real).
const { test } = require('node:test')
const assert = require('node:assert')
const { loadWordlist, detectWildcard, bruteforceSubdomains, isDnsInfraHost } = require('../src/asm/dns-brute')

// Resolver falso: mapa host → IPs. Lança (rejeita) p/ hosts ausentes, como o dns real.
function fakeResolver(map) {
  return { resolve4: async (host) => { if (map[host]) return map[host]; const e = new Error('ENOTFOUND'); e.code = 'ENOTFOUND'; throw e } }
}

test('loadWordlist: carrega a wordlist embarcada, sem comentários/vazios/duplicatas', () => {
  const w = loadWordlist()
  assert.ok(w.length > 100, 'wordlist não-trivial')
  assert.ok(w.includes('www') && w.includes('vpn') && w.includes('gitlab'))
  assert.ok(!w.some((x) => x.startsWith('#') || x === ''))
  assert.equal(new Set(w).size, w.length, 'sem duplicatas')
})

test('detectWildcard: sem curinga → Set vazio', async () => {
  const r = await detectWildcard('alvo.com', { resolver: fakeResolver({}) })
  assert.equal(r.size, 0)
})

test('detectWildcard: com curinga → captura os IPs do curinga', async () => {
  // Qualquer host resolve para 9.9.9.9 (curinga).
  const resolver = { resolve4: async () => ['9.9.9.9'] }
  const r = await detectWildcard('alvo.com', { resolver })
  assert.ok(r.has('9.9.9.9'))
})

test('bruteforce: encontra só os hosts que resolvem', async () => {
  const map = { 'www.alvo.com': ['1.1.1.1'], 'vpn.alvo.com': ['2.2.2.2'] }
  const { hosts, wildcard } = await bruteforceSubdomains('alvo.com', {
    words: ['www', 'vpn', 'inexistente'], resolver: fakeResolver(map),
  })
  assert.equal(wildcard, false)
  assert.deepEqual(hosts.sort(), ['vpn.alvo.com', 'www.alvo.com'])
})

test('bruteforce: com wildcard, descarta hosts que só batem no IP do curinga', async () => {
  const wildIp = '9.9.9.9'
  const map = {
    'www.alvo.com': [wildIp],          // só curinga → descartar
    'gitlab.alvo.com': ['3.3.3.3'],    // IP real distinto → manter
    'vpn.alvo.com': [wildIp, '4.4.4.4'], // tem IP fora do curinga → manter
  }
  const { hosts, wildcard } = await bruteforceSubdomains('alvo.com', {
    words: ['www', 'gitlab', 'vpn'],
    resolver: { resolve4: async (h) => map[h] || [wildIp] },  // curinga: tudo resolve p/ 9.9.9.9
  })
  assert.equal(wildcard, true)
  assert.deepEqual(hosts.sort(), ['gitlab.alvo.com', 'vpn.alvo.com'])
})

test('bruteforce: domínio vazio → nada', async () => {
  const r = await bruteforceSubdomains('', { words: ['www'], resolver: fakeResolver({}) })
  assert.deepEqual(r.hosts, [])
})

test('isDnsInfraHost: pega nameservers/DNS pelo rótulo (ns1/dns/resolver)', () => {
  for (const h of ['ns1.grcbuilder.com', 'ns.alvo.com', 'ns2.alvo.com', 'dns.alvo.com', 'dns1.alvo.com', 'resolver.alvo.com'])
    assert.ok(isDnsInfraHost(h), `${h} deveria ser infra de DNS`)
})

test('isDnsInfraHost: NÃO pega hosts comuns nem falsos-positivos (nsw/dnsadmin)', () => {
  for (const h of ['www.alvo.com', 'api.alvo.com', 'nsw.alvo.com', 'dnsadmin.alvo.com', 'grcbuilder.com'])
    assert.ok(!isDnsInfraHost(h), `${h} NÃO deveria ser infra de DNS`)
})

test('wordlist: não contém rótulos de nameserver (ns*/dns*/resolver)', () => {
  const w = new Set(loadWordlist())
  for (const bad of ['ns', 'ns1', 'ns2', 'dns', 'dns1', 'resolver']) assert.ok(!w.has(bad), `wordlist não deve ter ${bad}`)
})
