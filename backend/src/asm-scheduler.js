// Monitoramento contínuo do módulo ASM — SEMPRE ATIVO, sem toggle por domínio.
// Todo domínio cadastrado é re-escaneado numa cadência padrão. `lastScanAt` do
// Domain é a única fonte de verdade de "quando rodou por último" (o scanner o
// grava ao terminar) — não há bookkeeping de agendamento por domínio.
//
// Mirror simplificado do scheduler.js de engagements: sem fila de Jobs, porque
// scanner.runScan é uma função determinística fire-and-forget e o próprio Domain
// já rastreia estado (scanState) e se recupera no boot (recoverInterruptedScans).
const Domain = require('./models/Domain')
const scanner = require('./asm/scanner')

const CHECK_INTERVAL_MS = 5 * 60 * 1000 // varre a cada 5 min (igual scheduler.js)
const RESCAN_INTERVAL_MS = (Number(process.env.ASM_RESCAN_INTERVAL_DAYS) || 7) * 24 * 60 * 60 * 1000
// Cap por tick: evita disparar N scans de uma vez num boot com tudo vencido
// (ex.: lastScanAt null em todos). O tick roda a cada 5 min e drena aos poucos.
const MAX_PER_TICK = Number(process.env.ASM_RESCAN_MAX_PER_TICK) || 3

let timer = null

// Puro/testável: um domínio está "vencido" se nunca escaneou ou se já passou o
// intervalo desde o último scan.
function isDomainDue(domain, now, intervalMs) {
  const last = domain.lastScanAt ? new Date(domain.lastScanAt).getTime() : 0
  if (!last) return true
  return (now.getTime() - last) >= intervalMs
}

async function tick() {
  try {
    const now = new Date()
    const all = await Domain.find({}).select('_id domain lastScanAt scanState').lean()
    const due = all.filter((d) => d.scanState !== 'scanning' && isDomainDue(d, now, RESCAN_INTERVAL_MS))
    for (const dom of due.slice(0, MAX_PER_TICK)) {
      scanner.runScan(dom._id, { userName: 'Monitoramento ASM', trigger: 'monitor' })
        .catch((e) => console.error(`[asm-scheduler] scan de ${dom.domain} falhou:`, e?.message))
    }
    if (due.length > MAX_PER_TICK) {
      console.log(`[asm-scheduler] ${due.length} domínios vencidos; ${MAX_PER_TICK} disparados neste ciclo, resto no próximo`)
    }
  } catch (e) {
    console.error('[asm-scheduler] erro no tick:', e.message)
  }
}

function start() {
  if (timer) return
  timer = setInterval(tick, CHECK_INTERVAL_MS)
  console.log(`[asm-scheduler] monitoramento contínuo ativo (re-scan a cada ${RESCAN_INTERVAL_MS / 86400000}d, varre a cada ${CHECK_INTERVAL_MS / 60000}min)`)
  setTimeout(() => tick(), 30000) // primeiro tick logo após o boot
}

function stop() {
  if (timer) { clearInterval(timer); timer = null }
}

module.exports = { start, stop, tick, isDomainDue }
