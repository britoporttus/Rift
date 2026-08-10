'use strict'
// Camada de Jobs/Work: rastreia o FLUXO de tarefas de cada run do agente do início
// ao fim, no banco. O agente ORQUESTRA o pentest; este módulo mantém o Job avançando
// pelas etapas (fases) a partir da atividade real e garante um desfecho registrado.
//
// Filosofia: o backend é a fonte da verdade do FLUXO (não depende do agente reportar
// passos) → mesmo que o agente caia, o Job tem um estado consistente e reconciliável.
const { v4: uuid } = require('uuid')

// Teto de tentativas de um job da fila (dispatch inicial + retomadas por crash).
const DEFAULT_MAX_ATTEMPTS = Number(process.env.JOBS_MAX_ATTEMPTS) || 3

// Notifier global de job_update (igual ao do findings-watcher). O server registra
// `(engagementId, event) => broadcastEngagement(...)` uma vez; assim QUALQUER mudança de
// job — inclusive de scans agendados/headless, que não têm subscriber próprio — anima o
// painel ao vivo para quem estiver conectado no engagement.
let notifier = null
function setNotifier(fn) { notifier = fn }
function emit(jobDoc) {
  if (!notifier || !jobDoc) return
  const job = toDto(jobDoc)
  try { notifier(job.engagementId, { type: 'job_update', job }) } catch {}
}

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

// Abre um Job para um run (interativo). Broadcast ao vivo via notifier global.
async function startJob(db, { engagementId, sessionId = 'default', frameworkId = 'v2', domainPackId = 'web' }) {
  const job = await db.Job.create({
    _id: uuid(),
    engagementId,
    sessionId,
    frameworkId,
    domainPackId,
    status: 'running',
    steps: freshSteps(),
    currentStep: null,
    startedAt: new Date(),
    updatedAt: new Date(),
  })
  emit(job)
  return job._id
}

// Avança o Job para a fase `phaseKey` (a atividade real do agente). Marca a etapa como
// 'active', fecha a anterior como 'done', e preenche etapas ANTERIORES puladas como
// 'done' (o agente pode saltar direto para enum sem "terminar" recon formalmente).
// PERMITE regressão (não rebaixa etapas já 'done'): reflete o que o agente faz AGORA.
async function advanceStep(db, jobId, phaseKey) {
  if (!jobId || !(phaseKey in STEP_INDEX)) return
  const job = await db.Job.findById(jobId)
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
  emit(job)
}

// Fecha o Job no desfecho do run. `phasesReached` = fases efetivamente exercidas.
async function closeJob(db, jobId, { status, reason = null, findingsCount, spentUsd, phasesReached = [] } = {}) {
  if (!jobId) return
  const job = await db.Job.findById(jobId)
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
  emit(job)
}

// ── Fila durável (padrão "outbox") ─────────────────────────────────────────────
// Enfileira um run: grava a INTENÇÃO como 'queued' antes de qualquer processo existir.
// O worker (jobs-worker.js) é quem despacha. `payload` = snapshot p/ reconstruir o run.
async function enqueueJob(db, { engagementId, sessionId = 'default', frameworkId = 'v2', domainPackId = 'web', kind = 'scheduled', payload = null, maxAttempts } = {}) {
  const now = new Date()
  const job = await db.Job.create({
    _id: uuid(),
    engagementId,
    sessionId,
    frameworkId,
    domainPackId,
    kind,
    status: 'queued',
    steps: freshSteps(),
    currentStep: null,
    payload,
    attempts: 0,
    maxAttempts: maxAttempts || DEFAULT_MAX_ATTEMPTS,
    queuedAt: now,
    startedAt: null,   // preenchido no claim
    updatedAt: now,
  })
  emit(job)          // broadcast 'queued' → painel mostra "na fila" na hora
  return job._id
}

// Já existe um job "ativo" (na fila OU rodando) para este engagement? Evita empilhar
// runs duplicados do mesmo alvo (o tick do agendador roda a cada 5 min).
async function hasActiveJob(db, engagementId, kinds = ['scheduled']) {
  return !!(await db.Job.exists({ engagementId, kind: { $in: kinds }, status: { $in: ['queued', 'running'] } }))
}

// Claim ATÔMICO: pega o job 'queued' mais antigo (FIFO) de um kind cujo engagement não
// esteja ocupado, e o vira 'running' na MESMA operação. O findOneAndUpdate é atômico no
// documento → dois ticks nunca pegam o mesmo job (single-flight). Incrementa attempts.
async function claimNextQueuedJob(db, { kinds = ['scheduled'], busyEngagementIds = [] } = {}) {
  const now = new Date()
  // returnDocument:'after' (não `new:true`, que está deprecado) — este claim roda a cada
  // ~2s no worker; a forma deprecada floodaria o log com um aviso por tick.
  const job = await db.Job.findOneAndUpdate(
    { status: 'queued', kind: { $in: kinds }, engagementId: { $nin: busyEngagementIds } },
    { $set: { status: 'running', startedAt: now, heartbeatAt: now, updatedAt: now }, $inc: { attempts: 1 } },
    { sort: { queuedAt: 1 }, returnDocument: 'after' },
  )
  if (!job) return null
  emit(job)          // broadcast 'queued' → 'running' → painel troca "na fila" por "em andamento"
  return toDto(job)
}

// Quantos jobs de um kind estão 'running' agora (para o teto de concorrência do worker).
async function countRunningJobs(db, kinds = ['scheduled']) {
  return db.Job.countDocuments({ status: 'running', kind: { $in: kinds } })
}

// engagementIds com job 'running' (para o filtro single-flight do claim).
async function runningEngagementIds(db, kinds = ['scheduled']) {
  return db.Job.distinct('engagementId', { status: 'running', kind: { $in: kinds } })
}

// Persiste o session_id do CLI no próprio Job → habilita o resume mesmo após restart
// (o mapa em memória do agent-runner morre; o Job sobrevive no banco).
async function setClaudeSession(db, jobId, claudeSessionId) {
  if (!jobId || !claudeSessionId) return
  await db.Job.findByIdAndUpdate(jobId, { $set: { claudeSessionId, heartbeatAt: new Date() } }).catch(() => {})
}

// Sinal de vida periódico do run (o worker/dispatcher pode chamar). Não é obrigatório
// para a recuperação no boot (lá, todo 'running' é órfão), mas ajuda diagnóstico.
async function heartbeatJob(db, jobId) {
  if (!jobId) return
  await db.Job.findByIdAndUpdate(jobId, { $set: { heartbeatAt: new Date() } }).catch(() => {})
}

// P1-21 (auditoria 2026-07-20): jobs 'running' cujo heartbeatAt não é
// atualizado há mais de `staleMs` — o processo pode ter travado (rede lenta,
// loop) sem crashar, o que nunca dispararia a recuperação de boot
// (recoverInterruptedJobs só roda no restart). Usado pelo watchdog do
// jobs-worker pra liberar a vaga de concorrência em runtime.
async function findStaleRunningJobs(db, kinds = ['scheduled'], staleMs) {
  const cutoff = new Date(Date.now() - staleMs)
  const rows = await db.Job.find({ status: 'running', kind: { $in: kinds }, heartbeatAt: { $lt: cutoff } }).lean()
  return rows.map(toDto)
}

// P1-20 (auditoria 2026-07-20): devolve um job CLAIMADO ('running') pra fila
// ('queued') sem contar como tentativa nem como falha — usado quando o
// dispatch decide ADIAR (não falhar) porque uma sessão interativa do mesmo
// engagement já está ativa. Mantém `queuedAt` original (não perde a posição
// no FIFO); o worker tenta de novo no próximo tick.
async function deferJob(db, jobId) {
  const now = new Date()
  await db.Job.findByIdAndUpdate(jobId, { $set: { status: 'queued', startedAt: null, heartbeatAt: null, updatedAt: now } }).catch(() => {})
}

// Recuperação no boot ("forçar até o fim"). Nenhum processo do agente sobrevive a um
// restart → todo Job 'running' é órfão. Retomáveis (kind:'scheduled' + tem
// claudeSessionId + ainda tem tentativa) voltam pra 'queued' com resume:true e o worker
// os re-despacha com `claude --resume`. O resto (interativos, sem sessão, sem tentativa)
// é encerrado como 'failed'/interrupted para o fluxo ter um fim registrado.
async function recoverInterruptedJobsFor(db) {
  const orphans = await db.Job.find({ status: 'running' })
  const now = new Date()
  let requeued = 0, failed = 0
  for (const job of orphans) {
    const resumable = job.kind === 'scheduled' && job.claudeSessionId && job.attempts < job.maxAttempts
    if (resumable) {
      job.status = 'queued'
      job.resume = true
      job.currentStep = null
      job.queuedAt = now
      job.startedAt = null
      job.heartbeatAt = null
      job.updatedAt = now
      await job.save().catch(() => {})
      requeued++
    } else {
      job.status = 'failed'
      job.reason = 'interrupted'
      job.currentStep = null
      job.endedAt = now
      job.updatedAt = now
      await job.save().catch(() => {})
      failed++
    }
  }
  return { requeued, failed }
}

// Compat: mantido para chamadas antigas. A recuperação real no boot é
// recoverInterruptedJobs (que faz o fan-out por tenant).
// Frente 0: aqui tem que chamar a variante POR TENANT — chamar a global faria
// cada tenant disparar uma varredura de todos os outros.
async function reconcileStaleJobsFor(db) {
  const { requeued, failed } = await recoverInterruptedJobsFor(db)
  return requeued + failed
}

async function listJobs(db, engagementId, limit = 25) {
  // Ordena por updatedAt (não startedAt): um job 'queued' tem startedAt=null e ficaria
  // por último; updatedAt garante que o job mais recente (inclusive na fila) venha em [0].
  const rows = await db.Job.find({ engagementId }).sort({ updatedAt: -1 }).limit(limit).lean()
  return rows.map(toDto)
}

async function getActiveJob(db, engagementId, sessionId) {
  const q = { engagementId, status: 'running' }
  if (sessionId) q.sessionId = sessionId
  const job = await db.Job.findOne(q).sort({ startedAt: -1 }).lean()
  return job ? toDto(job) : null
}

function toDto(job) {
  const j = typeof job.toObject === 'function' ? job.toObject() : job
  return { ...j, id: j._id }
}

module.exports = {
  recoverInterruptedJobsFor, reconcileStaleJobsFor,
  CANONICAL_STEPS,
  setNotifier,
  startJob,
  advanceStep,
  closeJob,
  reconcileStaleJobs,
  listJobs,
  getActiveJob,
  // Fila durável (worker):
  enqueueJob,
  hasActiveJob,
  claimNextQueuedJob,
  countRunningJobs,
  runningEngagementIds,
  setClaudeSession,
  heartbeatJob,
  recoverInterruptedJobs,
  deferJob,
  findStaleRunningJobs,
}

// ── Fan-out por tenant (boot / watchdog) ─────────────────────────────────────
// Frente 0: estes dois rodam sem request. Um `db` único recuperaria a fila de
// um tenant e deixaria as outras presas — falham na direção segura (não veem
// nada) se alguém esquecer de iterar, mas aqui a iteração é explícita.
async function recoverInterruptedJobs() {
  const { forEachTenant } = require('./tenancy')
  const rs = await forEachTenant(({ db }) => recoverInterruptedJobsFor(db))
  return rs.filter((r) => r.ok).reduce((acc, r) => ({
    requeued: acc.requeued + (r.value?.requeued || 0),
    failed:   acc.failed   + (r.value?.failed   || 0),
  }), { requeued: 0, failed: 0 })
}

async function reconcileStaleJobs() {
  const { forEachTenant } = require('./tenancy')
  const rs = await forEachTenant(({ db }) => reconcileStaleJobsFor(db))
  return rs.filter((r) => r.ok).reduce((n, r) => n + (r.value || 0), 0)
}
