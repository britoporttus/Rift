// Regressão do "ATUALIZAR DADOS SEM DUPLICAÇÃO" (ETAPA 2.1).
// O botão de refresh reexecuta o mesmo merge; ele precisa ser idempotente.
const { test } = require('node:test')
const assert = require('node:assert')
const { mergeMessages } = require('../lib/mergeMessages')

test('não duplica mensagem persistida que também voltou ao vivo (dedup por _dbId)', () => {
  const history = [{ type: 'agent_message', _dbId: 'x1', text: 'a' }, { type: 'agent_message', _dbId: 'x2', text: 'b' }]
  const live    = [{ type: 'agent_message', _dbId: 'x2', text: 'b' }]
  const out = mergeMessages(history, live, [])
  assert.equal(out.filter((m) => m._dbId === 'x2').length, 1)
  assert.equal(out.length, 2)
})

test('finding persistido com título já presente no feed não duplica', () => {
  const live      = [{ type: 'finding', id: 'ENUM-001', title: 'Swagger exposto' }]
  const persisted = [{ type: 'finding', _id: -100000, id: 'db1', title: 'Swagger exposto' }]
  const out = mergeMessages([], live, persisted)
  assert.equal(out.filter((m) => m.type === 'finding').length, 1)
})

test('idempotente: reexecutar o refresh com os mesmos dados não muda a contagem', () => {
  const history   = [{ type: 'agent_message', _dbId: 'x1' }]
  const live      = [{ type: 'finding', id: 'A', title: 'T1' }]
  const persisted = [{ type: 'finding', _id: -1, id: 'db', title: 'T1' }, { type: 'finding', _id: -2, id: 'db2', title: 'T2' }]
  const a = mergeMessages(history, live, persisted)
  const b = mergeMessages(history, live, persisted)
  assert.equal(a.length, b.length)
  // T1 não duplica (já no feed vivo); T2 (só no banco) entra uma vez.
  assert.equal(a.filter((m) => m.type === 'finding').length, 2)
})
