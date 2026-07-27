// Ingestão do relatório do agente de rede interna. Espelha o par
// leaks/hudsonrock.js (normalize puro) + asm/scanner.js (upsert idempotente +
// recompute). O agente (internal/agent-template.py) roda nmap dentro da rede e
// faz POST /api/internal-networks/ingest com este shape.
const InternalNetwork = require('../models/InternalNetwork')
const InternalHost = require('../models/InternalHost')
const InternalScan = require('../models/InternalScan')
const { classifyDevice } = require('./classify')
const { analyzeHost, computeNetworkScore } = require('./analyze')
const { computeHostDiff } = require('./diff')

const MAX_HOSTS = 5000
const MAX_PORTS_PER_HOST = 200

function str(v, max = 200) {
  if (v == null) return null
  const s = String(v).trim()
  return s ? s.slice(0, max) : null
}

// Puro: valida/normaliza o JSON cru do agente → { agent, hosts }. Nunca lança —
// entrada malformada degrada pra vazio (um host ruim não derruba o import).
function normalizeAgentReport(raw = {}) {
  const agent = {
    hostname: str(raw?.agent?.hostname, 120),
    os:       str(raw?.agent?.os, 120),
    version:  str(raw?.agent?.version, 40),
  }
  const inHosts = Array.isArray(raw?.hosts) ? raw.hosts.slice(0, MAX_HOSTS) : []
  const hosts = []
  for (const h of inHosts) {
    const ip = str(h?.ip, 45)
    if (!ip) continue // sem IP não dá pra fazer fingerprint útil
    const openPorts = (Array.isArray(h?.openPorts) ? h.openPorts : []).slice(0, MAX_PORTS_PER_HOST).map((p) => ({
      port:    Number(p?.port) || null,
      proto:   str(p?.proto, 8) || 'tcp',
      service: str(p?.service, 60),
      product: str(p?.product, 80),
      version: str(p?.version, 60),
    })).filter((p) => p.port)
    hosts.push({
      ip,
      mac:       str(h?.mac, 32),
      macVendor: str(h?.macVendor, 80),
      hostname:  str(h?.hostname, 120),
      os:        str(h?.os, 160),
      openPorts,
      protocols: (Array.isArray(h?.protocols) ? h.protocols : []).map((s) => str(s, 40)).filter(Boolean).slice(0, 20),
    })
  }
  return { agent, hosts }
}

// Upsert idempotente por fingerprint com retry no E11000 (igual asm/scanner.upsertAsset).
async function upsertHost(networkId, fp, fields) {
  const now = new Date()
  const set = { $set: { ...fields, networkId, fingerprint: fp, lastSeen: now }, $setOnInsert: { firstSeen: now } }
  try {
    await InternalHost.findOneAndUpdate({ fingerprint: fp }, set, { upsert: true, new: false })
  } catch (err) {
    if (err && err.code === 11000) {
      await InternalHost.findOneAndUpdate({ fingerprint: fp }, { $set: set.$set }).catch(() => {})
    }
  }
}

// Recomputa contadores + score a partir do estado persistido (idempotente).
async function recomputeNetwork(networkId) {
  const hosts = await InternalHost.find({ networkId }).lean()
  const { score, level, reasons } = computeNetworkScore({ hosts })
  const deviceTypeCounts = {}
  for (const h of hosts) deviceTypeCounts[h.deviceType || 'unknown'] = (deviceTypeCounts[h.deviceType || 'unknown'] || 0) + 1
  await InternalNetwork.findByIdAndUpdate(networkId, { $set: {
    hostCount: hosts.length,
    aliveCount: hosts.length,
    riskyCount: hosts.filter((h) => h.severity && h.severity !== 'info').length,
    deviceTypeCounts,
    riskScore: score, riskLevel: level, riskReasons: reasons,
  } })
  return { score, level }
}

// Persiste um import completo: upsert dos hosts (classificados + analisados),
// recompute, diff vs. a coleta anterior, histórico. `meta` = { trigger, userName }.
async function ingestReport(networkId, report, meta = {}) {
  const net = await InternalNetwork.findById(networkId)
  if (!net) throw new Error('network not found')

  const { agent, hosts } = normalizeAgentReport(report)
  const previousScore = net.riskScore || 0
  const previousHosts = await InternalHost.find({ networkId }).select('ip mac deviceType fingerprint').lean()

  for (const h of hosts) {
    const fp = `${networkId}:${h.mac || h.ip}`
    const { deviceType } = classifyDevice(h)
    const withType = { ...h, deviceType }
    const { severity, labels } = analyzeHost(withType)
    await upsertHost(networkId, fp, { ...withType, severity, labels, source: 'agent' })
  }

  const { score, level } = await recomputeNetwork(networkId)
  const now = new Date()
  const currentHosts = await InternalHost.find({ networkId }).select('ip mac deviceType fingerprint severity').lean()
  const diff = computeHostDiff({ previousHosts, currentHosts })
  const scoreDelta = score - previousScore
  const trigger = meta.trigger === 'watch' ? 'watch' : 'agent'

  await InternalNetwork.findByIdAndUpdate(networkId, { $set: {
    lastImportAt: now,
    lastImportBy: meta.userName || agent.hostname || 'agente',
    agent,
    lastDiff: { ...diff, computedAt: now, scoreDelta },
  } })

  const riskyCount = currentHosts.filter((h) => h.severity && h.severity !== 'info').length
  await InternalScan.create({
    networkId, ranAt: now, trigger, agentHost: agent.hostname,
    hostCount: currentHosts.length, aliveCount: currentHosts.length, riskyCount,
    riskScore: score, riskLevel: level,
    newCount: diff.newCount, missingCount: diff.missingCount, scoreDelta,
  }).catch((e) => console.warn('[internal] falha ao gravar histórico:', e?.message))

  return { hostCount: currentHosts.length, riskScore: score, riskLevel: level, newCount: diff.newCount, missingCount: diff.missingCount }
}

module.exports = { normalizeAgentReport, ingestReport, upsertHost, recomputeNetwork }
