// Agendador de re-scans recorrentes do módulo ASM (Domínios) — "monitoramento
// contínuo da superfície externa". Mirror simplificado de scheduler.js: aqui
// NÃO há fila de Jobs nem agente — scanner.runScan é uma função determinística
// fire-and-forget, e o próprio Domain já rastreia estado (scanState) e se
// recupera de interrupções no boot (recoverInterruptedScans). Enfileirar isso
// como Job seria complexidade sem função — essa fila existe para rastrear
// processos `spawn('claude')` que podem morrer no meio, não é o caso aqui.
const Domain = require('./models/Domain')
const scanner = require('./asm/scanner')

const CHECK_INTERVAL_MS = 5 * 60 * 1000 // mesma cadência do scheduler.js
const FREQUENCY_MS = { daily: 24 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000 }

let timer = null

function nextRunFrom(date, frequency) {
  return new Date(date.getTime() + (FREQUENCY_MS[frequency] || FREQUENCY_MS.weekly))
}

async function runOne(dom) {
  try {
    await scanner.runScan(dom._id, { userName: 'Agendador ASM' })
    await Domain.findByIdAndUpdate(dom._id, { $set: {
      'schedule.lastRunAt': new Date(), 'schedule.lastRunStatus': 'completed',
    } }).catch(() => {})
  } catch (e) {
    await Domain.findByIdAndUpdate(dom._id, { $set: {
      'schedule.lastRunAt': new Date(), 'schedule.lastRunStatus': 'error',
    } }).catch(() => {})
    console.error(`[asm-scheduler] scan agendado falhou p/ ${dom.domain}:`, e?.message)
  }
}

async function tick() {
  try {
    const now = new Date()
    const due = await Domain.find({ 'schedule.enabled': true }).lean()
    for (const dom of due) {
      const sch = dom.schedule || {}
      const next = sch.nextRunAt ? new Date(sch.nextRunAt) : null
      if (next && next > now) continue // ainda não venceu

      // Reagenda ANTES de disparar (evita re-disparo se o scan demorar mais que
      // o intervalo de varredura) — mesmo padrão do scheduler.js de engagements.
      await Domain.findByIdAndUpdate(dom._id, { $set: {
        'schedule.nextRunAt': nextRunFrom(now, sch.frequency || 'weekly'),
      } })

      if (dom.scanState === 'scanning') {
        console.log(`[asm-scheduler] ${dom.domain} já está escaneando — pulado neste ciclo`)
        continue
      }
      runOne(dom).catch(() => {}) // fire-and-forget; erros já tratados em runOne
    }
  } catch (e) {
    console.error('[asm-scheduler] erro no tick:', e.message)
  }
}

function start() {
  if (timer) return
  timer = setInterval(tick, CHECK_INTERVAL_MS)
  console.log(`[asm-scheduler] ativo (varre a cada ${CHECK_INTERVAL_MS / 60000} min)`)
  setTimeout(() => tick(), 15000) // primeiro tick logo após o boot
}

function stop() {
  if (timer) { clearInterval(timer); timer = null }
}

module.exports = { start, stop, tick, nextRunFrom }
