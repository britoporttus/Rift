// P1-22 (auditoria 2026-07-20): GET /api/findings sempre lia a coleção inteira,
// sem paginação — cresce com o histórico. `limit`/`page` são opt-in: sem eles,
// o contrato antigo (array completo) não muda, então nenhum caller existente
// quebra. Ver docs/ROADMAP-AUDITORIA-2026-07-20.md.
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'
const router = require('../src/api/findings')
const { paginate } = router

test('paginate: sem limit, devolve a lista inteira (contrato antigo preservado)', () => {
  const list = [1, 2, 3, 4, 5]
  const result = paginate(list, {})
  assert.deepEqual(result.items, list)
  assert.equal(result.total, 5)
  assert.equal(result.page, undefined)
})

test('paginate: com limit, fatia a página 1 por padrão', () => {
  const list = [1, 2, 3, 4, 5]
  const result = paginate(list, { limit: '2' })
  assert.deepEqual(result.items, [1, 2])
  assert.equal(result.total, 5)
  assert.equal(result.page, 1)
  assert.equal(result.limit, 2)
})

test('paginate: respeita o parâmetro page', () => {
  const list = [1, 2, 3, 4, 5]
  assert.deepEqual(paginate(list, { limit: '2', page: '2' }).items, [3, 4])
  assert.deepEqual(paginate(list, { limit: '2', page: '3' }).items, [5])
})

test('paginate: página além do fim devolve lista vazia (sem erro)', () => {
  const list = [1, 2, 3]
  assert.deepEqual(paginate(list, { limit: '2', page: '10' }).items, [])
})

test('paginate: limit é limitado a 1000 (teto de segurança)', () => {
  const list = Array.from({ length: 5 }, (_, i) => i)
  const result = paginate(list, { limit: '99999' })
  assert.equal(result.limit, 1000)
  assert.deepEqual(result.items, list) // lista real é menor que o teto
})

test('paginate: page/limit inválidos (não-numéricos) caem pro default seguro', () => {
  const list = [1, 2, 3]
  assert.deepEqual(paginate(list, { limit: 'abc' }).items, list) // limit inválido → 0 → sem paginação
  assert.deepEqual(paginate(list, { limit: '2', page: 'abc' }).items, [1, 2]) // page inválido → 1
})

test('GET /api/findings: query.limit ausente não é interceptado (mantém rota original)', () => {
  const layer = router.stack.find((l) => l.route && l.route.path === '/' && l.route.methods.get)
  assert.ok(layer, 'rota GET / não encontrada')
})
