// Scanner ASM PASSIVO — orquestra binários do ProjectDiscovery direto (sem LLM,
// sem token), determinístico e barato: é o certo para scan de rotina.
//
// Modelo de autorização (insight do conselho gravado em código):
//   • SEMPRE (verdadeiramente passivo, zero pacote à infra do alvo):
//       subfinder (fontes DNS públicas) + resolução DNS via resolver + leak APIs*.
//   • SÓ com domain.authorized === true (envia pacotes ao alvo):
//       httpx (probe web) e nuclei (exposições).
//   *providers reais de leak também exigem authorized (ver leak-providers/index).
const os = require('os')
const path = require('path')
const fs = require('fs')
const dns = require('dns').promises

const Domain = require('../models/Domain')
const DomainAsset = require('../models/DomainAsset')
const DomainScan = require('../models/DomainScan')
const LeakedCredential = require('../models/LeakedCredential')
const { runTool, hasBin } = require('./binaries')
const { computeScore } = require('./score')
const { computeAssetDiff } = require('./diff')
const { isBlockedIp } = require('../net-guard')

const MAX_PROBE_HOSTS = Number(process.env.ASM_MAX_HOSTS) || 400
// Default-ON: nuclei (exposições + CVEs) roda por padrão nos domínios
// autorizados. `ASM_NUCLEI=0` desliga. Autorização continua obrigatória — o
// chamador só invoca stageNuclei dentro do bloco `if (authorized && ...)`.
const NUCLEI_ENABLED = process.env.ASM_NUCLEI !== '0'

// Extrai o identificador de CVE de um resultado do nuclei. A classificação vem
// como `cve-id` (com hífen, via -jsonl) ou `cve_id`, string OU array; alguns
// templates não têm classificação mas o próprio id já é a CVE.
function extractCveId(info, templateId) {
  const cls = (info && info.classification) || {}
  let cve = cls['cve-id'] || cls['cve_id'] || null
  if (Array.isArray(cve)) cve = cve[0] || null
  if (typeof cve === 'string' && /^CVE-/i.test(cve)) return cve.toUpperCase()
  if (typeof templateId === 'string' && /^CVE-\d{4}-\d+$/i.test(templateId)) return templateId.toUpperCase()
  return null
}

// ── helpers ───────────────────────────────────────────────────────────────
function get(obj, ...keys) { for (const k of keys) if (obj && obj[k] != null) return obj[k]; return null }

async function mapPool(items, size, fn) {
  const out = []
  let i = 0
  const n = Math.min(size, items.length) || 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx) }
  }))
  return out
}

async function setStep(domainId, step) {
  await Domain.findByIdAndUpdate(domainId, { $set: { scanStep: step } }).catch(() => {})
}

// P1-17: com fingerprint agora `unique`, duas escritas concorrentes pro MESMO
// fingerprint (scans sobrepostos) podem fazer o upsert perder a corrida —
// MongoDB garante que só um insert vence e o outro recebe E11000. Antes disso
// era silenciosamente engolido (perdendo a atualização); agora faz 1 retry
// como update puro (o doc já existe, criado pela escrita concorrente).
async function upsertAsset(domainId, fp, fields) {
  const now = new Date()
  const set = { $set: { ...fields, domainId, fingerprint: fp, lastSeen: now }, $setOnInsert: { firstSeen: now } }
  try {
    await DomainAsset.findOneAndUpdate({ fingerprint: fp }, set, { upsert: true, new: false })
  } catch (err) {
    if (err && err.code === 11000) {
      await DomainAsset.findOneAndUpdate({ fingerprint: fp }, { $set: set.$set }).catch(() => {})
    }
    // outros erros: mesmo comportamento de antes (não derruba o scan por um asset).
  }
}

// ── etapas ──────────────────────────────────────────────────────────────────
async function stageSubdomains(domain) {
  if (!hasBin('subfinder')) return [domain]   // degrade: ao menos o apex
  const r = await runTool('subfinder', ['-d', domain, '-silent', '-all'], { timeoutMs: 120000 })
  const subs = (r.stdout || '').split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const set = new Set(subs); set.add(domain)
  return [...set]
}

// Anti-SSRF: verdadeiro só se NENHUM IP resolvido cair em loopback/RFC1918/
// link-local/metadata de nuvem. Extraído p/ ser testável sem DNS/DB. Falha
// para o lado seguro — não é proteção contra DNS rebinding em tempo de probe
// (httpx resolve de novo por conta própria); isso exige egress-filtering de
// rede, fora do alcance deste código.
function isProbeSafe(ips) {
  return !ips.some((ip) => isBlockedIp(ip))
}

async function stageDns(domainId, hosts) {
  return mapPool(hosts, 24, async (host) => {
    let ips = [], cname = null
    try { ips = await dns.resolve4(host) } catch {}
    if (!ips.length) { try { const a = await dns.resolve('' + host); ips = Array.isArray(a) ? a : [] } catch {} }
    try { const c = await dns.resolveCname(host); if (c && c.length) cname = c[0] } catch {}
    const safe = isProbeSafe(ips)
    if (!safe) console.warn(`[asm] host bloqueado p/ probe ativo (IP privado/loopback/metadata): ${host}`)
    const resolves = (ips.length > 0 || !!cname) && safe
    await upsertAsset(domainId, `${domainId}:host:${host}`, {
      type: 'subdomain', value: host, ips, cname, source: 'subfinder+dns',
    })
    return { host, ips, cname, resolves }
  })
}

const ADMIN_RE = /(login|admin|dashboard|phpmyadmin|jenkins|grafana|kibana|adminer|webmail|portal|vpn)/i

async function stageHttp(domainId, hosts) {
  if (!hasBin('httpx')) return { probed: 0, alive: 0 }
  const input = hosts.slice(0, MAX_PROBE_HOSTS).join('\n')
  const r = await runTool('httpx', [
    '-json', '-silent', '-no-color', '-title', '-tech-detect', '-status-code',
    '-web-server', '-tls-grab', '-timeout', '8', '-retries', '1', '-rate-limit', '150',
  ], { timeoutMs: 240000, input })

  let alive = 0
  for (const line of (r.stdout || '').split('\n')) {
    const s = line.trim()
    if (!s || s[0] !== '{') continue
    let j; try { j = JSON.parse(s) } catch { continue }
    const host = get(j, 'input', 'host') || ''
    const cleanHost = String(host).replace(/^https?:\/\//, '').split(/[/:]/)[0].toLowerCase()
    if (!cleanHost) continue
    const status = get(j, 'status_code', 'status-code')
    const title = get(j, 'title')
    const tech = get(j, 'tech', 'technologies') || []
    const tls = get(j, 'tls') || {}
    const isAdmin = ADMIN_RE.test(`${title || ''} ${get(j, 'url') || ''}`)
    alive++
    await upsertAsset(domainId, `${domainId}:host:${cleanHost}`, {
      type: 'web', value: cleanHost, alive: true,
      statusCode: typeof status === 'number' ? status : null,
      title: title || null,
      webServer: get(j, 'webserver', 'web_server') || null,
      tech: Array.isArray(tech) ? tech : [],
      scheme: get(j, 'scheme') || null,
      tlsIssuer: get(tls, 'issuer_cn', 'issuer_org', 'issuer_dn'),
      tlsExpiry: get(tls, 'not_after', 'notafter'),
      severity: isAdmin ? 'low' : 'info',
      label: isAdmin ? 'Painel administrativo/login exposto' : null,
      source: 'httpx',
    })
  }
  return { probed: Math.min(hosts.length, MAX_PROBE_HOSTS), alive }
}

async function stageNuclei(domainId, aliveHosts) {
  if (!NUCLEI_ENABLED || !hasBin('nuclei') || !aliveHosts.length) return 0
  const tmp = path.join(os.tmpdir(), `rift-asm-${domainId}.txt`)
  try { fs.writeFileSync(tmp, aliveHosts.join('\n'), 'utf8') } catch { return 0 }
  const r = await runTool('nuclei', [
    '-l', tmp, '-jsonl', '-silent', '-no-color',
    // Inclui CVEs conhecidas (nuclei auto-filtra por tech-match do httpx). Severidade
    // ≥ medium pra limitar volume/ruído do set enorme de CVE; low ficou de fora.
    '-tags', 'cve,exposure,misconfig,config',
    '-severity', 'medium,high,critical',
    '-rate-limit', '50', '-timeout', '8',
  ], { timeoutMs: 480000 })
  try { fs.unlinkSync(tmp) } catch {}

  let n = 0
  for (const line of (r.stdout || '').split('\n')) {
    const s = line.trim(); if (!s || s[0] !== '{') continue
    let j; try { j = JSON.parse(s) } catch { continue }
    const info = j.info || {}
    const matched = get(j, 'matched-at', 'matched_at', 'host') || ''
    const tid = get(j, 'template-id', 'templateID') || 'exposure'
    const cveId = extractCveId(info, tid)
    n++
    await upsertAsset(domainId, `${domainId}:exp:${tid}:${matched}`, {
      type: 'exposure', value: matched, alive: true,
      severity: ['critical', 'high', 'medium', 'low'].includes(info.severity) ? info.severity : 'info',
      label: info.name || tid, cveId, source: 'nuclei',
    })
  }
  return n
}

// ── entrada principal ─────────────────────────────────────────────────────────
// Fire-and-forget: a API chama sem await; o estado vive no Domain (polling no front).
async function runScan(domainId, { userName, trigger = 'manual' } = {}) {
  const dom = await Domain.findById(domainId)
  if (!dom) return
  const domain = dom.domain
  const authorized = !!dom.authorized

  // Snapshot ANTES de tocar em qualquer coisa — baseline do diff de superfície
  // (ver asm/diff.js). `scopedTypes` decide quais tipos este scan de fato vai
  // re-verificar (espelha exatamente o gating de stageHttp/stageNuclei abaixo).
  const previousScore = dom.riskScore || 0
  const previousAssets = await DomainAsset.find({ domainId }).select('type value fingerprint severity').lean()
  const scopedTypes = ['subdomain']
  if (authorized) scopedTypes.push('web')
  if (authorized && NUCLEI_ENABLED) scopedTypes.push('exposure')

  await Domain.findByIdAndUpdate(domainId, { $set: {
    scanState: 'scanning', scanStep: 'subdomains', scanError: null,
    scanStartedAt: new Date(), lastScanBy: userName || null,
  } })

  try {
    // 1) subdomínios (passivo)
    const hosts = await stageSubdomains(domain)

    // 2) DNS (passivo)
    await setStep(domainId, 'dns')
    const resolved = await stageDns(domainId, hosts)
    const liveHosts = resolved.filter((r) => r && r.resolves).map((r) => r.host)

    // 3) probe web (httpx) — só autorizado, e só hosts que resolveram para IP
    // não-bloqueado (anti-SSRF, ver stageDns). NUNCA cair para `hosts` cru: era
    // exatamente esse fallback que deixava um host sem DNS válido (ex.: um IP
    // literal cadastrado como "domínio") chegar ao probe ativo sem checagem.
    let httpRes = { probed: 0, alive: 0 }
    if (authorized) {
      await setStep(domainId, 'http')
      httpRes = await stageHttp(domainId, liveHosts)
    }

    // 3b) nuclei (opcional, autorizado + env)
    if (authorized && NUCLEI_ENABLED) {
      await setStep(domainId, 'exposures')
      const aliveAssets = await DomainAsset.find({ domainId, type: 'web', alive: true }).select('value').lean()
      await stageNuclei(domainId, aliveAssets.map((a) => a.value))
    }

    // 4) score + contadores (o sinal de vazamento vem do módulo Vazamentos, por
    //    string de domínio — não rodamos leak aqui; ASM = superfície).
    await setStep(domainId, 'scoring')
    const { score, level } = await recomputeDomain(domainId)

    // 5) diff de superfície vs. o scan anterior (novo/sumido + Δscore).
    const currentAssets = await DomainAsset.find({ domainId }).select('type value fingerprint severity cveId alive').lean()
    const diff = computeAssetDiff({ previousAssets, currentAssets, scopedTypes })
    const now = new Date()
    const scoreDelta = score - previousScore

    await Domain.findByIdAndUpdate(domainId, { $set: {
      scanState: 'done', scanStep: 'done', lastScanAt: now,
      lastDiff: { ...diff, computedAt: now, scoreDelta },
    } })

    // 6) histórico de monitoramento — 1 registro por execução, pra a linha do
    //    tempo mostrar que o monitoramento é contínuo (ver models/DomainScan).
    await DomainScan.create({
      domainId, ranAt: now, trigger, authorized,
      assetCount: currentAssets.length,
      aliveCount: currentAssets.filter((a) => a.alive).length,
      exposureCount: currentAssets.filter((a) => a.type === 'exposure').length,
      cveCount: currentAssets.filter((a) => a.cveId).length,
      riskScore: score, riskLevel: level,
      newCount: diff.newCount, missingCount: diff.missingCount, scoreDelta,
    }).catch((e) => console.warn('[asm] falha ao gravar histórico de scan:', e?.message))
  } catch (err) {
    await Domain.findByIdAndUpdate(domainId, { $set: {
      scanState: 'failed', scanStep: null, scanError: String(err?.message || err).slice(0, 300),
    } }).catch(() => {})
  }
}

// Recomputa contadores + score a partir do estado persistido (idempotente). O
// sinal de vazamento vem por STRING de domínio (módulo Vazamentos escreve por
// domain), então o score reflete buscas de exposição feitas para este domínio.
async function recomputeDomain(domainId) {
  const dom = await Domain.findById(domainId).lean()
  const [assets, leaks] = await Promise.all([
    DomainAsset.find({ domainId }).lean(),
    LeakedCredential.find({ domain: dom ? dom.domain : '__none__' }).lean(),
  ])
  const { score, level, reasons } = computeScore({ assets, leaks })
  await Domain.findByIdAndUpdate(domainId, { $set: {
    assetCount: assets.length,
    aliveCount: assets.filter((a) => a.alive).length,
    exposureCount: assets.filter((a) => a.type === 'exposure').length,
    leakCount: leaks.length,
    riskScore: score, riskLevel: level, riskReasons: reasons,
  } })
  return { score, level }
}

// No boot, scans interrompidos ficam presos em 'scanning' (processo in-process
// não sobrevive a restart) → reconcilia para 'failed'/interrupted.
async function recoverInterruptedScans() {
  try {
    const r = await Domain.updateMany(
      { scanState: 'scanning' },
      { $set: { scanState: 'failed', scanStep: null, scanError: 'interrompido (restart do backend)' } }
    )
    return r.modifiedCount || 0
  } catch { return 0 }
}

module.exports = { runScan, recomputeDomain, recoverInterruptedScans, isProbeSafe, upsertAsset, extractCveId }
