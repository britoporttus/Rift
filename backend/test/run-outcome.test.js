// Regressão dos ESTADOS DE EXECUÇÃO (ETAPA 1.3).
// Antes do fix: server usava `code === 0 ? 'completed' : 'stopped'` → falha de
// safeguard (sai 0) e run que parou antes de vuln viravam "concluído".
// deriveRunOutcome é a fonte única; este teste trava as 4 saídas + a invariante.
const { test } = require('node:test')
const assert = require('node:assert')
const { deriveRunOutcome } = require('../src/run-outcome')

test('concluído: saída limpa que ALCANÇOU vulnerabilidades', () => {
  assert.deepEqual(
    deriveRunOutcome({ code: 0, phasesReached: ['recon', 'enum', 'vuln'] }),
    { runState: 'completed', stopReason: null }
  )
})

test('INVARIANTE: safeguard (sai com code 0) NUNCA vira concluído → failed', () => {
  const r = deriveRunOutcome({ code: 0, blockedBySafeguard: true, phasesReached: ['recon', 'enum', 'vuln'] })
  assert.equal(r.runState, 'failed')
  assert.notEqual(r.runState, 'completed')
  assert.equal(r.stopReason, 'safeguard')
})

test('incompleto: saiu limpo mas parou antes de vulnerabilidades → stopped/incomplete (não concluído)', () => {
  const r = deriveRunOutcome({ code: 0, phasesReached: ['recon', 'enum'] })
  assert.equal(r.runState, 'stopped')
  assert.equal(r.stopReason, 'incomplete')
})

test('parado pelo operador tem precedência (mesmo com vuln alcançada e kill 143)', () => {
  assert.deepEqual(
    deriveRunOutcome({ code: 143, operatorStopped: true, phasesReached: ['recon', 'enum', 'vuln'] }),
    { runState: 'stopped', stopReason: 'operator' }
  )
})

test('parado por limite de custo → stopped/budget', () => {
  assert.deepEqual(
    deriveRunOutcome({ code: 143, budgetExceeded: true, phasesReached: ['recon'] }),
    { runState: 'stopped', stopReason: 'budget' }
  )
})

test('timeout → failed/timeout', () => {
  assert.deepEqual(
    deriveRunOutcome({ code: 143, timedOut: true }),
    { runState: 'failed', stopReason: 'timeout' }
  )
})

test('código de erro real → failed/error', () => {
  const r = deriveRunOutcome({ code: 1, phasesReached: ['recon'] })
  assert.equal(r.runState, 'failed')
  assert.equal(r.stopReason, 'error')
})

test('turno sem fase (chat/relatório) com saída limpa → concluído', () => {
  assert.deepEqual(
    deriveRunOutcome({ code: 0, phasesReached: [] }),
    { runState: 'completed', stopReason: null }
  )
})

test('kill deliberado sem causa conhecida (restart) → stopped/interrupted', () => {
  assert.deepEqual(
    deriveRunOutcome({ code: 143, phasesReached: [] }),
    { runState: 'stopped', stopReason: 'interrupted' }
  )
})
