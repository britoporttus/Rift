// Ingestão do relatório do agente de rede interna. Espelha o par
// leaks/hudsonrock.js (normalize puro) + asm/scanner.js (upsert idempotente +
// recompute). O agente (internal/agent-template.py) roda nmap dentro da rede e
// faz POST /api/internal-networks/ingest com este shape.
const { classifyDevice } = require('./classify')
const { analyzeHost, computeNetworkScore } = require('./analyze')
const { computeHostDiff } = require('./diff')
const { ipInAnyCidr, isNetworkOrBroadcast, isNonHostIp } = require('./cidr')

const MAX_HOSTS = 5000
const MAX_PORTS_PER_HOST = 200
const MAX_CIDRS = 64
const MAX_WARNINGS = 10

function str(v, max = 200) {
  if (v == null) return null
  const s = String(v).trim()
  return s ? s.slice(0, max) : null
}

// Puro: valida/normaliza o JSON cru do agente → { agent, hosts }. Nunca lança —
// entrada malformada degrada pra vazio (um host ruim não derruba o import).
function normalizeAgentReport(raw = {}) {
  const agent = {
    hostname:   str(raw?.agent?.hostname, 120),
    os:         str(raw?.agent?.os, 120),
    version:    str(raw?.agent?.version, 40),
    privileged: raw?.agent?.privileged === true,
  }
  // CIDRs que ESTA coleta varreu — define o escopo em que hosts podem ser
  // marcados como sumidos. Agente antigo (v1) não manda: escopo vazio =
  // ninguém é marcado como sumido, que é o comportamento seguro.
  const scannedCidrs = (Array.isArray(raw?.scannedCidrs) ? raw.scannedCidrs : [])
    .map((c) => str(c, 45)).filter((c) => c && /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(c))
    .slice(0, MAX_CIDRS)
  // Avisos do coletor (rodou em WSL, sem root, ninguém respondeu...). Ficam
  // visíveis no painel: coleta degradada não pode passar por inventário bom.
  const warnings = (Array.isArray(raw?.warnings) ? raw.warnings : [])
    .map((w) => str(w, 300)).filter(Boolean).slice(0, MAX_WARNINGS)
  const inHosts = Array.isArray(raw?.hosts) ? raw.hosts.slice(0, MAX_HOSTS) : []
  const hosts = []
  for (const h of inHosts) {
    const ip = str(h?.ip, 45)
    if (!ip) continue // sem IP não dá pra fazer fingerprint útil
    // Descarta o que não é host real: multicast/link-local/global broadcast, o
    // endereço de rede/broadcast dos CIDRs varridos (a tabela ARP às vezes devolve
    // o .255 de uma /24), e o MAC de broadcast. Sem isto, esses "fantasmas" entram
    // no inventário como dispositivo e ainda inflam o host count e o score.
    if (isNonHostIp(ip) || isNetworkOrBroadcast(ip, scannedCidrs)) continue
    const mac = str(h?.mac, 32)
    if (mac && /^ff:ff:ff:ff:ff:ff$/i.test(mac)) continue
    const openPorts = (Array.isArray(h?.openPorts) ? h.openPorts : []).slice(0, MAX_PORTS_PER_HOST).map((p) => ({
      port:    Number(p?.port) || null,
      proto:   str(p?.proto, 8) || 'tcp',
      service: str(p?.service, 60),
      product: str(p?.product, 80),
      version: str(p?.version, 60),
    })).filter((p) => p.port)
    hosts.push({
      ip,
      mac,
      macVendor: str(h?.macVendor, 80),
      hostname:  str(h?.hostname, 120),
      os:        str(h?.os, 160),
      openPorts,
      protocols: (Array.isArray(h?.protocols) ? h.protocols : []).map((s) => str(s, 40)).filter(Boolean).slice(0, 20),
    })
  }
  return { agent, hosts, scannedCidrs, warnings }
}

// Upsert idempotente por fingerprint com retry no E11000 (igual asm/scanner.upsertAsset).
async function upsertHost(db, networkId, fp, fields) {
  const now = new Date()
  const set = { $set: { ...fields, networkId, fingerprint: fp, lastSeen: now }, $setOnInsert: { firstSeen: now } }
  try {
    await db.InternalHost.findOneAndUpdate({ fingerprint: fp }, set, { upsert: true, new: false })
  } catch (err) {
    if (err && err.code === 11000) {
      await db.InternalHost.findOneAndUpdate({ fingerprint: fp }, { $set: set.$set }).catch(() => {})
    }
  }
}

// Recomputa contadores + score a partir do estado persistido (idempotente).
// Score e contadores usam só hosts `online`: um dispositivo que saiu da rede não
// pode continuar somando risco pra sempre.
async function recomputeNetwork(db, networkId) {
  const all = await db.InternalHost.find({ networkId }).lean()
  const online = all.filter((h) => h.status !== 'gone')
  const { score, level, reasons } = computeNetworkScore({ hosts: online })
  const deviceTypeCounts = {}
  for (const h of online) deviceTypeCounts[h.deviceType || 'unknown'] = (deviceTypeCounts[h.deviceType || 'unknown'] || 0) + 1
  await db.InternalNetwork.findByIdAndUpdate(networkId, { $set: {
    hostCount: all.length,
    aliveCount: online.length,
    riskyCount: online.filter((h) => h.severity && h.severity !== 'info').length,
    deviceTypeCounts,
    riskScore: score, riskLevel: level, riskReasons: reasons,
  } })
  return { score, level, hostCount: all.length, aliveCount: online.length }
}

// Persiste um import completo: upsert dos hosts (classificados + analisados),
// recompute, diff vs. a coleta anterior, histórico. `meta` = { trigger, userName }.
async function ingestReport(db, networkId, report, meta = {}) {
  const net = await db.InternalNetwork.findById(networkId)
  if (!net) throw new Error('network not found')

  const { agent, hosts, scannedCidrs, warnings } = normalizeAgentReport(report)
  const previousScore = net.riskScore || 0
  const previousHosts = await db.InternalHost.find({ networkId }).select('ip mac deviceType fingerprint status').lean()
  const previousOnline = previousHosts.filter((h) => h.status !== 'gone')
  const now = new Date()

  const scannedFps = []
  for (const h of hosts) {
    const fp = `${networkId}:${h.mac || h.ip}`
    scannedFps.push(fp)
    const { deviceType } = classifyDevice(h)
    const withType = { ...h, deviceType }
    const { severity, labels } = analyzeHost(withType)
    await upsertHost(db, networkId, fp, { ...withType, severity, labels, source: 'agent', status: 'online', goneSince: null })
  }
  const scannedSet = new Set(scannedFps)

  // Sem `scannedCidrs` (agente v1) não dá pra saber o que foi varrido — então
  // nada é marcado como sumido. Errar pro lado de "não apagar" é o correto num
  // inventário: vários agentes, um por sub-rede, reportam para a mesma rede.
  const hasScope = scannedCidrs.length > 0
  if (hasScope) {
    const goneIds = previousOnline
      .filter((h) => !scannedSet.has(h.fingerprint) && ipInAnyCidr(h.ip, scannedCidrs))
      .map((h) => h._id)
    if (goneIds.length) {
      await db.InternalHost.updateMany({ _id: { $in: goneIds } }, { $set: { status: 'gone', goneSince: now } })
    }
  }

  const { score, level, hostCount, aliveCount } = await recomputeNetwork(db, networkId)
  // Diff = o que esta coleta viu vs. o que estava online no mesmo escopo antes.
  // A v1 comparava o banco contra o próprio banco, então missingCount era
  // estruturalmente sempre 0 e nenhum host jamais era detectado como sumido.
  const scannedNow = await db.InternalHost.find({ fingerprint: { $in: scannedFps } })
    .select('ip mac deviceType fingerprint severity').lean()
  let diff
  if (hasScope) {
    const scopedPrev = previousOnline.filter((h) => ipInAnyCidr(h.ip, scannedCidrs))
    diff = computeHostDiff({ previousHosts: scopedPrev, currentHosts: scannedNow })
  } else {
    const prevFps = new Set(previousOnline.map((h) => h.fingerprint))
    const fresh = scannedNow.filter((h) => !prevFps.has(h.fingerprint))
    diff = { ...computeHostDiff({ previousHosts: [], currentHosts: fresh }), missingCount: 0, missingHosts: [] }
  }
  const scoreDelta = score - previousScore
  const trigger = meta.trigger === 'watch' ? 'watch' : 'agent'

  await db.InternalNetwork.findByIdAndUpdate(networkId, { $set: {
    lastImportAt: now,
    lastImportBy: meta.userName || agent.hostname || 'agente',
    agent,
    lastScannedCidrs: scannedCidrs,
    lastWarnings: warnings,
    lastDiff: { ...diff, computedAt: now, scoreDelta },
  } })

  // O registro histórico é da COLETA (o que este agente viu agora); os contadores
  // da rede são do inventário inteiro, que pode ter outras sub-redes.
  const riskyCount = scannedNow.filter((h) => h.severity && h.severity !== 'info').length
  await db.InternalScan.create({
    networkId, ranAt: now, trigger, agentHost: agent.hostname,
    hostCount: scannedNow.length, aliveCount: scannedNow.length, riskyCount,
    riskScore: score, riskLevel: level,
    newCount: diff.newCount, missingCount: diff.missingCount, scoreDelta,
  }).catch((e) => console.warn('[internal] falha ao gravar histórico:', e?.message))

  return {
    hostCount, aliveCount, scannedCount: scannedNow.length,
    riskScore: score, riskLevel: level,
    newCount: diff.newCount, missingCount: diff.missingCount,
    warnings,
  }
}

module.exports = { normalizeAgentReport, ingestReport, upsertHost, recomputeNetwork }
