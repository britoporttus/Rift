// Agendador de scans recorrentes — "monitoramento contínuo da superfície de ataque".
// Varre engagements com schedule.enabled e nextRunAt vencido e ENFILEIRA um run (não
// dispara direto): grava um Job 'queued' e o jobs-worker o despacha. Isso torna o run
// agendado durável e reconciliável — se o backend cair no meio, o worker retoma no boot.
const Engagement = require('./models/Engagement')
const agentRunner = require('./agent-runner')
const findingsWatcher = require('./findings-watcher')
const jobs = require('./jobs')
const jobsWorker = require('./jobs-worker')
const { deriveRunOutcome } = require('./run-outcome')
const { getEngagement, updateEngagement, appendUsage, countFindings, sumUsageUsd } = require('./store')
const { getFramework } = require('./frameworks')

const CHECK_INTERVAL_MS = 5 * 60 * 1000 // varre a cada 5 min
const FREQUENCY_MS = { daily: 24 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000 }
const HEARTBEAT_INTERVAL_MS = Number(process.env.JOB_HEARTBEAT_INTERVAL_MS) || 60 * 1000

let timer = null

function deriveEngId2(eng) {
  const slug = eng.slug || eng.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || ''
  const date = eng.date || ''
  return slug && date ? `${slug}-${date.replace(/-/g, '')}` : ''
}

function schedSessionId(engId) {
  return `scheduled-${engId}`
}

// Monta o prompt do pipeline conforme as fases escolhidas e o gating de exploração.
function buildPipelinePrompt(eng, engId2, schedule) {
  const slug = eng.slug || ''
  const date = eng.date || ''

  const steps = ['/pentest-recon']
  if (schedule.phases === 'recon_enum' || schedule.phases === 'full') steps.push('/pentest-enum')
  if (schedule.phases === 'full') {
    steps.push('/pentest-vuln')
    if (schedule.autoExploit) { steps.push('/pentest-exploit'); steps.push('/pentest-post') }
  }
  steps.push('/pentest-report')

  const gatingRule = schedule.autoExploit
    ? '- Exploração autônoma LIBERADA para este scan agendado.'
    : `- NÃO execute fases agressivas (exploit/post) sem aprovação humana. Ao chegar em um checkpoint crítico (RCE, SQLi, etc.), PARE, registre o achado como "probable" com needs_to_confirm preenchido, e siga para o relatório. Quem aprova exploração é o admin, depois.`

  return `[EXECUÇÃO AGENDADA AUTÔNOMA — SEM OPERADOR CONECTADO]
Engagement: "${eng.name}"
ID do engagement: ${engId2}
Alvo autorizado: ${eng.target} e *.${eng.target}
Diretório de contexto: context/${engId2}/
Escopo em: config/scope.yaml
Findings dir: clients/${slug}/${date}/findings/
Reports dir:  clients/${slug}/${date}/reports/

REGRAS OBRIGATÓRIAS:
- Responda SEMPRE em português brasileiro.
- Opere APENAS sobre o alvo ${eng.target} — qualquer outro alvo está fora de escopo.
- Este é um scan de MONITORAMENTO CONTÍNUO: o objetivo é detectar mudanças na superfície de ataque e regressões de findings já corrigidos.
- Use a ferramenta Write/Edit para salvar arquivos (nunca "cat >"/"tee" via Bash).
${gatingRule}
- Não peça confirmação ao operador (não há ninguém conectado). Execute o fluxo e finalize com o relatório.

TAREFA: execute, em ordem, o fluxo completo e finalize com o relatório:
${steps.join(' → ')}
`
}

// ENFILEIRA um run agendado (mantém o nome `triggerRun` para os call-sites: o tick e o
// botão "rodar agora"). Não dispara nada — grava a intenção como Job 'queued'; o worker
// despacha via dispatchScheduledJob. Guarda contra empilhar runs do mesmo engagement.
async function triggerRun(eng) {
  const engId    = eng._id
  const schedule = eng.schedule || {}

  // Já existe um run agendado ativo (na fila OU rodando) para este engagement? Não empilha.
  if (await jobs.hasActiveJob(engId, ['scheduled'])) {
    console.log(`[scheduler] já há um scan agendado ativo para ${engId}, não enfileira outro`)
    return null
  }

  // Fail-safe: se a versão do agente sumiu, não enfileira um run que morreria no dispatch.
  const framework = getFramework(eng.frameworkId)
  if (!framework.available) {
    console.warn(`[scheduler] versão "${framework.label}" indisponível para ${eng.name} — scan não enfileirado`)
    await updateEngagement(engId, { schedule: { ...schedule, lastRunStatus: 'error' } })
    return null
  }

  // Snapshot dos parâmetros NO MOMENTO do enfileiramento → uma edição do schedule entre a
  // fila e o dispatch não altera um run já pedido.
  const jobId = await jobs.enqueueJob({
    engagementId: engId,
    sessionId:    schedSessionId(engId),
    frameworkId:  framework.id,
    domainPackId: eng.domainPackId || 'web',
    kind:         'scheduled',
    payload:      { schedule },
  })
  console.log(`[scheduler] scan enfileirado: ${eng.name} (${schedule.phases}, versão ${framework.id}, teto US$ ${schedule.costCeilingUsd}) → job ${jobId}`)
  return jobId
}

// DESPACHA um job agendado (chamado pelo jobs-worker). Reconstrói o run a partir do
// snapshot, wireia o Job (advanceStep/closeJob/resume) e roda o agente headless.
async function dispatchScheduledJob(job) {
  const engId = job.engagementId
  const eng   = await getEngagement(engId)
  if (!eng) {
    await jobs.closeJob(job.id, { status: 'failed', reason: 'engagement-missing' }).catch(() => {})
    return
  }

  const engId2    = deriveEngId2(eng)
  const sessionId = job.sessionId || schedSessionId(engId)
  // O run usa o snapshot da fila (payload); cai pro schedule atual do engagement se faltar.
  const schedule  = job.payload?.schedule || eng.schedule || {}

  // Defensivo: se já há um processo vivo nesta sessão, não sobrepõe — encerra o job.
  if (agentRunner.isRunning(sessionId)) {
    console.warn(`[scheduler] run já vivo para ${sessionId} — job ${job.id} não despachado`)
    await jobs.closeJob(job.id, { status: 'failed', reason: 'already-running' }).catch(() => {})
    return
  }
  // P1-20 (auditoria 2026-07-20): uma sessão INTERATIVA do mesmo engagement
  // escreve nos mesmos arquivos (scope.yaml/engagement-state.yaml/findings/)
  // que este run agendado escreveria — rodar os dois ao mesmo tempo corrompe
  // esse estado compartilhado em silêncio. Adia o dispatch em vez de falhar
  // (o worker tenta de novo no próximo tick — não é um erro permanente).
  if (agentRunner.isEngagementRunning(engId)) {
    console.warn(`[scheduler] sessão interativa ativa para ${engId} — job ${job.id} adiado`)
    await jobs.deferJob(job.id)
    return
  }

  const framework = getFramework(eng.frameworkId)
  if (!framework.available) {
    await updateEngagement(engId, { schedule: { ...schedule, lastRunStatus: 'error' } })
    await jobs.closeJob(job.id, { status: 'failed', reason: 'framework-unavailable' }).catch(() => {})
    return
  }

  const resuming = job.resume && !!job.claudeSessionId
  console.log(`[scheduler] despachando scan: ${eng.name} (versão ${framework.id}, teto US$ ${schedule.costCeilingUsd}${resuming ? ', RETOMANDO' : ''}) — job ${job.id}`)
  await updateEngagement(engId, {
    schedule: { ...schedule, lastRunAt: new Date(), lastRunStatus: 'running' },
    status: 'active',
  })

  // Watcher de findings (sem WS): persiste no Mongo e atualiza a contagem internamente.
  findingsWatcher.watch(engId, eng.slug, eng.date, eng.name, framework, eng.target)

  // P1-21 (auditoria 2026-07-20): `heartbeatAt` era gravado no claim e nunca mais
  // atualizado — um job travado (processo vivo, mas preso/sem progresso) nunca
  // era detectado em runtime, só reconciliado no próximo BOOT do backend.
  // Batimento periódico enquanto o run está de fato ativo; o watchdog em
  // jobs-worker.js usa isso pra liberar a vaga de concorrência sem esperar um restart.
  const heartbeatTimer = setInterval(() => { jobs.heartbeatJob(job.id).catch(() => {}) }, HEARTBEAT_INTERVAL_MS)
  if (heartbeatTimer.unref) heartbeatTimer.unref()

  const prompt = buildPipelinePrompt(eng, engId2, schedule)
  // Usuário sintético do sistema; role reflete a permissão de exploração autônoma.
  const sysUser = {
    id: 'scheduler', name: 'Agendador Rift', email: 'scheduler@rift',
    role: schedule.autoExploit ? 'admin' : 'user',
  }

  agentRunner.run(
    // Sem operador conectado (headless): broadcaster no-op. Findings/estado ainda são
    // persistidos; se alguém conectar, os findings chegam via notifier global.
    sessionId, engId2, prompt, () => {},
    (usd, tokens) => appendUsage({
      usd, tokens, engagementId: engId, engagementName: eng.name,
      userId: 'scheduler', userName: 'Agendador Rift', userEmail: 'scheduler@rift',
      scheduled: true, ts: new Date(),
    }).catch(() => {}),
    // onEvent: a fase derivada da atividade real avança a etapa do Job (fluxo no banco).
    (event) => {
      if (event?.type === 'phase_update') {
        jobs.advanceStep(job.id, event.phase).catch(() => {})
      }
    },
    eng,
    sysUser,
    {
      frameworkPath: framework.path,
      costCeiling: schedule.costCeilingUsd,
      // Resume durável: no boot, um job retomável volta pra fila com resume:true e o
      // seu claudeSessionId salvo → o CLI continua de onde parou (`claude --resume`).
      resumeSessionId: resuming ? job.claudeSessionId : null,
      // Persiste o session_id do CLI no Job assim que ele aparecer → habilita o resume
      // numa próxima queda (o mapa em memória do agent-runner não sobrevive a restart).
      onClaudeSession: (cid) => jobs.setClaudeSession(job.id, cid),
      onBudgetExceeded: async () => {
        const cur = await getEngagement(engId)
        await updateEngagement(engId, { schedule: { ...(cur?.schedule || schedule), lastRunStatus: 'budget_exceeded' } })
      },
      onClose: async (code, info) => {
        clearInterval(heartbeatTimer)
        // Desfecho real do run (mesma derivação do chat interativo).
        const { runState, stopReason } = deriveRunOutcome({
          code,
          budgetExceeded:     info?.budgetExceeded,
          blockedBySafeguard: info?.blockedBySafeguard,
          timedOut:           info?.timedOut,
          phasesReached:      info?.phasesReached,
        })
        const cur = await getEngagement(engId)
        const sch = cur?.schedule || schedule
        if (sch.lastRunStatus !== 'budget_exceeded') {
          await updateEngagement(engId, {
            schedule: { ...sch, lastRunStatus: (code === 0 || info?.budgetExceeded) ? 'completed' : 'error' },
          })
        }
        // Fecha o Job com o desfecho + totais. NOTA: um job encerrado como 'failed'/
        // interrupted por CRASH não passa por aqui (o processo morreu) — quem o retoma
        // é recoverInterruptedJobs no boot.
        const [fc, spent] = await Promise.all([
          countFindings(engId).catch(() => undefined),
          sumUsageUsd(engId).catch(() => undefined),
        ])
        const jobStatus = ['completed', 'stopped', 'failed'].includes(runState) ? runState : 'stopped'
        await jobs.closeJob(job.id, {
          status: jobStatus, reason: stopReason, findingsCount: fc, spentUsd: spent,
          phasesReached: info?.phasesReached || [],
        }).catch((e) => console.warn('[scheduler] closeJob falhou:', e.message))
        console.log(`[scheduler] scan de ${eng.name} finalizado (job ${job.id}, ${jobStatus}/${stopReason || '-'}, código ${code})`)
      },
    }
  )
}

function nextRunFrom(date, frequency) {
  return new Date(date.getTime() + (FREQUENCY_MS[frequency] || FREQUENCY_MS.weekly))
}

async function tick() {
  try {
    const now = new Date()
    const due = await Engagement.find({ 'schedule.enabled': true }).lean()
    for (const eng of due) {
      const sch = eng.schedule || {}
      const next = sch.nextRunAt ? new Date(sch.nextRunAt) : null
      if (next && next > now) continue // ainda não venceu

      // Reagenda ANTES de enfileirar (evita re-disparo se o run demorar mais que o intervalo)
      await updateEngagement(eng._id, {
        schedule: { ...sch, nextRunAt: nextRunFrom(now, sch.frequency || 'weekly') },
      })
      await triggerRun(eng).catch((e) => console.error('[scheduler] erro ao enfileirar run:', e.message))
    }
  } catch (e) {
    console.error('[scheduler] erro no tick:', e.message)
  }
}

function start() {
  if (timer) return
  // Registra o dispatcher do kind 'scheduled' no worker (feito aqui p/ evitar ciclo de require).
  jobsWorker.registerDispatcher('scheduled', dispatchScheduledJob)
  timer = setInterval(tick, CHECK_INTERVAL_MS)
  console.log(`[scheduler] ativo (varre a cada ${CHECK_INTERVAL_MS / 60000} min)`)
  // primeiro tick logo após o boot
  setTimeout(() => tick(), 15000)
}

function stop() {
  if (timer) { clearInterval(timer); timer = null }
}

module.exports = { start, stop, triggerRun, dispatchScheduledJob, nextRunFrom }
