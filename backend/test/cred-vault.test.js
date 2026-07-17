// Cofre de credenciais efêmero (ETAPA 1). Garante: roundtrip em memória, clear/TTL
// zeram, describe expõe só metadados (nunca valores), e o contrato de "nada em
// repouso" (o módulo não importa fs/mongoose).
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const vault = require('../src/cred-vault')

test('set/get: roundtrip em memória (cópia, não referência)', () => {
  const creds = { tenantId: 't1', clientId: 'c1', clientSecret: 's1' }
  vault.set('run-A', creds)
  const got = vault.get('run-A')
  assert.deepEqual(got, { tenantId: 't1', clientId: 'c1', clientSecret: 's1' })
  // mutar o objeto original não afeta o que está guardado (set copia)
  creds.clientSecret = 'MUDOU'
  assert.equal(vault.get('run-A').clientSecret, 's1')
  vault.clear('run-A')
})

test('clear zera e remove a credencial (idempotente)', () => {
  vault.set('run-B', { clientSecret: 'x' })
  assert.equal(vault.has('run-B'), true)
  vault.clear('run-B')
  assert.equal(vault.get('run-B'), null)
  assert.equal(vault.has('run-B'), false)
  vault.clear('run-B') // idempotente, não quebra
})

test('TTL: credencial expira e some (backstop de run abandonado)', () => {
  vault.set('run-C', { clientSecret: 'y' }, 5) // 5ms
  return new Promise((resolve) => setTimeout(() => {
    assert.equal(vault.get('run-C'), null)
    assert.equal(vault.describe('run-C'), null)
    resolve()
  }, 20))
})

test('describe expõe só METADADOS (campos + expiração), nunca os valores', () => {
  vault.set('run-D', { tenantId: 't', clientSecret: 'SUPERSECRETO' })
  const meta = vault.describe('run-D')
  assert.deepEqual(meta.fields.sort(), ['clientSecret', 'tenantId'])
  assert.equal(typeof meta.expiresAt, 'number')
  // o valor secreto NÃO aparece em lugar nenhum do describe
  assert.equal(JSON.stringify(meta).includes('SUPERSECRETO'), false)
  vault.clear('run-D')
})

test('get em key ausente → null; set inválido → erro', () => {
  assert.equal(vault.get('nao-existe'), null)
  assert.throws(() => vault.set('', { a: 1 }), /obrigatórios/)
  assert.throws(() => vault.set('k', null), /obrigatórios/)
  assert.throws(() => vault.set('k', 'string-nao-objeto'), /obrigatórios/)
})

test('CONTRATO: o módulo não importa fs nem mongoose (nada em repouso)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'cred-vault.js'), 'utf8')
  // ignora comentários citando fs/mongoose no contrato; checa require() reais
  assert.equal(/require\(\s*['"]fs['"]\s*\)/.test(src), false, 'não deve require fs')
  assert.equal(/require\(\s*['"]mongoose['"]\s*\)/.test(src), false, 'não deve require mongoose')
  assert.equal(/require\(\s*['"]\.\/models\//.test(src), false, 'não deve require models')
})

test('_clearAll limpa tudo (shutdown/teste)', () => {
  vault.set('run-E', { a: '1' })
  vault.set('run-F', { b: '2' })
  vault._clearAll()
  assert.equal(vault.has('run-E'), false)
  assert.equal(vault.has('run-F'), false)
})
