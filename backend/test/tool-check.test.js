// Checagem de presença de tooling no host (gate de packs autenticados).
const { test } = require('node:test')
const assert = require('node:assert')
const tc = require('../src/tool-check')

test('hasTool: encontra um binário universal (node/sh) e nega um inexistente', () => {
  // 'sh' existe em qualquer host POSIX; um nome aleatório não.
  assert.equal(tc.hasTool('sh'), true)
  assert.equal(tc.hasTool('binario-que-nao-existe-xyz-123'), false)
})

test('missingTools: retorna só os ausentes', () => {
  const missing = tc.missingTools(['sh', 'binario-que-nao-existe-xyz-123'])
  assert.deepEqual(missing, ['binario-que-nao-existe-xyz-123'])
  assert.deepEqual(tc.missingTools([]), [])
  assert.deepEqual(tc.missingTools(['sh']), [])
})

test('candidateDirs inclui go/bin e ~/.local/bin (dirs de tooling de pentest)', () => {
  const dirs = tc.candidateDirs()
  assert.ok(dirs.some((d) => d.endsWith('/.local/bin')))
  assert.ok(dirs.some((d) => d.includes('go/bin')))
})
