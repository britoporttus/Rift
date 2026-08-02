// P1-21 (auditoria 2026-07-20): heartbeatAt era gravado no claim e nunca mais
// lido — um job travado (processo vivo, sem progresso) nunca era detectado em
// runtime, só reconciliado no próximo BOOT. Ver docs/ROADMAP-AUDITORIA-2026-07-20.md.
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'
const jobs = require('../src/jobs')
const jobsWorker = require('../src/jobs-worker')
const agentRunner = require('../src/agent-runner')
const Job = require('../src/models/Job')
// Frente 0: db falso apontando para o model monkeypatchado pelo teste.
const db = { Job }

test('findStaleRunningJobs: só devolve running com heartbeatAt mais velho que staleMs', async () => {
  const original = Job.find
  const now = Date.now()
  const rows = [
    { _id: 'fresh', status: 'running', kind: 'scheduled', heartbeatAt: new Date(now - 1000) },
    { _id: 'stale', status: 'running', kind: 'scheduled', heartbeatAt: new Date(now - 20 * 60 * 1000) },
  ]
  let queryFilter = null
  Job.find = (filter) => { queryFilter = filter; return { lean: async () => rows.filter((r) => new Date(r.heartbeatAt) < filter.heartbeatAt.$lt) } }
  try {
    const result = await jobs.findStaleRunningJobs(db, ['scheduled'], 10 * 60 * 1000)
    assert.equal(result.length, 1)
    assert.equal(result[0].id, 'stale')
    assert.equal(queryFilter.status, 'running')
  } finally { Job.find = original }
})

test('reapStaleJobs: mata a sessão (agentRunner.stop) e fecha o job como failed/stale', async () => {
  const originalFind = Job.find
  const originalFindById = Job.findById
  const originalStop = agentRunner.stop

  let stoppedSessionId = null
  // closeJob() faz Job.findById(...) e muta + .save() (não findByIdAndUpdate).
  const fakeJobDoc = { steps: [], status: 'running', reason: null, findingsCount: 0, spentUsd: 0, currentStep: 'vuln', save: async function () {} }
  Job.find = () => ({ lean: async () => [{ _id: 'job-stale-1', sessionId: 'scheduled-eng-9', status: 'running', kind: 'scheduled' }] })
  Job.findById = async () => fakeJobDoc
  agentRunner.stop = (sessionId) => { stoppedSessionId = sessionId }

  try {
    const n = await jobsWorker.reapStaleJobs(db)
    assert.equal(n, 1)
    assert.equal(stoppedSessionId, 'scheduled-eng-9')
    assert.equal(fakeJobDoc.status, 'failed')
    assert.equal(fakeJobDoc.reason, 'stale')
  } finally {
    Job.find = originalFind
    Job.findById = originalFindById
    agentRunner.stop = originalStop
  }
})

test('reapStaleJobs: sem jobs travados, não faz nada (retorna 0)', async () => {
  const original = Job.find
  Job.find = () => ({ lean: async () => [] })
  try {
    assert.equal(await jobsWorker.reapStaleJobs(db), 0)
  } finally { Job.find = original }
})
