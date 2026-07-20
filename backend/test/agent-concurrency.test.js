// P1-10 (auditoria 2026-07-20): só o worker de jobs agendados tinha teto de
// concorrência (JOBS_MAX_CONCURRENT). O caminho de chat interativo não tinha
// nenhum — qualquer role podia abrir sessões `claude --dangerously-skip-permissions`
// sem limite (DoS de CPU/RAM/disco na VPS única). Ver docs/ROADMAP-AUDITORIA-2026-07-20.md.
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'
const { run, MAX_CONCURRENT_SESSIONS, runningSessions, isRunning } = require('../src/agent-runner')

test('MAX_CONCURRENT_SESSIONS tem um teto padrão finito e razoável', () => {
  assert.equal(typeof MAX_CONCURRENT_SESSIONS, 'number')
  assert.ok(MAX_CONCURRENT_SESSIONS > 0 && MAX_CONCURRENT_SESSIONS <= 20)
})

test('run() recusa nova sessão quando o teto global é atingido, sem derrubar as existentes', () => {
  // Preenche o mapa com sessões "fantasma" até o teto — não spawna processo real.
  const fakeIds = []
  for (let i = 0; i < MAX_CONCURRENT_SESSIONS; i++) {
    const id = `fake-session-${i}`
    fakeIds.push(id)
    runningSessions.set(id, { proc: { exitCode: null }, subscribers: new Set(), timeoutTimer: null })
  }

  try {
    const events = []
    const subscribers = (event) => events.push(event)
    run('sessao-nova-alem-do-teto', 'eng-x', 'oi', subscribers, () => {}, () => {}, {}, { role: 'admin' }, {})

    assert.equal(runningSessions.has('sessao-nova-alem-do-teto'), false, 'não deve registrar a sessão recusada')
    const limitMsg = events.find((e) => e.type === 'agent_message' && /limite/i.test(e.text || ''))
    assert.ok(limitMsg, 'deveria emitir agent_message avisando do limite')
    assert.match(limitMsg.text, new RegExp(String(MAX_CONCURRENT_SESSIONS)))

    // As sessões "existentes" continuam intactas (não foram afetadas pela recusa).
    for (const id of fakeIds) assert.equal(runningSessions.has(id), true)
  } finally {
    for (const id of fakeIds) runningSessions.delete(id)
  }
})

test('run() com sessionId já ativo recusa (mensagem distinta do teto global)', () => {
  runningSessions.set('sessao-ja-ativa', { proc: { exitCode: null }, subscribers: new Set(), timeoutTimer: null })
  try {
    const events = []
    run('sessao-ja-ativa', 'eng-x', 'oi', (e) => events.push(e), () => {}, () => {}, {}, { role: 'admin' }, {})
    const msg = events.find((e) => e.type === 'agent_message')
    assert.match(msg.text, /já ativo/i)
  } finally {
    runningSessions.delete('sessao-ja-ativa')
  }
})
