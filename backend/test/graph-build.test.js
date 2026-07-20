// Montagem do Mapa de Superfície: dedup de hubs (IP/tech/família) compartilhados,
// arestas corretas, casamento de vuln ao host, cap com truncamento logado.
const { test } = require('node:test')
const assert = require('node:assert')
const { createBuilder, addDomainBundle, normHost, hostMatchesDomain } = require('../src/graph/build')

function ids(nodes) { return new Set(nodes.map((n) => n.id)) }
function edgeOf(edges, s, t, type) { return edges.find((e) => e.source === s && e.target === t && e.type === type) }

test('normHost tira esquema/porta/path/www e minúscula', () => {
  assert.equal(normHost('https://WWW.Api.Foo.com:8443/x?y=1'), 'api.foo.com')
  assert.equal(normHost('Foo.COM.'), 'foo.com')
  assert.equal(normHost(''), null)
  assert.equal(normHost(null), null)
})

test('hostMatchesDomain casa apex e subdomínio, rejeita o resto', () => {
  assert.equal(hostMatchesDomain('foo.com', 'foo.com'), true)
  assert.equal(hostMatchesDomain('api.foo.com', 'foo.com'), true)
  assert.equal(hostMatchesDomain('notfoo.com', 'foo.com'), false)
  assert.equal(hostMatchesDomain('foo.com.evil.com', 'foo.com'), false)
})

test('subdomínios que resolvem no mesmo IP viram UM hub com count=2', () => {
  const b = createBuilder()
  addDomainBundle(b, {
    domain: { _id: 'd1', domain: 'foo.com', riskScore: 4, riskLevel: 'low', authorized: true },
    assets: [
      { _id: 'a1', type: 'subdomain', value: 'api.foo.com', ips: ['1.2.3.4'], tech: ['Apache'] },
      { _id: 'a2', type: 'web', value: 'app.foo.com', ips: ['1.2.3.4'], tech: ['apache'] },
    ],
  })
  const { nodes, edges, stats } = b.result({ log: false })
  const ip = nodes.find((n) => n.id === 'ip:1.2.3.4')
  assert.ok(ip, 'nó de IP único existe')
  assert.equal(ip.meta.count, 2, 'IP compartilhado por 2 hosts')
  // tech deduplicada por lowercase (Apache == apache)
  assert.equal(nodes.filter((n) => n.type === 'tech').length, 1)
  const tech = nodes.find((n) => n.type === 'tech')
  assert.equal(tech.meta.count, 2)
  assert.ok(edgeOf(edges, 'sub:api.foo.com', 'ip:1.2.3.4', 'resolves_to'))
  assert.ok(edgeOf(edges, 'dom:foo.com', 'sub:api.foo.com', 'has_subdomain'))
  assert.equal(stats.ips, 1)
  assert.equal(stats.subdomains, 2)
})

test('IP compartilhado entre DOIS domínios costura os clusters (hub global)', () => {
  const b = createBuilder()
  addDomainBundle(b, { domain: { _id: 'd1', domain: 'foo.com' }, assets: [{ _id: 'a1', type: 'subdomain', value: 'api.foo.com', ips: ['9.9.9.9'] }] })
  addDomainBundle(b, { domain: { _id: 'd2', domain: 'bar.com' }, assets: [{ _id: 'a2', type: 'subdomain', value: 'api.bar.com', ips: ['9.9.9.9'] }] })
  const { nodes, edges } = b.result({ log: false })
  assert.equal(nodes.filter((n) => n.id === 'ip:9.9.9.9').length, 1)
  assert.ok(edgeOf(edges, 'sub:api.foo.com', 'ip:9.9.9.9', 'resolves_to'))
  assert.ok(edgeOf(edges, 'sub:api.bar.com', 'ip:9.9.9.9', 'resolves_to'))
})

test('vuln casa o subdomínio da location; senão liga ao domínio', () => {
  const b = createBuilder()
  addDomainBundle(b, {
    domain: { _id: 'd1', domain: 'foo.com' },
    assets: [{ _id: 'a1', type: 'web', value: 'app.foo.com', ips: ['1.1.1.1'] }],
    findings: [
      { _id: 'f1', title: 'XSS', severity: 'high', location: 'https://app.foo.com/x' },
      { _id: 'f2', title: 'Info leak', severity: 'low', location: null },
    ],
  })
  const { edges } = b.result({ log: false })
  assert.ok(edgeOf(edges, 'sub:app.foo.com', 'vuln:f1', 'vulnerable_to'), 'vuln com host casa o subdomínio')
  assert.ok(edgeOf(edges, 'dom:foo.com', 'vuln:f2', 'vulnerable_to'), 'vuln sem host cai no domínio')
})

test('leaks: conta de malware liga à família; breach vira hub por nome', () => {
  const b = createBuilder()
  addDomainBundle(b, {
    domain: { _id: 'd1', domain: 'foo.com' },
    leaks: [
      { _id: 'l1', category: 'malware', account: 'a***@foo.com', stealerFamily: 'RedLine' },
      { _id: 'l2', category: 'malware', account: 'b***@foo.com', stealerFamily: 'redline' },
      { _id: 'l3', category: 'breach', breachName: 'Collection1' },
    ],
    aggFamilies: { RedLine: 5, Stealc: 2 },
  })
  const { nodes, edges, stats } = b.result({ log: false })
  // família RedLine deduplicada (record + record + agg) num só hub
  assert.equal(nodes.filter((n) => n.id === 'family:redline').length, 1)
  assert.ok(edgeOf(edges, 'acct:l1', 'family:redline', 'via'))
  assert.ok(edgeOf(edges, 'dom:foo.com', 'family:redline', 'via'), 'agg liga domínio→família')
  assert.ok(edgeOf(edges, 'dom:foo.com', 'breach:collection1', 'appears_in'))
  assert.equal(stats.leaks, 3) // 2 contas + 1 breach
  assert.equal(stats.families, 2) // redline + stealc
})

test('NENHUM segredo no payload: leaked_account só carrega o account mascarado do model', () => {
  const b = createBuilder()
  addDomainBundle(b, {
    domain: { _id: 'd1', domain: 'foo.com' },
    leaks: [{ _id: 'l1', category: 'malware', account: 'a***@foo.com', stealerFamily: 'RedLine', hasPassword: true }],
  })
  const { nodes } = b.result({ log: false })
  const acct = nodes.find((n) => n.type === 'leaked_account')
  assert.equal(acct.label, 'a***@foo.com')
  assert.equal(acct.meta.hasPassword, true)
  assert.ok(!('password' in acct.meta) && !('secret' in acct.meta))
})

test('cap de nós trunca e reporta (não silencioso)', () => {
  const b = createBuilder({ nodeCap: 3 })
  addDomainBundle(b, {
    domain: { _id: 'd1', domain: 'foo.com' },
    assets: [
      { _id: 'a1', type: 'subdomain', value: 's1.foo.com', ips: ['1.1.1.1'] },
      { _id: 'a2', type: 'subdomain', value: 's2.foo.com', ips: ['2.2.2.2'] },
    ],
  })
  const { nodes, stats } = b.result({ log: false })
  assert.equal(nodes.length, 3, 'parou no cap')
  assert.ok(stats.truncated > 0, 'truncamento contabilizado')
})
