// P1-17 (auditoria 2026-07-20): fingerprint indexado mas não `unique` — o
// upsert (findOneAndUpdate por fingerprint) assumia unicidade que o índice não
// garantia. Ver docs/ROADMAP-AUDITORIA-2026-07-20.md.
const { test } = require('node:test')
const assert = require('node:assert')
const { pickDuplicatesToRemove } = require('../src/dedupe-logic')

test('schemas declaram fingerprint como unique (regressão de "esqueceram o índice")', () => {
  const DomainAsset = require('../src/models/DomainAsset')
  const LeakedCredential = require('../src/models/LeakedCredential')
  assert.equal(DomainAsset.schema.path('fingerprint').options.unique, true)
  assert.equal(LeakedCredential.schema.path('fingerprint').options.unique, true)
})

test('pickDuplicatesToRemove: sem duplicata, não remove nada', () => {
  const docs = [{ _id: 'a', fingerprint: 'fp1' }, { _id: 'b', fingerprint: 'fp2' }]
  assert.deepEqual(pickDuplicatesToRemove(docs), [])
})

test('pickDuplicatesToRemove: mantém o mais recente (lastSeen), remove o resto do grupo', () => {
  const docs = [
    { _id: 'old', fingerprint: 'fp1', lastSeen: new Date('2026-01-01') },
    { _id: 'new', fingerprint: 'fp1', lastSeen: new Date('2026-01-05') },
    { _id: 'mid', fingerprint: 'fp1', lastSeen: new Date('2026-01-03') },
  ]
  const removed = pickDuplicatesToRemove(docs)
  assert.equal(removed.length, 2)
  assert.deepEqual(removed.map((d) => d._id).sort(), ['mid', 'old'])
})

test('pickDuplicatesToRemove: usa updatedAt como desempate quando lastSeen ausente', () => {
  const docs = [
    { _id: 'a', fingerprint: 'fp1', updatedAt: new Date('2026-01-01') },
    { _id: 'b', fingerprint: 'fp1', updatedAt: new Date('2026-01-10') },
  ]
  const removed = pickDuplicatesToRemove(docs)
  assert.deepEqual(removed.map((d) => d._id), ['a'])
})

test('pickDuplicatesToRemove: ignora docs sem fingerprint (não agrupa null com null)', () => {
  const docs = [{ _id: 'a', fingerprint: null }, { _id: 'b', fingerprint: null }, { _id: 'c' }]
  assert.deepEqual(pickDuplicatesToRemove(docs), [])
})

test('pickDuplicatesToRemove: múltiplos grupos duplicados independentes', () => {
  const docs = [
    { _id: 'a1', fingerprint: 'A', lastSeen: new Date('2026-01-01') },
    { _id: 'a2', fingerprint: 'A', lastSeen: new Date('2026-01-02') },
    { _id: 'b1', fingerprint: 'B', lastSeen: new Date('2026-01-01') },
    { _id: 'b2', fingerprint: 'B', lastSeen: new Date('2026-01-02') },
    { _id: 'c1', fingerprint: 'C' }, // único, não deveria ser removido
  ]
  const removed = pickDuplicatesToRemove(docs).map((d) => d._id).sort()
  assert.deepEqual(removed, ['a1', 'b1'])
})
