// Frente 0 — o que o CLIENTE vê na interface.
//
// O isolamento de dado vem do banco por tenant. Esta matriz resolve outra
// coisa: sem ela, um usuário `client` enxergava a plataforma como um operador
// interno rebaixado — custo em dólar, tokens, seletor de versão do agente,
// seletor de modelo e feed cru de comandos. Nada disso vaza dado de outro
// cliente, mas é bastidor da operação.
const { test } = require('node:test')
const assert = require('node:assert')
const { can, isClient, isOperator, CAPS } = require('../lib/viewer')

test('cliente NÃO vê custo nem tokens (é a nossa margem, não a informação dele)', () => {
  assert.equal(can('client', 'viewCost'), false)
  assert.equal(can('admin', 'viewCost'), true)
  assert.equal(can('user', 'viewCost'), true)
})

test('cliente NÃO vê o bastidor do agente (framework, modelo, feed cru)', () => {
  assert.equal(can('client', 'viewAgentInternals'), false)
  assert.equal(can('user', 'viewAgentInternals'), true)
})

test('cliente NÃO dispara fase agressiva nem autoriza domínio', () => {
  assert.equal(can('client', 'runAggressive'), false)
  assert.equal(can('client', 'authorizeDomain'), false)
})

test('cliente NÃO chega no painel admin nem na gestão de usuários', () => {
  assert.equal(can('client', 'viewAdminPanel'), false)
  assert.equal(can('client', 'manageUsers'), false)
})

test('relatório executivo continua só do admin (P0-5/P0-6 valem para o cliente também)', () => {
  assert.equal(can('client', 'viewExecutiveReport'), false)
  assert.equal(can('user', 'viewExecutiveReport'), false)
  assert.equal(can('admin', 'viewExecutiveReport'), true)
})

test('papel desconhecido não ganha nada (fail-closed)', () => {
  for (const cap of CAPS.admin) {
    assert.equal(can('papel-novo-qualquer', cap), false, `"${cap}" vazou para papel desconhecido`)
    assert.equal(can(undefined, cap), false)
    assert.equal(can(null, cap), false)
  }
})

test('user comum não é admin por acidente', () => {
  assert.equal(can('user', 'manageUsers'), false)
  assert.equal(can('user', 'viewAdminPanel'), false)
  assert.equal(can('user', 'deleteData'), false)
  assert.equal(can('user', 'runAggressive'), false)
})

test('helpers de papel', () => {
  assert.equal(isClient('client'), true)
  assert.equal(isClient('user'), false)
  assert.equal(isOperator('admin'), true)
  assert.equal(isOperator('user'), true)
  assert.equal(isOperator('client'), false)
})
