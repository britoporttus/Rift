'use strict'
// Camada de Jobs/Work: rastreia o FLUXO de tarefas de cada run do agente do início
// ao fim, no banco. O agente ORQUESTRA o pentest; este módulo mantém o Job avançando
// pelas etapas (fases) a partir da atividade real e garante um desfecho registrado.
//
// Filosofia: o backend é a fonte da verdade do FLUXO (não depende do agente reportar
// passos) → mesmo que o agente caia, o Job tem um estado consistente e reconciliável.
const { v4: uuid } = require('uuid')
const Job = require('./models/Job')

// Etapas canônicas do fluxo. Ordem = progresso natural do pentest.
const CANONICAL_STEPS = [
  { key: 'recon',   label: 'Reconhecimento' },
  { key: 'enum',    label: 'Enumeração' },
  { key: 'vuln',    label: 'Vulnerabilidades' },
  { key: 'exploit', label: 'Exploração' },
  { key: 'post',    label: 'Pós-exploração' },
  { key: 'report',  label: 'Relatório' },
]
const STEP_INDEX = Object.fromEntries(CANONICAL_STEPS.map((s, i) => [s.key, i]))

function freshSteps() {
  return CANONICAL_STEPS.map((s) => ({ key: s.key, label: s.label, status: 'pending', startedAt: null, endedAt: null }))
}

// Abre um Job para um run. Emite via onUpdate (WS) se fornecido.
async function startJob({ engagementId, sessionId = 'default', frameworkId = 'v2' }, onUpdate) {
  const job = await Job.create({
    _id: uuid(),
    engagementId,
    sessionId,
    frameworkId,
    status: 'running',
    steps: freshSteps(),
    currentStep: null,
    startedAt: new Date(),
    updatedAt: new Date(),
  })
  if (onUpdate) onUpdate(toDto(job))
  return job._id
}

// Avança o Job para a fase `phaseKey` (a atividade real do agente). Marca a etapa como
// 'active', fecha a anterior como 'done', e preenche etapas ANTERIORES puladas como
// 'done' (o agente pode saltar direto para enum sem "terminar" recon formalmente).
// PERMITE regressão (não rebaixa etapas já 'done'): reflete o que o agente faz AGORA.
async function advanceStep(jobId, phaseKey, onUpdate) {
  if (!jobId || !(phaseKey in STEP_INDEX)) return
  const job = await Job.findById(jobId)
  if (!job || job.status !== 'running') return
  if (job.currentStep === phaseKey) return   // já está nesta fase → no-op
  const now = new Date()
  const targetIdx = STEP_INDEX[phaseKey]
  for (const step of job.steps) {
    const idx = STEP_INDEX[step.key]
    if (idx < targetIdx) {
      // etapas anteriores: se ainda pendentes/ativas, consolidam como 'done'
      if (step.status === 'pending' || step.status === 'active') {
        step.status = 'done'
        if (!step.startedAt) step.startedAt = now
        step.endedAt = now
      }
    } else if (idx === targetIdx) {
      if (step.status !== 'done') { step.status = 'active'; if (!step.startedAt) step.startedAt = now }
    }
    // etapas futuras: intocadas (pending)
  }
  job.currentStep = phaseKey
  job.updatedAt = now
  await job.save()
  if (onUpdate) onUpdate(toDto(job))
}

// Fecha o Job no desfecho do run. `phasesReached` = fases efetivamente exercidas.
async function closeJob(jobId, { status, reason = null, findingsCount, spentUsd, phasesReached = [] } = {}, onUpdate) {
  if (!jobId) return
  const job = await Job.findById(jobId)
  if (!job) return
  const now = new Date()
  const reached = new Set(phasesReached)
  for (const step of job.steps) {
    if (reached.has(step.key)) {
      if (step.status !== 'done') { step.status = 'done'; if (!step.startedAt) step.startedAt = now; step.endedAt = now }
    } else if (step.status === 'active') {
      step.status = 'done'; step.endedAt = now
    }
    // etapas nunca alcançadas ficam 'pending' (fluxo não chegou lá) — visível no painel.
  }
  if (status) job.status = status
  job.reason = reason
  if (typeof findingsCount === 'number') job.findingsCount = findingsCount
  if (typeof spentUsd === 'number') job.spentUsd = spentUsd
  job.currentStep = null
  job.endedAt = now
  job.updatedAt = now
  await job.save()
  if (onUpdate) onUpdate(toDto(job))
}

// Reconciliação no boot: um Job 'running' persistido sem run vivo (o backend caiu no
// meio) fica órfão. Marca como 'failed'/'interrupted' para o fluxo ter um fim registrado.
async function reconcileStaleJobs() {
  const res = await Job.updateMany(
    { status: 'running' },
    { $set: { status: 'failed', reason: 'interrupted', endedAt: new Date(), updatedAt: new Date(), currentStep: null } }
  )
  return res.modifiedCount || 0
}

async function listJobs(engagementId, limit = 25) {
  const rows = await Job.find({ engagementId }).sort({ startedAt: -1 }).limit(limit).lean()
  return rows.map(toDto)
}

async function getActiveJob(engagementId, sessionId) {
  const q = { engagementId, status: 'running' }
  if (sessionId) q.sessionId = sessionId
  const job = await Job.findOne(q).sort({ startedAt: -1 }).lean()
  return job ? toDto(job) : null
}

function toDto(job) {
  const j = typeof job.toObject === 'function' ? job.toObject() : job
  return { ...j, id: j._id }
}

module.exports = {
  CANONICAL_STEPS,
  startJob,
  advanceStep,
  closeJob,
  reconcileStaleJobs,
  listJobs,
  getActiveJob,
}
