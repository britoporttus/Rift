// P1-23 (auditoria 2026-07-20): Usage.engagementId sem índice — toda agregação
// de custo por engagement fazia table scan (cresce a cada turno do agente).
// Ver docs/ROADMAP-AUDITORIA-2026-07-20.md.
const { test } = require('node:test')
const assert = require('node:assert')
const Usage = require('../src/models/Usage')

test('Usage.engagementId tem índice de campo (regressão de "esqueceram o índice")', () => {
  assert.equal(Usage.schema.path('engagementId').options.index, true)
})

test('Usage tem índice composto {engagementId, ts} declarado no schema', () => {
  const indexes = Usage.schema.indexes()
  const hasComposite = indexes.some(([spec]) => spec.engagementId === 1 && spec.ts === -1)
  assert.ok(hasComposite, `esperava um índice {engagementId:1, ts:-1}, achou: ${JSON.stringify(indexes)}`)
})
