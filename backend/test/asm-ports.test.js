// analyzePort (asm/ports.js) — risco de porta EXTERNA exposta. Função pura.
const { test } = require('node:test')
const assert = require('node:assert')
const { analyzePort } = require('../src/asm/ports')

test('Telnet 23 → high', () => {
  const r = analyzePort({ port: 23 })
  assert.equal(r.severity, 'high')
  assert.ok(/Telnet/.test(r.label))
})

test('RDP 3389 → high', () => {
  assert.equal(analyzePort({ port: 3389 }).severity, 'high')
})

test('bancos expostos (MySQL/Postgres/Mongo/Redis) → high', () => {
  for (const p of [3306, 5432, 27017, 6379, 9200, 1433]) {
    assert.equal(analyzePort({ port: p }).severity, 'high', `porta ${p}`)
  }
})

test('SMB 445 → high; FTP 21 → medium; SNMP 161 → medium', () => {
  assert.equal(analyzePort({ port: 445 }).severity, 'high')
  assert.equal(analyzePort({ port: 21 }).severity, 'medium')
  assert.equal(analyzePort({ port: 161 }).severity, 'medium')
})

test('SSH 22 e web 80/443/8080 → info (não são achado por si só)', () => {
  assert.equal(analyzePort({ port: 22, service: 'ssh' }).severity, 'info')
  assert.equal(analyzePort({ port: 80, service: 'http' }).severity, 'info')
  assert.equal(analyzePort({ port: 8080 }).severity, 'info')
})

test('detecção por NOME de serviço em porta atípica (redis em 7777) → high', () => {
  const r = analyzePort({ port: 7777, service: 'redis' })
  assert.equal(r.severity, 'high')
  assert.ok(/redis/i.test(r.label))
})

test('porta desconhecida sem serviço → info, sem label', () => {
  const r = analyzePort({ port: 49152 })
  assert.equal(r.severity, 'info')
  assert.equal(r.label, null)
})

test('não lança com entrada vazia', () => {
  assert.doesNotThrow(() => analyzePort())
  assert.doesNotThrow(() => analyzePort({}))
})
