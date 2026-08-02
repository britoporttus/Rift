// asm-scheduler.js — monitoramento SEMPRE-ATIVO por intervalo (sem toggle).
// Mesmo estilo de mock de scheduler-defer.test.js: stubs no model/scanner.
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'

const asmScheduler = require('../src/asm-scheduler')
const Domain = require('../src/models/Domain')

// Frente 0: o tick virou fan-out por tenant; a lógica de seleção mora em
// tickFor(db). O db falso aponta para o model que o teste monkeypatcha.
const db = { Domain }
const scanner = require('../src/asm/scanner')

const DAY = 24 * 60 * 60 * 1000

test('isDomainDue: domínio nunca escaneado está vencido', () => {
  const now = new Date()
  assert.equal(asmScheduler.isDomainDue({ lastScanAt: null }, now, 7 * DAY), true)
  assert.equal(asmScheduler.isDomainDue({}, now, 7 * DAY), true)
})

test('isDomainDue: escaneado há menos que o intervalo NÃO está vencido', () => {
  const now = new Date()
  const recent = new Date(now.getTime() - 2 * DAY)
  assert.equal(asmScheduler.isDomainDue({ lastScanAt: recent }, now, 7 * DAY), false)
})

test('isDomainDue: escaneado há mais que o intervalo está vencido', () => {
  const now = new Date()
  const old = new Date(now.getTime() - 10 * DAY)
  assert.equal(asmScheduler.isDomainDue({ lastScanAt: old }, now, 7 * DAY), true)
})

test('tick: dispara scan (trigger monitor) em domínio vencido e ocioso', async () => {
  const originalFind = Domain.find
  const originalRunScan = scanner.runScan
  const calls = []

  const old = new Date(Date.now() - 30 * DAY)
  Domain.find = () => ({ select: () => ({ lean: async () => [{ _id: 'd1', domain: 'x.com', scanState: 'done', lastScanAt: old }] }) })
  scanner.runScan = async (_db, id, opts) => { calls.push({ id, opts }) }

  try {
    await asmScheduler.tickFor(db)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].id, 'd1')
    assert.equal(calls[0].opts.trigger, 'monitor')
  } finally {
    Domain.find = originalFind
    scanner.runScan = originalRunScan
  }
})

test('tick: NÃO dispara em domínio que está escaneando (não empilha)', async () => {
  const originalFind = Domain.find
  const originalRunScan = scanner.runScan
  let runCalled = false

  const old = new Date(Date.now() - 30 * DAY)
  Domain.find = () => ({ select: () => ({ lean: async () => [{ _id: 'd1', domain: 'x.com', scanState: 'scanning', lastScanAt: old }] }) })
  scanner.runScan = async () => { runCalled = true }

  try {
    await asmScheduler.tickFor(db)
    assert.equal(runCalled, false)
  } finally {
    Domain.find = originalFind
    scanner.runScan = originalRunScan
  }
})

test('tick: respeita o cap de MAX_PER_TICK (não dispara todos de uma vez)', async () => {
  const originalFind = Domain.find
  const originalRunScan = scanner.runScan
  let disparados = 0

  const old = new Date(Date.now() - 30 * DAY)
  const many = Array.from({ length: 10 }, (_, i) => ({ _id: `d${i}`, domain: `x${i}.com`, scanState: 'done', lastScanAt: old }))
  Domain.find = () => ({ select: () => ({ lean: async () => many }) })
  scanner.runScan = async () => { disparados++ }

  try {
    await asmScheduler.tickFor(db)
    assert.equal(disparados, 3, 'default ASM_RESCAN_MAX_PER_TICK = 3')
  } finally {
    Domain.find = originalFind
    scanner.runScan = originalRunScan
  }
})

// ── extractCveId (scanner.js) ──────────────────────────────────────────────
test('extractCveId: pega cve-id da classificação (string)', () => {
  assert.equal(scanner.extractCveId({ classification: { 'cve-id': 'CVE-2021-44228' } }, 'log4j'), 'CVE-2021-44228')
})

test('extractCveId: pega cve-id quando vem como array', () => {
  assert.equal(scanner.extractCveId({ classification: { 'cve-id': ['cve-2023-1234'] } }, 'x'), 'CVE-2023-1234')
})

test('extractCveId: fallback pro template-id quando ele já é uma CVE', () => {
  assert.equal(scanner.extractCveId({}, 'CVE-2020-5902'), 'CVE-2020-5902')
})

test('extractCveId: null quando não há CVE nenhuma', () => {
  assert.equal(scanner.extractCveId({ classification: {} }, 'exposed-panel'), null)
  assert.equal(scanner.extractCveId({}, null), null)
})
