// ETAPA 2.2 — utilização da SKU. Sem fonte oficial de limite, NÃO simular:
// available:false. Com limite declarado, calcular consumo × limite corretamente.
const { test } = require('node:test')
const assert = require('node:assert')
const { computeSkuUsage } = require('../src/sku')

test('sem limite configurado → indisponível (não simula %)', () => {
  const r = computeSkuUsage({ limitUsd: null, spentUsd: 12.5, tokensTotal: 100000 })
  assert.equal(r.available, false)
  assert.equal(r.reason, 'not_configured')
  assert.equal(r.spentUsd, 12.5)       // consumo real segue disponível
  assert.equal(r.percent, undefined)    // nenhum percentual inventado
})

test('com limite declarado → consumo, saldo e percentual reais', () => {
  const r = computeSkuUsage({ limitUsd: 100, spentUsd: 25, tokensTotal: 50000, periodLabel: 'mês' })
  assert.equal(r.available, true)
  assert.equal(r.limitUsd, 100)
  assert.equal(r.remainingUsd, 75)
  assert.equal(r.percent, 25)
  assert.equal(r.period, 'mês')
})

test('percentual satura em 100 quando o consumo excede o limite', () => {
  const r = computeSkuUsage({ limitUsd: 10, spentUsd: 40 })
  assert.equal(r.percent, 100)
  assert.equal(r.remainingUsd, 0)
})

test('limite inválido (0/negativo/NaN) → indisponível', () => {
  assert.equal(computeSkuUsage({ limitUsd: 0, spentUsd: 5 }).available, false)
  assert.equal(computeSkuUsage({ limitUsd: -3, spentUsd: 5 }).available, false)
  assert.equal(computeSkuUsage({ limitUsd: NaN, spentUsd: 5 }).available, false)
})
