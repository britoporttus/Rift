const { test } = require('node:test')
const assert = require('node:assert')
const { deriveMonitorEvents, hottestSeverity } = require('../src/asm/monitor-events')

const NOW = new Date('2026-08-10T12:00:00Z')

test('novo subdomínio vira evento — mas NÃO no primeiro scan (sem baseline)', () => {
  const diff = { newHostCount: 3, newAssets: [{ type: 'subdomain', value: 'vpn.x.com' }] }
  // sem baseline (previousAssets vazio) → nada (senão "tudo é novo" é ruído)
  assert.equal(deriveMonitorEvents({ diff, previousAssets: [], now: NOW }).length, 0)
  // com baseline → evento
  const ev = deriveMonitorEvents({ diff, previousAssets: [{ fingerprint: 'x' }], now: NOW })
  assert.equal(ev.length, 1)
  assert.equal(ev[0].type, 'new_subdomain')
  assert.match(ev[0].title, /3 novo/)
})

test('nova exposição alta/crítica vira evento; média/info não', () => {
  const prev = [{ fingerprint: 'old' }]
  const current = [
    { type: 'exposure', fingerprint: 'e1', severity: 'critical', label: 'RCE', value: 'api.x.com' }, // novo
    { type: 'exposure', fingerprint: 'e2', severity: 'medium', value: 'x.com' },                     // novo mas médio
    { type: 'exposure', fingerprint: 'old', severity: 'high', value: 'y.com' },                       // já existia
  ]
  const ev = deriveMonitorEvents({ diff: {}, currentAssets: current, previousAssets: prev, now: NOW })
  const exp = ev.filter((e) => e.type === 'new_exposure')
  assert.equal(exp.length, 1, 'só a crítica nova')
  assert.equal(exp[0].severity, 'critical')
})

test('novo CVE vira 1 evento com a pior severidade', () => {
  const prev = []
  const current = [
    { type: 'exposure', fingerprint: 'c1', cveId: 'CVE-2024-1', severity: 'high' },
    { type: 'exposure', fingerprint: 'c2', cveId: 'CVE-2024-2', severity: 'critical' },
  ]
  const ev = deriveMonitorEvents({ diff: {}, currentAssets: current, previousAssets: prev, now: NOW }).filter((e) => e.type === 'new_cve')
  assert.equal(ev.length, 1)
  assert.equal(ev[0].severity, 'critical')
  assert.match(ev[0].detail, /CVE-2024-1/)
})

test('candidato a takeover novo vira evento', () => {
  const current = [{ type: 'exposure', fingerprint: 't1', severity: 'high', source: 'dns-takeover', value: 'gone.x.com', cname: 'ghost.github.io' }]
  const ev = deriveMonitorEvents({ diff: {}, currentAssets: current, previousAssets: [], now: NOW }).filter((e) => e.type === 'takeover_candidate')
  assert.equal(ev.length, 1)
})

test('piora de score dispara só acima do salto mínimo', () => {
  assert.equal(deriveMonitorEvents({ previousScore: 20, score: 25, now: NOW }).length, 0, '+5 é ruído')
  const ev = deriveMonitorEvents({ previousScore: 20, score: 45, now: NOW })
  assert.equal(ev.length, 1)
  assert.equal(ev[0].type, 'score_worsened')
  assert.equal(ev[0].severity, 'high', '+25 é salto grande')
})

test('todos os eventos carregam o timestamp injetado', () => {
  const ev = deriveMonitorEvents({ previousScore: 0, score: 30, now: NOW })
  assert.equal(ev[0].at, NOW)
})

test('hottestSeverity pega a pior', () => {
  assert.equal(hottestSeverity([{ severity: 'low' }, { severity: 'critical' }, { severity: 'medium' }]), 'critical')
  assert.equal(hottestSeverity([]), 'info')
})
