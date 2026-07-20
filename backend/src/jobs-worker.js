'use strict'
// Worker de Jobs — o processo "físico" que dá controle sobre o fluxo (padrão que o
// colega do AKDMI descreveu). A cada ~2s ele LÊ a tabela de Jobs, "trava" os que estão
// 'queued' (atomicamente, via jobs.claimNextQueuedJob) e os DESPACHA. É o ÚNICO ponto
// que dispara runs agendados/headless — quem quer rodar apenas ENFILEIRA (grava a
// intenção como 'queued'); o worker executa. Isso torna o fluxo durável e reconciliável:
// a intenção existe no banco antes de qualquer processo, então um crash nunca a perde.
//
// Não despacha runs 'interactive' (chat) — esses seguem com dispatch inline no server.js
// para não pagarem a latência do poll. O worker cuida da recuperação de crash deles
// (no boot, via jobs.recoverInterruptedJobs, chamado pelo server).
const jobs = require('./jobs')
const agentRunner = require('./agent-runner')

const INTERVAL_MS    = Number(process.env.JOBS_WORKER_INTERVAL_MS) || 2000
const MAX_CONCURRENT = Number(process.env.JOBS_MAX_CONCURRENT) || 2
const KINDS          = ['scheduled']
// P1-21 (auditoria 2026-07-20): heartbeatAt era gravado (no claim) e nunca mais
// lido — um job travado (processo vivo, mas sem progresso) nunca liberava a
// vaga de concorrência em runtime, só num restart do backend. Bem maior que o
// intervalo de heartbeat (60s, scheduler.js) pra não derrubar um run só por
// atraso transitório.
const STALE_MS = Number(process.env.JOBS_STALE_MS) || 10 * 60 * 1000

// kind -> async fn(job): quem sabe reconstruir e rodar um job daquele tipo. O scheduler
// registra o dispatcher 'scheduled' no start (evita dependência circular).
const dispatchers = {}
let timer = null
let ticking = false

function registerDispatcher(kind, fn) { dispatchers[kind] = fn }

// P1-21: mata a árvore de processo (se ainda existir) e fecha o job travado
// como 'failed'/stale — libera a vaga de concorrência sem esperar um restart.
async function reapStaleJobs() {
  const stale = await jobs.findStaleRunningJobs(KINDS, STALE_MS).catch(() => [])
  for (const job of stale) {
    console.warn(`[jobs-worker] job ${job.id} sem heartbeat há mais de ${STALE_MS}ms — encerrando (stale)`)
    try { agentRunner.stop(job.sessionId) } catch {}
    await jobs.closeJob(job.id, { status: 'failed', reason: 'stale' }).catch((e) => console.warn('[jobs-worker] closeJob (stale) falhou:', e.message))
  }
  return stale.length
}

async function tick() {
  if (ticking) return          // um tick por vez (o dispatch é rápido, mas evita corrida)
  ticking = true
  try {
    await reapStaleJobs()
    let running = await jobs.countRunningJobs(KINDS)
    const busy = new Set(await jobs.runningEngagementIds(KINDS))

    // Preenche as vagas livres, um claim atômico por vez. Cada job travado marca seu
    // engagement como ocupado localmente → não pega dois runs do mesmo alvo no mesmo tick.
    while (running < MAX_CONCURRENT) {
      const job = await jobs.claimNextQueuedJob({ kinds: KINDS, busyEngagementIds: [...busy] })
      if (!job) break

      running++
      busy.add(job.engagementId)

      const dispatch = dispatchers[job.kind]
      if (!dispatch) {
        // Sem dispatcher registrado (não deveria acontecer) → não deixa o job preso 'running'.
        await jobs.closeJob(job.id, { status: 'failed', reason: 'no-dispatcher' }).catch(() => {})
        running--
        continue
      }

      // dispatch() faz só o SETUP do run (spawn + callbacks) e resolve rápido; o ciclo de
      // vida (advanceStep/closeJob) roda depois via os callbacks do agent-runner. Se o
      // setup estourar, fecha o job como falha para não vazar uma vaga de concorrência.
      Promise.resolve()
        .then(() => dispatch(job))
        .catch(async (e) => {
          console.error(`[jobs-worker] dispatch falhou (${job.id}):`, e.message)
          await jobs.closeJob(job.id, { status: 'failed', reason: 'dispatch-error' }).catch(() => {})
        })
    }
  } catch (e) {
    console.error('[jobs-worker] erro no tick:', e.message)
  } finally {
    ticking = false
  }
}

function start() {
  if (timer) return
  timer = setInterval(tick, INTERVAL_MS)
  if (timer.unref) timer.unref()
  console.log(`[jobs-worker] ativo (poll ${INTERVAL_MS}ms, máx ${MAX_CONCURRENT} concorrentes, kinds=${KINDS.join(',')})`)
  setTimeout(() => tick(), 3000)   // primeiro tick logo após o boot (após a recuperação)
}

function stop() { if (timer) { clearInterval(timer); timer = null } }

module.exports = { start, stop, registerDispatcher, tick, KINDS, MAX_CONCURRENT, reapStaleJobs, STALE_MS }
