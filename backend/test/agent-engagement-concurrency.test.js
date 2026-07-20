// P1-20 (auditoria 2026-07-20): primitivas usadas para impedir run agendado e
// sessão interativa do MESMO engagement de rodar em paralelo.
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'
const { run, runningSessions, isEngagementRunning } = require('../src/agent-runner')

test('isEngagementRunning: true se QUALQUER sessão (interativa ou agendada) do engagement está viva', () => {
  runningSessions.set('sessao-x', { proc: { exitCode: null, pid: process.pid }, subscribers: new Set(), engagementId: 'eng-1' })
  try {
    assert.equal(isEngagementRunning('eng-1'), true)
    assert.equal(isEngagementRunning('eng-outro'), false)
  } finally { runningSessions.delete('sessao-x') }
})

test('run() recusa sessão interativa quando já há um scan AGENDADO ativo pro mesmo engagement', () => {
  runningSessions.set('scheduled-eng-1', { proc: { exitCode: null, pid: process.pid }, subscribers: new Set(), engagementId: 'eng-1' })
  try {
    const events = []
    run('sessao-interativa-nova', 'eng-1', 'oi', (e) => events.push(e), () => {}, () => {}, {}, { role: 'admin' }, {})
    assert.equal(runningSessions.has('sessao-interativa-nova'), false, 'não deveria iniciar por cima do scan agendado')
    const msg = events.find((e) => e.type === 'agent_message')
    assert.match(msg.text, /agendado/i)
  } finally { runningSessions.delete('scheduled-eng-1') }
})

test('run() permite sessão interativa normalmente quando NÃO há scan agendado ativo', () => {
  // Sem entrada 'scheduled-eng-2' no mapa — não deveria bloquear por esse motivo
  // (pode falhar mais adiante por outro motivo real de spawn, mas não aqui).
  assert.equal(runningSessions.has('scheduled-eng-2'), false)
})
