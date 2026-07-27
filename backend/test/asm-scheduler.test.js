// asm-scheduler.js — mirror simplificado de scheduler.js (sem fila de Jobs).
// Mesmo estilo de mock de scheduler-defer.test.js: substitui os métodos do
// model/scanner por stubs em vez de bater no Mongo real.
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'

const asmScheduler = require('../src/asm-scheduler')
const Domain = require('../src/models/Domain')
const scanner = require('../src/asm/scanner')

test('nextRunFrom: soma o intervalo certo por frequência (e cai pra weekly se desconhecida)', () => {
  const base = new Date('2026-01-01T00:00:00Z')
  const daily = asmScheduler.nextRunFrom(base, 'daily')
  const weekly = asmScheduler.nextRunFrom(base, 'weekly')
  const fallback = asmScheduler.nextRunFrom(base, 'mensal')
  assert.equal(daily.getTime() - base.getTime(), 24 * 60 * 60 * 1000)
  assert.equal(weekly.getTime() - base.getTime(), 7 * 24 * 60 * 60 * 1000)
  assert.equal(fallback.getTime(), weekly.getTime())
})

test('tick: pula domínio cujo nextRunAt ainda não venceu', async () => {
  const originalFind = Domain.find
  const originalUpdate = Domain.findByIdAndUpdate
  const originalRunScan = scanner.runScan
  let updateCalled = false
  let runCalled = false

  const future = new Date(Date.now() + 60 * 60 * 1000)
  Domain.find = () => ({ lean: async () => [{ _id: 'd1', domain: 'x.com', scanState: 'done', schedule: { enabled: true, frequency: 'weekly', nextRunAt: future } }] })
  Domain.findByIdAndUpdate = async () => { updateCalled = true }
  scanner.runScan = async () => { runCalled = true }

  try {
    await asmScheduler.tick()
    assert.equal(updateCalled, false, 'não deveria reagendar um domínio que ainda não venceu')
    assert.equal(runCalled, false, 'não deveria escanear um domínio que ainda não venceu')
  } finally {
    Domain.find = originalFind
    Domain.findByIdAndUpdate = originalUpdate
    scanner.runScan = originalRunScan
  }
})

test('tick: domínio vencido e já escaneando é reagendado mas NÃO dispara outro scan (não empilha)', async () => {
  const originalFind = Domain.find
  const originalUpdate = Domain.findByIdAndUpdate
  const originalRunScan = scanner.runScan
  let rescheduled = false
  let runCalled = false

  const past = new Date(Date.now() - 60 * 1000)
  Domain.find = () => ({ lean: async () => [{ _id: 'd1', domain: 'x.com', scanState: 'scanning', schedule: { enabled: true, frequency: 'weekly', nextRunAt: past } }] })
  Domain.findByIdAndUpdate = async (_id, patch) => { if (patch?.$set?.['schedule.nextRunAt']) rescheduled = true }
  scanner.runScan = async () => { runCalled = true }

  try {
    await asmScheduler.tick()
    assert.equal(rescheduled, true, 'deveria reagendar ANTES de checar se está escaneando (evita ficar preso)')
    assert.equal(runCalled, false, 'NÃO deveria disparar outro scan por cima de um já em andamento')
  } finally {
    Domain.find = originalFind
    Domain.findByIdAndUpdate = originalUpdate
    scanner.runScan = originalRunScan
  }
})

test('tick: domínio vencido e ocioso dispara o scan', async () => {
  const originalFind = Domain.find
  const originalUpdate = Domain.findByIdAndUpdate
  const originalRunScan = scanner.runScan
  let runCalledWith = null

  const past = new Date(Date.now() - 60 * 1000)
  Domain.find = () => ({ lean: async () => [{ _id: 'd1', domain: 'x.com', scanState: 'done', schedule: { enabled: true, frequency: 'weekly', nextRunAt: past } }] })
  Domain.findByIdAndUpdate = async () => {}
  scanner.runScan = async (id) => { runCalledWith = id }

  try {
    await asmScheduler.tick()
    assert.equal(runCalledWith, 'd1')
  } finally {
    Domain.find = originalFind
    Domain.findByIdAndUpdate = originalUpdate
    scanner.runScan = originalRunScan
  }
})
