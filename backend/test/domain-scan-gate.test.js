// A regra "bloqueia tudo até verificar" (decisão do operador, 2026-08-03)
// precisa valer no SCANNER, não só na rota — senão o scheduler, um job ou uma
// rota futura contornam por esquecimento. Mesmo raciocínio do gate de
// `authorized` no ingest de vazamentos (P0-3).
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'
const { scanBlockReason } = require('../src/asm/scanner')
const asmScheduler = require('../src/asm-scheduler')

test('domínio PENDENTE de verificação é bloqueado', () => {
  const r = scanBlockReason({ domain: 'alvo.com', verification: { status: 'pending' } })
  assert.ok(r, 'pendente não pode escanear')
  assert.match(r, /posse verificada/)
})

test('domínio com verificação FALHA é bloqueado', () => {
  assert.ok(scanBlockReason({ domain: 'alvo.com', verification: { status: 'failed' } }))
})

test('domínio SEM o campo verification é bloqueado (fail-closed)', () => {
  // Documento antigo, ou criado por um caminho que esqueceu de setar o campo:
  // a ausência não pode ser lida como permissão.
  assert.ok(scanBlockReason({ domain: 'alvo.com' }))
  assert.ok(scanBlockReason({ domain: 'alvo.com', verification: {} }))
  assert.ok(scanBlockReason({ domain: 'alvo.com', verification: { status: 'qualquer-coisa' } }))
})

test('domínio VERIFICADO passa', () => {
  assert.equal(scanBlockReason({ domain: 'alvo.com', verification: { status: 'verified' } }), null)
})

test('LEGACY passa — é o que evita parar a operação que já roda', () => {
  // Cadastrado antes da regra existir. Passa, mas o status continua distinto de
  // 'verified' para a UI poder cobrar a regularização.
  assert.equal(scanBlockReason({ domain: 'antigo.com', verification: { status: 'legacy' } }), null)
})

test('o agendador NÃO enfileira domínio não verificado', async () => {
  // Sem isto, cada tick produziria um scan 'failed' a mais no histórico — o
  // scheduler insistindo num domínio que o scanner sempre vai recusar.
  const velho = new Date(Date.now() - 30 * 24 * 3600 * 1000)
  const domains = [
    { _id: 'ok',       domain: 'ok.com',       scanState: 'done', lastScanAt: velho, verification: { status: 'verified' } },
    { _id: 'pendente', domain: 'pendente.com', scanState: 'done', lastScanAt: velho, verification: { status: 'pending' } },
  ]
  const disparados = []
  const scanner = require('../src/asm/scanner')
  const original = scanner.runScan
  scanner.runScan = async (_db, id) => { disparados.push(id) }
  try {
    await asmScheduler.tickFor({ Domain: { find: () => ({ select: () => ({ lean: async () => domains }) }) } })
    assert.deepEqual(disparados, ['ok'], 'só o verificado pode ser enfileirado')
  } finally { scanner.runScan = original }
})
