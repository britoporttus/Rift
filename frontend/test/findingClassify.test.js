// Regressão da CLASSIFICAÇÃO de findings (ETAPA 5.2).
// Antes: tudo caía em 'weakness' (lia campo inexistente finding_type).
const { test } = require('node:test')
const assert = require('node:assert')
const { findingType, findingConfirmation, findingExploitation, cvssKind } = require('../lib/findingClassify')

test('Tipo deriva de state/severity (não do inexistente finding_type)', () => {
  assert.equal(findingType({ state: 'confirmed', severity: 'high' }), 'vulnerability')
  assert.equal(findingType({ state: 'probable', severity: 'medium' }), 'weakness')
  assert.equal(findingType({ state: 'informational', severity: 'low' }), 'observation')
  assert.equal(findingType({ state: 'false_positive', severity: 'high' }), 'observation')
})

test('Info NUNCA é contado como fraqueza → observação', () => {
  assert.equal(findingType({ severity: 'info' }), 'observation')
  assert.equal(findingType({ state: '', severity: 'info' }), 'observation')
})

test('sem state (legado) com severidade → fraqueza (não vulnerabilidade)', () => {
  assert.equal(findingType({ severity: 'medium' }), 'weakness')
})

test('Confirmação espelha o state', () => {
  assert.equal(findingConfirmation({ state: 'confirmed' }), 'confirmed')
  assert.equal(findingConfirmation({ state: 'probable' }), 'probable')
  assert.equal(findingConfirmation({ state: 'false_positive' }), 'false_positive')
  assert.equal(findingConfirmation({ state: 'informational' }), 'unvalidated')
  assert.equal(findingConfirmation({}), 'unvalidated')
})

test('Exploração usa reproducible (confirmado ≠ explorável)', () => {
  assert.equal(findingExploitation({ reproducible: true }), 'confirmed')
  assert.equal(findingExploitation({ reproducible: false }), 'not_exploitable')
  assert.equal(findingExploitation({ state: 'probable' }), 'potential')
  assert.equal(findingExploitation({ state: 'confirmed' }), 'untested', 'confirmado sem reproducible não vira "explorável"')
  assert.equal(findingExploitation({}), 'untested')
})

test('CVSS: calculado (com vetor) vs estimado (só nota) vs nenhum', () => {
  assert.equal(cvssKind({ cvss: 7.5, cvssVector: 'CVSS:3.1/AV:N/...' }), 'calculated')
  assert.equal(cvssKind({ cvss: 7.5 }), 'estimated')
  assert.equal(cvssKind({ cvss: null }), null)
  assert.equal(cvssKind({}), null)
})
