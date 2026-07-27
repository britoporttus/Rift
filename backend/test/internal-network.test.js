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

test('respeita o cap de hosts (não estoura memória com relatório gigante)', () => {
  const many = Array.from({ length: 6000 }, (_, i) => ({ ip: `10.0.${Math.floor(i / 256)}.${i % 256}` }))
  const { hosts } = normalizeAgentReport({ hosts: many })
  assert.ok(hosts.length <= 5000)
})
