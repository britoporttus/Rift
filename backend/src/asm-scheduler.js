// Monitoramento contínuo do módulo ASM — SEMPRE ATIVO, sem toggle por domínio.
// Todo domínio cadastrado é re-escaneado numa cadência padrão. `lastScanAt` do
// Domain é a única fonte de verdade de "quando rodou por último" (o scanner o
// grava ao terminar) — não há bookkeeping de agendamento por domínio.
//
// Mirror simplificado do scheduler.js de engagements: sem fila de Jobs, porque
// scanner.runScan é uma função determinística fire-and-forget e o próprio Domain
// já rastreia estado (scanState) e se recupera no boot (recoverInterruptedScans).
const scanner = require('./asm/scanner')
const { rescanIntervalMs } = require('./plans')

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

// Frente 0: o tick roda sem request, então varre TENANT A TENANT. O teto
// MAX_PER_TICK é aplicado POR TENANT de propósito — um tenant com 500 domínios
// vencidos não pode consumir a cota e deixar os outros sem monitoramento (era
// o comportamento natural de uma fila global única).
// Seleção e disparo dentro de UM tenant. Separado do fan-out de propósito: é
// aqui que mora a lógica de "quem está vencido", e é isto que os testes
// exercitam — sem precisar simular a iteração de tenants.
async function tickFor(db, label = '', tenant = null) {
  const now = new Date()
  // Cadência POR PLANO: free e pro são diários (o ASM roda binários
  // determinísticos e não gasta token de IA — o custo marginal é CPU, então
  // reduzir a cadência do free economizaria quase nada e mataria justamente o
  // que traz o cliente de volta). O tenant interno segue a env histórica.
  const intervalMs = tenant ? rescanIntervalMs(tenant) : RESCAN_INTERVAL_MS
  const all = await db.Domain.find({}).select('_id domain lastScanAt scanState verification').lean()
  const due = all.filter((d) =>
    d.scanState !== 'scanning'
    // Domínio não verificado nunca entra na fila automática: o scanner o
    // recusaria e cada tick só produziria um scan 'failed' a mais no histórico.
    && !scanner.scanBlockReason(d)
    && isDomainDue(d, now, intervalMs))
  for (const dom of due.slice(0, MAX_PER_TICK)) {
    scanner.runScan(db, dom._id, { userName: 'Monitoramento ASM', trigger: 'monitor' })
      .catch((e) => console.error(`[asm-scheduler]${label} scan de ${dom.domain} falhou:`, e?.message))
  }
  if (due.length > MAX_PER_TICK) {
    console.log(`[asm-scheduler]${label} ${due.length} domínios vencidos; ${MAX_PER_TICK} disparados neste ciclo, resto no próximo`)
  }
  return Math.min(due.length, MAX_PER_TICK)
}

async function tick() {
  const { forEachTenant } = require('./tenancy')
  await forEachTenant(({ tenant, db }) => tickFor(db, `[${tenant.slug}]`, tenant))
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

module.exports = {
  tickFor, start, stop, tick, isDomainDue }
