// computeHostDiff (internal/diff.js) + normalizeAgentReport (internal/ingest.js)
const { test } = require('node:test')
const assert = require('node:assert')
const { computeHostDiff } = require('../src/internal/diff')
const { normalizeAgentReport } = require('../src/internal/ingest')

// ── computeHostDiff ─────────────────────────────────────────────────────────
test('primeiro import (sem baseline): tudo novo, nada some', () => {
  const cur = [{ ip: '10.0.0.1', fingerprint: 'a' }, { ip: '10.0.0.2', fingerprint: 'b' }]
  const r = computeHostDiff({ previousHosts: [], currentHosts: cur })
  assert.equal(r.newCount, 2)
  assert.equal(r.missingCount, 0)
})

test('host novo entra em newHosts; host que sumiu entra em missingHosts', () => {
  const prev = [{ ip: '10.0.0.1', fingerprint: 'a' }, { ip: '10.0.0.2', fingerprint: 'b' }]
  const cur = [{ ip: '10.0.0.1', fingerprint: 'a' }, { ip: '10.0.0.9', fingerprint: 'c', deviceType: 'camera' }]
  const r = computeHostDiff({ previousHosts: prev, currentHosts: cur })
  assert.equal(r.newCount, 1)
  assert.equal(r.newHosts[0].ip, '10.0.0.9')
  assert.equal(r.missingCount, 1)
  assert.equal(r.missingHosts[0].ip, '10.0.0.2')
})

test('hosts sem fingerprint são ignorados', () => {
  const r = computeHostDiff({
    previousHosts: [{ ip: 'x', fingerprint: null }],
    currentHosts: [{ ip: 'y', fingerprint: undefined }],
  })
  assert.equal(r.newCount, 0)
  assert.equal(r.missingCount, 0)
})

// ── normalizeAgentReport ────────────────────────────────────────────────────
test('normaliza um relatório válido do agente', () => {
  const { agent, hosts } = normalizeAgentReport({
    agent: { hostname: 'probe-1', os: 'linux', version: '1.0' },
    hosts: [{ ip: '10.0.0.5', mac: 'AA:BB', macVendor: 'Cisco', openPorts: [{ port: 22, service: 'ssh' }] }],
  })
  assert.equal(agent.hostname, 'probe-1')
  assert.equal(hosts.length, 1)
  assert.equal(hosts[0].ip, '10.0.0.5')
  assert.equal(hosts[0].openPorts[0].port, 22)
})

test('descarta host sem IP e porta sem número', () => {
  const { hosts } = normalizeAgentReport({
    hosts: [
      { mac: 'AA:BB' },                                   // sem ip → fora
      { ip: '10.0.0.6', openPorts: [{ service: 'x' }, { port: 80 }] }, // porta sem number filtrada
    ],
  })
  assert.equal(hosts.length, 1)
  assert.equal(hosts[0].openPorts.length, 1)
  assert.equal(hosts[0].openPorts[0].port, 80)
})

test('entrada malformada não lança (degrada pra vazio)', () => {
  assert.doesNotThrow(() => normalizeAgentReport(null))
  assert.doesNotThrow(() => normalizeAgentReport({}))
  assert.doesNotThrow(() => normalizeAgentReport({ hosts: 'nope' }))
  assert.deepEqual(normalizeAgentReport({ hosts: 'nope' }).hosts, [])
})

test('filtra fantasmas: broadcast do CIDR, MAC de broadcast, multicast', () => {
  const { hosts } = normalizeAgentReport({
    scannedCidrs: ['10.22.138.0/24'],
    hosts: [
      { ip: '10.22.138.16', mac: '00:50:56:8D:E8:33' },   // host real → fica
      { ip: '10.22.138.255', mac: 'FF:FF:FF:FF:FF:FF' },  // broadcast da /24 → fora
      { ip: '10.22.138.0' },                              // endereço de rede → fora
      { ip: '224.0.0.251', mac: 'AA:BB:CC:DD:EE:FF' },    // mDNS multicast → fora
      { ip: '10.22.138.9', mac: 'FF:FF:FF:FF:FF:FF' },    // IP ok mas MAC broadcast → fora
    ],
  })
  assert.deepEqual(hosts.map((h) => h.ip), ['10.22.138.16'])
})

test('sem escopo, ainda filtra multicast/broadcast global mas mantém .255 (máscara desconhecida)', () => {
  // Sem scannedCidrs não dá pra saber que .255 é broadcast de uma /24 — então ele
  // fica (errar pra "não apagar"), mas multicast/global broadcast caem sempre.
  const { hosts } = normalizeAgentReport({
    hosts: [{ ip: '10.0.0.255' }, { ip: '255.255.255.255' }, { ip: '239.0.0.1' }],
  })
  assert.deepEqual(hosts.map((h) => h.ip), ['10.0.0.255'])
})

// ── Escopo da coleta + avisos (agente v2) ───────────────────────────────────
test('normaliza scannedCidrs e warnings', () => {
  const r = normalizeAgentReport({
    scannedCidrs: ['192.168.0.0/24', '10.0.0.0/8'],
    warnings: ['rodando em WSL'],
    agent: { privileged: true },
    hosts: [],
  })
  assert.deepEqual(r.scannedCidrs, ['192.168.0.0/24', '10.0.0.0/8'])
  assert.deepEqual(r.warnings, ['rodando em WSL'])
  assert.equal(r.agent.privileged, true)
})

test('descarta CIDR malformado (não pode virar escopo de exclusão)', () => {
  const { scannedCidrs } = normalizeAgentReport({
    scannedCidrs: ['192.168.0.0/24', 'nope', '', null, '10.0.0.1', 'DROP TABLE'],
  })
  assert.deepEqual(scannedCidrs, ['192.168.0.0/24'])
})

test('relatório do agente v1 (sem escopo) → escopo vazio, não avisos falsos', () => {
  // Invariante de compatibilidade: sem scannedCidrs o ingest não marca nada
  // como sumido. Escopo vazio é o sinal disso.
  const r = normalizeAgentReport({ agent: { hostname: 'x' }, hosts: [{ ip: '10.0.0.1' }] })
  assert.deepEqual(r.scannedCidrs, [])
  assert.deepEqual(r.warnings, [])
  assert.equal(r.agent.privileged, false)
})

test('respeita o cap de hosts (não estoura memória com relatório gigante)', () => {
  const many = Array.from({ length: 6000 }, (_, i) => ({ ip: `10.0.${Math.floor(i / 256)}.${i % 256}` }))
  const { hosts } = normalizeAgentReport({ hosts: many })
  assert.ok(hosts.length <= 5000)
})
