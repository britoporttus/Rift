// P1-20 (auditoria 2026-07-20): um scan agendado e uma sessão interativa do
// MESMO engagement podiam rodar em paralelo, escrevendo nos mesmos arquivos
// (scope.yaml/engagement-state.yaml/findings/) ao mesmo tempo. Ver
// docs/ROADMAP-AUDITORIA-2026-07-20.md.
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'

const scheduler = require('../src/scheduler')
const agentRunner = require('../src/agent-runner')
const jobs = require('../src/jobs')
const Engagement = require('../src/models/Engagement')

test('dispatchScheduledJob ADIA (defer) em vez de rodar quando há sessão interativa ativa no engagement', async () => {
  const originalFindById = Engagement.findById
  const originalIsRunning = agentRunner.isRunning
  const originalIsEngRunning = agentRunner.isEngagementRunning
  const originalDeferJob = jobs.deferJob
  const originalRun = agentRunner.run

  let deferredJobId = null
  let runCalled = false

  Engagement.findById = () => ({ lean: async () => ({ _id: 'eng-1', schedule: {}, slug: 'x', date: '2026-01-01' }) })
  agentRunner.isRunning = () => false
  agentRunner.isEngagementRunning = (engId) => engId === 'eng-1'
  jobs.deferJob = async (jobId) => { deferredJobId = jobId }
  agentRunner.run = () => { runCalled = true }

  try {
    await scheduler.dispatchScheduledJob({ id: 'job-1', engagementId: 'eng-1', sessionId: null, payload: {} })
    assert.equal(deferredJobId, 'job-1', 'deveria adiar o job travado (não rodar por cima da sessão interativa)')
    assert.equal(runCalled, false, 'NÃO deveria disparar o agente enquanto a sessão interativa está ativa')
  } finally {
    Engagement.findById = originalFindById
    agentRunner.isRunning = originalIsRunning
    agentRunner.isEngagementRunning = originalIsEngRunning
    jobs.deferJob = originalDeferJob
    agentRunner.run = originalRun
  }
})
