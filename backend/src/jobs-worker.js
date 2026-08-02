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
async function reapStaleJobs(db) {
  const stale = await jobs.findStaleRunningJobs(db, KINDS, STALE_MS).catch(() => [])
  for (const job of stale) {
    console.warn(`[jobs-worker] job ${job.id} sem heartbeat há mais de ${STALE_MS}ms — encerrando (stale)`)
    try { agentRunner.stop(job.sessionId) } catch {}
    await jobs.closeJob(db, job.id, { status: 'failed', reason: 'stale' }).catch((e) => console.warn('[jobs-worker] closeJob (stale) falhou:', e.message))
  }
  return stale.length
}

/**
 * Frente 0: a fila deixou de ser uma coleção só e passou a existir por tenant.
 *
 * Decisão de projeto — o teto de concorrência continua **GLOBAL**, não por
 * tenant. `MAX_CONCURRENT` existe porque a VPS tem CPU/RAM finitas e cada job
 * spawna um `claude` que roda nmap/nuclei/ffuf; se o teto virasse por-tenant,
 * N clientes × MAX derrubariam a máquina. O contador é compartilhado ao longo
 * de toda a varredura.
 *
 * Consequência honesta: a ordem de varredura dá vantagem ao primeiro tenant
 * quando há disputa por vaga. Aceitável enquanto os jobs são esparsos; se a
 * disputa virar real, o próximo passo é round-robin com cota mínima por tenant
 * (e não aumentar o teto).
 */
async function tick() {
  if (ticking) return          // um tick por vez (o dispatch é rápido, mas evita corrida)
  ticking = true
  try {
    const { forEachTenant } = require('./tenancy')
    let running = 0
    // 1ª passada: limpa travados e conta quanto já roda no total.
    await forEachTenant(async ({ db }) => {
      await reapStaleJobs(db)
      running += await jobs.countRunningJobs(db, KINDS)
    })

    // 2ª passada: preenche as vagas livres respeitando o teto global.
    await forEachTenant(async ({ tenant, db }) => {
      if (running >= MAX_CONCURRENT) return
      const busy = new Set(await jobs.runningEngagementIds(db, KINDS))

      // Cada job travado marca seu engagement como ocupado localmente → não pega
      // dois runs do mesmo alvo no mesmo tick.
      while (running < MAX_CONCURRENT) {
        const job = await jobs.claimNextQueuedJob(db, { kinds: KINDS, busyEngagementIds: [...busy] })
        if (!job) break

        running++
        busy.add(job.engagementId)

        const dispatch = dispatchers[job.kind]
        if (!dispatch) {
          // Sem dispatcher registrado (não deveria acontecer) → não deixa o job preso 'running'.
          await jobs.closeJob(db, job.id, { status: 'failed', reason: 'no-dispatcher' }).catch(() => {})
          running--
          continue
        }

        // dispatch() faz só o SETUP do run (spawn + callbacks) e resolve rápido; o ciclo de
        // vida (advanceStep/closeJob) roda depois via os callbacks do agent-runner. Se o
        // setup estourar, fecha o job como falha para não vazar uma vaga de concorrência.
        Promise.resolve()
          .then(() => dispatch(db, job))
          .catch(async (e) => {
            console.error(`[jobs-worker][${tenant.slug}] dispatch falhou (${job.id}):`, e.message)
            await jobs.closeJob(db, job.id, { status: 'failed', reason: 'dispatch-error' }).catch(() => {})
          })
      }
    })
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
