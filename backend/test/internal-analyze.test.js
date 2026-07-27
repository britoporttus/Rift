// analyzeHost + computeNetworkScore (internal/analyze.js) — regras puras.
const { test } = require('node:test')
const assert = require('node:assert')
const { analyzeHost, computeNetworkScore, levelFromScore } = require('../src/internal/analyze')

const P = (...ports) => ports.map((p) => ({ port: p }))

test('Telnet (23) → high + rótulo', () => {
  const r = analyzeHost({ openPorts: P(23) })
  assert.equal(r.severity, 'high')
  assert.ok(r.labels.some((l) => /Telnet/.test(l)))
})

test('FTP (21) → medium', () => {
  assert.equal(analyzeHost({ openPorts: P(21) }).severity, 'medium')
})

test('SMBv1 (protocolo) → high', () => {
  const r = analyzeHost({ openPorts: P(445), protocols: ['SMBv1'] })
  assert.equal(r.severity, 'high')
})

test('RDP (3389) → medium', () => {
  assert.equal(analyzeHost({ openPorts: P(3389) }).severity, 'medium')
})

test('pior severidade vence quando há vários achados', () => {
  const r = analyzeHost({ openPorts: P(21, 23) }) // ftp(medium) + telnet(high)
  assert.equal(r.severity, 'high')
})

test('dispositivo não identificado gera rótulo próprio', () => {
  const r = analyzeHost({ deviceType: 'unknown', openPorts: [] })
  assert.ok(r.labels.some((l) => /não identificado/i.test(l)))
})

test('host limpo → info, sem rótulos', () => {
  const r = analyzeHost({ deviceType: 'server', openPorts: P(443) })
  assert.equal(r.severity, 'info')
  assert.deepEqual(r.labels, [])
})

test('computeNetworkScore: sem hosts → 0/info/[]', () => {
  const r = computeNetworkScore({ hosts: [] })
  assert.equal(r.score, 0)
  assert.equal(r.level, 'info')
  assert.deepEqual(r.reasons, [])
})

test('computeNetworkScore: mais achados de alta severidade → score maior (monotonicidade)', () => {
  const baixo = computeNetworkScore({ hosts: [{ severity: 'low', deviceType: 'server' }] })
  const alto = computeNetworkScore({ hosts: [
    { severity: 'high', deviceType: 'server' },
    { severity: 'high', deviceType: 'server' },
  ] })
  assert.ok(alto.score > baixo.score)
})

test('computeNetworkScore: nunca passa de 100 + reasons ≤ 8', () => {
  const hosts = Array.from({ length: 40 }, () => ({ severity: 'critical', deviceType: 'unknown' }))
  const r = computeNetworkScore({ hosts })
  assert.equal(r.score, 100)
  assert.ok(r.reasons.length <= 8)
})

test('levelFromScore: limites exatos', () => {
  assert.equal(levelFromScore(0), 'info')
  assert.equal(levelFromScore(24), 'low')
  assert.equal(levelFromScore(25), 'medium')
  assert.equal(levelFromScore(50), 'high')
  assert.equal(levelFromScore(75), 'critical')
})
