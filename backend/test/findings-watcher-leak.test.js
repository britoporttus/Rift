// P1-26 (auditoria 2026-07-20): o Set `broadcasted` (dedup de broadcast ao
// vivo) nunca era limpo — nem no unwatch() nem na exclusão do engagement —
// crescendo pra sempre num processo de longa duração (memory leak lento).
// Ver docs/ROADMAP-AUDITORIA-2026-07-20.md.
const { test } = require('node:test')
const assert = require('node:assert')
const { unwatch, closeAll, broadcasted, clearBroadcasted } = require('../src/findings-watcher')

test('clearBroadcasted remove só as chaves do engagementId informado', () => {
  broadcasted.add('eng-1::/path/a.yaml')
  broadcasted.add('eng-1::/path/b.yaml')
  broadcasted.add('eng-2::/path/c.yaml')
  try {
    clearBroadcasted('eng-1')
    assert.equal(broadcasted.has('eng-1::/path/a.yaml'), false)
    assert.equal(broadcasted.has('eng-1::/path/b.yaml'), false)
    assert.equal(broadcasted.has('eng-2::/path/c.yaml'), true, 'não deveria afetar outro engagement')
  } finally { broadcasted.clear() }
})

test('unwatch() limpa as entradas de broadcasted do engagement, mesmo sem watcher ativo', () => {
  broadcasted.add('eng-3::/x.yaml')
  try {
    unwatch('eng-3') // nenhum watcher registrado — não deveria lançar, e ainda deve limpar
    assert.equal(broadcasted.has('eng-3::/x.yaml'), false)
  } finally { broadcasted.clear() }
})

test('closeAll() zera o Set inteiro (shutdown gracioso)', () => {
  broadcasted.add('eng-4::/y.yaml')
  broadcasted.add('eng-5::/z.yaml')
  try {
    closeAll()
    assert.equal(broadcasted.size, 0)
  } finally { broadcasted.clear() }
})

test('clearBroadcasted não afeta chaves de outro engagement cujo id é prefixo do primeiro', () => {
  // Guarda contra um bug sutil de startsWith: "eng-1" não deveria casar com "eng-10".
  broadcasted.add('eng-1::/a.yaml')
  broadcasted.add('eng-10::/b.yaml')
  try {
    clearBroadcasted('eng-1')
    assert.equal(broadcasted.has('eng-1::/a.yaml'), false)
    assert.equal(broadcasted.has('eng-10::/b.yaml'), true, 'eng-10 não é eng-1 — não deveria ser limpo')
  } finally { broadcasted.clear() }
})
