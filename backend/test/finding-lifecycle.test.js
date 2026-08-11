const { test } = require('node:test')
const assert = require('node:assert')
const {
  canTransition, reingestTransition, defaultDueDate, slaDaysFor, REMEDIATION_STATES,
} = require('../src/finding-lifecycle')

test('REGRA DE OURO: re-scan não ressuscita achado corrigido — vira regressão', () => {
  const at = new Date('2026-08-10T12:00:00Z')
  const r = reingestTransition('fixed', at, 'open')  // arquivo diz 'open', mas operador tinha corrigido
  assert.equal(r.status, 'regressed', 'fixed + reaparece = regressed, nunca open')
  assert.equal(r.historyEntry.status, 'regressed')
  assert.equal(r.historyEntry.by, 'sistema')
})

test('re-scan mantém "risco aceito" (operador decidiu; não incomodar)', () => {
  const r = reingestTransition('accepted_risk', new Date(), 'open')
  assert.equal(r.status, 'accepted_risk')
  assert.equal(r.historyEntry, null)
})

test('re-scan mantém "em correção" (ainda presente = ainda não corrigido)', () => {
  const r = reingestTransition('in_progress', new Date(), 'open')
  assert.equal(r.status, 'in_progress')
})

test('achado novo herda o estado do arquivo (ou open)', () => {
  assert.equal(reingestTransition(null, new Date(), 'open').status, 'open')
  assert.equal(reingestTransition(null, new Date(), undefined).status, 'open')
  assert.equal(reingestTransition(null, new Date(), 'accepted_risk').status, 'accepted_risk')
})

test('transições permitidas do operador', () => {
  assert.ok(canTransition('open', 'in_progress'))
  assert.ok(canTransition('in_progress', 'fixed'))
  assert.ok(canTransition('open', 'accepted_risk'))
  assert.ok(canTransition('regressed', 'in_progress'))
})

test('transições recusadas (pulo inválido / mesmo estado / estado inexistente)', () => {
  assert.ok(!canTransition('open', 'open'), 'mesmo estado não é transição')
  assert.ok(!canTransition('fixed', 'in_progress'), 'corrigido não vai direto p/ em correção')
  assert.ok(!canTransition('open', 'banana'), 'estado inexistente')
})

test('SLA e prazo derivado por severidade', () => {
  assert.equal(slaDaysFor('critical'), 7)
  assert.equal(slaDaysFor('low'), 60)
  assert.equal(slaDaysFor(undefined), 90)  // fallback info
  const from = new Date('2026-08-10T00:00:00Z')
  const due = defaultDueDate('critical', from)
  assert.equal(due.toISOString().slice(0, 10), '2026-08-17')  // +7 dias
})

test('REMEDIATION_STATES inclui in_progress (o "em correção" da Fase 5)', () => {
  assert.ok(REMEDIATION_STATES.includes('in_progress'))
})
