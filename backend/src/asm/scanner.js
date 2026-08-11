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
const net = require('net')
const dns = require('dns').promises

const { runTool, hasBin } = require('./binaries')
const { computeScore } = require('./score')
const { computeAssetDiff } = require('./diff')
const { deriveMonitorEvents } = require('./monitor-events')
const { analyzePort } = require('./ports')
const { detectTakeover } = require('./takeover')
const { bruteforceSubdomains, isDnsInfraHost } = require('./dns-brute')
const { findChrome, storeScreenshot, makeWorkDir } = require('./screenshots')
const { lookupNetblocks, classifyProvider } = require('./asn')
const { isBlockedIp, expandCidrsV4, ipInCidr } = require('../net-guard')

const MAX_PROBE_HOSTS = Number(process.env.ASM_MAX_HOSTS) || 400
// Default-ON: nuclei (exposições + CVEs) roda por padrão nos domínios
// autorizados. `ASM_NUCLEI=0` desliga. Autorização continua obrigatória — o
// chamador só invoca stageNuclei dentro do bloco `if (authorized && ...)`.
const NUCLEI_ENABLED = process.env.ASM_NUCLEI !== '0'

// Port scan NATIVO (net.connect do Node) — default ON em domínio autorizado.
// Não usa naabu: naabu trava sob execFile sem TTY (enumeração de interface). Um
// connect scan em Node é robusto, sem binário externo, e dá controle total de
// concorrência/timeout. Lista curada = portas arriscadas (ports.js) + comuns.
// Fase 3: subdomain takeover. Passivo (heurística de CNAME pendente) roda sempre
// dentro do stageDns; a confirmação ATIVA (nuclei -tags takeover) só em domínio
// autorizado. `ASM_TAKEOVER=0` desliga a passada ativa.
const TAKEOVER_ENABLED = process.env.ASM_TAKEOVER !== '0'
// Módulo Vazamentos está "em construção" (reforma de UX 2026-07): por padrão o
// sinal de vazamento NÃO entra no score do domínio. `RIFT_LEAKS_ENABLED=1` religa.
// Neutraliza no call-site (não passa `leaks`) — computeScore segue puro/testável.
const LEAKS_ENABLED = process.env.RIFT_LEAKS_ENABLED === '1'
// Fase 5: bruteforce DNS nativo (passivo) na enumeração de subdomínios. Descobre
// nomes previsíveis (vpn, gitlab, jenkins…) que as fontes passivas do subfinder
// não listam. `ASM_DNS_BRUTE=0` desliga. Guard de wildcard embutido (dns-brute.js).
const DNS_BRUTE_ENABLED = process.env.ASM_DNS_BRUTE !== '0'
// Fase 4: recon visual (screenshots) via httpx -ss + Chrome do sistema. ATIVO
// (renderiza a página = envia requests) → só domínio autorizado. Pesado (Chrome
// por host) → teto de hosts e não-fatal. `ASM_SCREENSHOT=0` desliga.
const SCREENSHOT_ENABLED = process.env.ASM_SCREENSHOT !== '0'
const SCREENSHOT_MAX = Number(process.env.ASM_SCREENSHOT_MAX) || 40
const CHROME_BIN = findChrome()
const PORTSCAN_ENABLED = process.env.ASM_PORTSCAN !== '0'
const SCAN_PORTS = (process.env.ASM_PORTS ||
  '21,22,23,25,53,69,80,110,111,135,139,143,161,389,443,445,465,512,513,514,587,636,873,993,995,' +
  '1433,1521,2049,3306,3389,5432,5900,5901,5902,5985,5986,6379,8080,8443,9200,11211,27017')
  .split(',').map((s) => Number(s.trim())).filter((n) => n > 0 && n < 65536)
const SCAN_CONCURRENCY = Number(process.env.ASM_SCAN_CONCURRENCY) || 256
const SCAN_TIMEOUT_MS = Number(process.env.ASM_SCAN_TIMEOUT_MS) || 2000
// Expansão de netblock (Fase 2): a partir do IP do alvo, escaneia o prefixo que o
// contém (ex.: /24). Default ON em domínio autorizado; `ASM_ASN=0` desliga. Só
// expande prefixo de tamanho contido (guarda anti-cloud em asn.js) e corta o total.
const ASN_ENABLED = process.env.ASM_ASN !== '0'
const ASN_MAX_IPS = Number(process.env.ASM_ASN_MAX_IPS) || 256        // teto de IPs vizinhos escaneados (~/24)
const ASN_MAX_PREFIX_IPS = Number(process.env.ASM_ASN_MAX_PREFIX_IPS) || 1024  // /22; maior = cloud → pula

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

async function setStep(db, domainId, step) {
  await db.Domain.findByIdAndUpdate(domainId, { $set: { scanStep: step } }).catch(() => {})
}

// P1-17: com fingerprint agora `unique`, duas escritas concorrentes pro MESMO
// fingerprint (scans sobrepostos) podem fazer o upsert perder a corrida —
// MongoDB garante que só um insert vence e o outro recebe E11000. Antes disso
// era silenciosamente engolido (perdendo a atualização); agora faz 1 retry
// como update puro (o doc já existe, criado pela escrita concorrente).
async function upsertAsset(db, domainId, fp, fields) {
  const now = new Date()
  const set = { $set: { ...fields, domainId, fingerprint: fp, lastSeen: now }, $setOnInsert: { firstSeen: now } }
  try {
    await db.DomainAsset.findOneAndUpdate({ fingerprint: fp }, set, { upsert: true, new: false })
  } catch (err) {
    if (err && err.code === 11000) {
      await db.DomainAsset.findOneAndUpdate({ fingerprint: fp }, { $set: set.$set }).catch(() => {})
    }
    // outros erros: mesmo comportamento de antes (não derruba o scan por um asset).
  }
}

// ── etapas ──────────────────────────────────────────────────────────────────
async function stageSubdomains(domain) {
  const set = new Set([domain])   // degrade: ao menos o apex, mesmo sem subfinder
  if (hasBin('subfinder')) {
    const r = await runTool('subfinder', ['-d', domain, '-silent', '-all'], { timeoutMs: 120000 })
    for (const s of (r.stdout || '').split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean)) set.add(s)
  }
  // Fase 5: bruteforce DNS nativo (passivo — só DNS público, zero pacote ao alvo).
  // Guard de wildcard em dns-brute.js evita inflar com curinga. Não-fatal.
  if (DNS_BRUTE_ENABLED) {
    try {
      const { hosts, wildcard } = await bruteforceSubdomains(domain)
      if (wildcard) console.warn(`[asm] wildcard DNS em ${domain} — bruteforce filtrado pelo conjunto curinga`)
      for (const h of hosts) set.add(h)
    } catch (e) { console.warn('[asm] bruteforce DNS falhou:', e?.message) }
  }
  // Nameservers (ns1/dns/resolver) não são superfície de ataque — são infra de DNS.
  // Não os apresentamos como achado (feedback do operador). O apex nunca é filtrado.
  return [...set].filter((h) => h === domain || !isDnsInfraHost(h))
}

// Anti-SSRF: verdadeiro só se NENHUM IP resolvido cair em loopback/RFC1918/
// link-local/metadata de nuvem. Extraído p/ ser testável sem DNS/DB. Falha
// para o lado seguro — não é proteção contra DNS rebinding em tempo de probe
// (httpx resolve de novo por conta própria); isso exige egress-filtering de
// rede, fora do alcance deste código.
function isProbeSafe(ips) {
  return !ips.some((ip) => isBlockedIp(ip))
}

async function stageDns(db, domainId, hosts) {
  return mapPool(hosts, 24, async (host) => {
    let ips = [], cname = null, nxdomain = false
    // Distingue NXDOMAIN (nome não existe → sinal de CNAME pendente/takeover) de
    // falha transitória: só ENOTFOUND/NXDOMAIN conta como "não resolve de verdade".
    try { ips = await dns.resolve4(host) }
    catch (e) { if (e && (e.code === 'ENOTFOUND' || e.code === 'NXDOMAIN')) nxdomain = true }
    if (!ips.length) { try { const a = await dns.resolve('' + host); ips = Array.isArray(a) ? a : [] } catch {} }
    try { const c = await dns.resolveCname(host); if (c && c.length) cname = c[0] } catch {}
    const safe = isProbeSafe(ips)
    if (!safe) console.warn(`[asm] host bloqueado p/ probe ativo (IP privado/loopback/metadata): ${host}`)
    const resolves = (ips.length > 0 || !!cname) && safe
    await upsertAsset(db, domainId, `${domainId}:host:${host}`, {
      type: 'subdomain', value: host, ips, cname, source: 'subfinder+dns',
    })
    // Fase 3 (passivo): CNAME pendente → candidato a subdomain takeover. Puramente
    // derivado do que o DNS já devolveu (zero pacote ao alvo) → roda mesmo sem
    // autorização. A confirmação por corpo HTTP fica pro nuclei (stageTakeover).
    const tk = detectTakeover({ host, cname, ips, nxdomain })
    if (tk) {
      await upsertAsset(db, domainId, `${domainId}:takeover:${host}`, {
        type: 'exposure', value: host, severity: tk.severity,
        label: tk.label, cname: tk.cname, source: 'dns-takeover',
      })
    }
    return { host, ips, cname, resolves, nxdomain }
  })
}

const ADMIN_RE = /(login|admin|dashboard|phpmyadmin|jenkins|grafana|kibana|adminer|webmail|portal|vpn)/i

async function stageHttp(db, domainId, hosts) {
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
    // ENRIQUECE o subdomínio no lugar — NÃO cria um asset `web` separado.
    // Antes o fingerprint `${id}:host:X` era reusado com type:'web', que
    // sobrescrevia o subdomínio gravado pelo stageDns (mesma chave) e o fazia
    // sumir da aba Subdomínios. Um host = 1 asset; `alive:true` aqui significa
    // "responde HTTP". (Fase 2 do roadmap de legibilidade, Bug 1.)
    await upsertAsset(db, domainId, `${domainId}:host:${cleanHost}`, {
      type: 'subdomain', value: cleanHost, alive: true,
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

async function stageNuclei(db, domainId, aliveHosts) {
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
    await upsertAsset(db, domainId, `${domainId}:exp:${tid}:${matched}`, {
      type: 'exposure', value: matched, alive: true,
      severity: ['critical', 'high', 'medium', 'low'].includes(info.severity) ? info.severity : 'info',
      label: info.name || tid, cveId, source: 'nuclei',
    })
  }
  return n
}

// Fase 3 (ativo): confirma subdomain takeover com os templates de takeover do
// nuclei — casam a impressão digital do CORPO HTTP do serviço órfão ("There
// isn't a GitHub Pages site here" etc.). Só em domínio autorizado (envia pacote).
// Roda sobre TODOS os hosts que resolvem (não só os httpx-alive): um host
// sequestrável pode responder algo que o httpx não marcou como "vivo".
async function stageTakeover(db, domainId, hosts) {
  if (!TAKEOVER_ENABLED || !hasBin('nuclei') || !hosts.length) return 0
  const tmp = path.join(os.tmpdir(), `rift-asm-tko-${domainId}.txt`)
  try { fs.writeFileSync(tmp, hosts.join('\n'), 'utf8') } catch { return 0 }
  const r = await runTool('nuclei', [
    '-l', tmp, '-jsonl', '-silent', '-no-color',
    '-tags', 'takeover',
    '-rate-limit', '50', '-timeout', '8',
  ], { timeoutMs: 300000 })
  try { fs.unlinkSync(tmp) } catch {}

  let n = 0
  for (const line of (r.stdout || '').split('\n')) {
    const s = line.trim(); if (!s || s[0] !== '{') continue
    let j; try { j = JSON.parse(s) } catch { continue }
    const info = j.info || {}
    const matched = get(j, 'matched-at', 'matched_at', 'host') || ''
    const tid = get(j, 'template-id', 'templateID') || 'takeover'
    const host = String(matched).replace(/^https?:\/\//, '').split(/[/:]/)[0].toLowerCase()
    if (!host) continue
    n++
    // Confirmado é mais grave que o candidato passivo: no mínimo high.
    const sev = ['critical', 'high', 'medium'].includes(info.severity) ? info.severity : 'high'
    await upsertAsset(db, domainId, `${domainId}:takeover-ok:${host}:${tid}`, {
      type: 'exposure', value: host, alive: true, severity: sev,
      label: `Subdomain takeover confirmado — ${info.name || tid}`, source: 'nuclei-takeover',
    })
  }
  return n
}

// Fase 4 (ativo): captura screenshot de cada host vivo com o httpx (-ss) usando o
// Chrome do sistema. Renderiza a página → só domínio autorizado. Roda num dir
// temporário (httpx grava em ./output/screenshot); os PNGs são movidos pro storage
// permanente (screenshots.js) e o caminho relativo vai pro asset 'web'. Não-fatal:
// Chrome pode travar/faltar — o scan não pode cair por causa de uma foto.
async function stageScreenshots(db, domainId, aliveHosts) {
  if (!SCREENSHOT_ENABLED || !CHROME_BIN || !hasBin('httpx') || !aliveHosts.length) return 0
  const hosts = aliveHosts.slice(0, SCREENSHOT_MAX)
  let work
  try { work = makeWorkDir(domainId) } catch { return 0 }
  try {
    const r = await runTool('httpx', [
      '-silent', '-no-color', '-json',
      '-ss', '-system-chrome', '-esb',        // -esb: não embute bytes no JSON (lê o PNG do disco)
      '-no-screenshot-full-page',             // só o viewport — menor e mais estável
      '-screenshot-timeout', '15', '-timeout', '15', '-rate-limit', '20',
    ], { timeoutMs: 300000, input: hosts.join('\n'), cwd: work })

    let n = 0
    for (const line of (r.stdout || '').split('\n')) {
      const s = line.trim(); if (!s || s[0] !== '{') continue
      let j; try { j = JSON.parse(s) } catch { continue }
      const srcAbs = get(j, 'screenshot_path', 'screenshot-path')
      if (!srcAbs) continue
      const raw = get(j, 'input', 'host') || ''
      const host = String(raw).replace(/^https?:\/\//, '').split(/[/:]/)[0].toLowerCase()
      if (!host) continue
      const rel = storeScreenshot(domainId, host, srcAbs)
      if (!rel) continue
      await db.DomainAsset.updateOne({ domainId, type: 'subdomain', value: host }, { $set: { screenshotPath: rel } }).catch(() => {})
      n++
    }
    return n
  } catch (e) {
    console.warn('[asm] screenshots falharam:', e?.message)
    return 0
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }) } catch {}
  }
}

// Probe TCP connect de um par ip:porta. Resolve true se conectou (porta aberta),
// false em timeout/erro (fechada/filtrada). Nunca lança.
function probeTcp(ip, port, timeoutMs) {
  return new Promise((resolve) => {
    const sock = new net.Socket()
    let settled = false
    const done = (open) => { if (settled) return; settled = true; try { sock.destroy() } catch {} resolve(open) }
    sock.setTimeout(timeoutMs)
    sock.once('connect', () => done(true))
    sock.once('timeout', () => done(false))
    sock.once('error', () => done(false))
    try { sock.connect(port, ip) } catch { done(false) }
  })
}

// Port scan NATIVO. `ips` já devem estar net-guard-safe (o chamador filtra);
// refiltramos aqui por defesa em profundidade. `fromNeighbor` marca portas de
// vizinho de netblock (não host próprio). ATIVO → só rodar em domínio autorizado.
async function stagePortScan(db, domainId, ips, { fromNeighbor = false, providerFor } = {}) {
  if (!PORTSCAN_ENABLED || !ips.length || !SCAN_PORTS.length) return 0
  const targets = ips.filter((ip) => !isBlockedIp(ip))
  if (!targets.length) return 0

  // Todos os pares (ip, porta), varridos com um pool de concorrência fixo.
  const pairs = []
  for (const ip of targets) for (const port of SCAN_PORTS) pairs.push([ip, port])

  let n = 0
  let i = 0
  const worker = async () => {
    while (i < pairs.length) {
      const [ip, port] = pairs[i++]
      const open = await probeTcp(ip, port, SCAN_TIMEOUT_MS)
      if (!open) continue
      // IP de provedor SaaS/e-mail (Microsoft 365, MailChimp...) → é infra de
      // terceiro, não exposição do alvo: rotula e REBAIXA a severidade para info
      // (não é achado, não infla o score), mas continua no inventário como contexto.
      const prov = providerFor ? providerFor(ip) : null
      const thirdParty = !!(prov && prov.thirdParty)
      const base = analyzePort({ port })
      const severity = thirdParty ? 'info' : base.severity
      const label = thirdParty
        ? `${base.label ? base.label.replace(' exposto à internet', '') : `porta ${port}`} · ${prov.name} (SaaS de terceiro)`
        : (base.label || (fromNeighbor ? `Porta ${port} aberta (vizinho de netblock)` : `Porta ${port} aberta`))
      n++
      await upsertAsset(db, domainId, `${domainId}:port:${ip}:${port}`, {
        type: 'port', value: `${ip}:${port}`, ip, port, proto: 'tcp',
        alive: true, severity, label,
        fromNeighbor, thirdParty, provider: thirdParty ? prov.name : null, source: 'portscan',
      })
    }
  }
  await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, pairs.length) }, worker))
  return n
}

// ── entrada principal ─────────────────────────────────────────────────────────
// Fire-and-forget: a API chama sem await; o estado vive no Domain (polling no front).
/**
 * Prova de posse: um domínio só é escaneável depois de verificado.
 *
 * Decisão do operador (2026-08-03): bloqueia TUDO — nem a coleta passiva roda —
 * e ninguém dispensa, nem admin. O gate mora aqui, no scanner, e não só na
 * rota: assim o scheduler, um job ou uma rota futura não contornam por
 * esquecimento (mesmo raciocínio do gate de `authorized` no ingest de leaks).
 *
 * `legacy` = cadastrado antes da regra existir. NÃO conta como verificado; é
 * deixado passar para não parar a operação que já roda, mas aparece como
 * pendência na UI. Um dia é só rodar a verificação de verdade.
 */
function scanBlockReason(dom) {
  const status = dom?.verification?.status
  if (status === 'verified' || status === 'legacy') return null
  return `Domínio "${dom.domain}" não teve a posse verificada. `
    + 'Publique o registro TXT ou o arquivo em /.well-known/ e verifique antes de escanear.'
}

async function runScan(db, domainId, { userName, trigger = 'manual' } = {}) {
  const dom = await db.Domain.findById(domainId)
  if (!dom) return
  const blocked = scanBlockReason(dom)
  if (blocked) {
    await db.Domain.findByIdAndUpdate(domainId, { $set: { scanState: 'failed', scanStep: null, scanError: blocked } }).catch(() => {})
    const err = new Error(blocked)
    err.code = 'DOMAIN_NOT_VERIFIED'
    throw err
  }
  const domain = dom.domain
  const authorized = !!dom.authorized

  // Snapshot ANTES de tocar em qualquer coisa — baseline do diff de superfície
  // (ver asm/diff.js). `scopedTypes` decide quais tipos este scan de fato vai
  // re-verificar (espelha exatamente o gating de stageHttp/stageNuclei abaixo).
  const previousScore = dom.riskScore || 0
  const previousAssets = await db.DomainAsset.find({ domainId }).select('type value fingerprint severity').lean()
  // 'web' deixou de ser um tipo — o probe HTTP agora enriquece o próprio
  // subdomínio (sempre escopado). Ver stageHttp / Bug 1.
  const scopedTypes = ['subdomain']
  if (authorized && NUCLEI_ENABLED) scopedTypes.push('exposure')
  // 'port' fica FORA do diff de superfície de propósito: os IPs de mail (Microsoft
  // 365/MailChimp) rotacionam por round-robin, então portas entram/saem a cada
  // scan e poluiriam o "novo/sumido". A lista de portas é um retrato do estado
  // atual (re-derivada e limpa a cada scan), não um delta.

  await db.Domain.findByIdAndUpdate(domainId, { $set: {
    scanState: 'scanning', scanStep: 'subdomains', scanError: null,
    scanStartedAt: new Date(), lastScanBy: userName || null,
  } })

  try {
    // Limpa nameservers (ns1/dns/resolver) que scans ANTIGOS gravaram — assets de
    // subdomínio não são apagados em re-scan, então sem isto o ns1 antigo ficaria
    // pra sempre mesmo já tendo saído da enumeração (feedback do operador).
    await db.DomainAsset.deleteMany({
      domainId, type: { $in: ['subdomain', 'web', 'exposure', 'port'] },
      value: { $regex: '^(ns\\d*|dns\\d*|resolver)\\.', $options: 'i' },
    }).catch(() => {})

    // 1) subdomínios (passivo) — nameservers já saem filtrados aqui
    const hosts = await stageSubdomains(domain)

    // 2) DNS (passivo)
    await setStep(db, domainId, 'dns')
    const resolved = await stageDns(db, domainId, hosts)
    const liveHosts = resolved.filter((r) => r && r.resolves).map((r) => r.host)

    // 3) probe web (httpx) — só autorizado, e só hosts que resolveram para IP
    // não-bloqueado (anti-SSRF, ver stageDns). NUNCA cair para `hosts` cru: era
    // exatamente esse fallback que deixava um host sem DNS válido (ex.: um IP
    // literal cadastrado como "domínio") chegar ao probe ativo sem checagem.
    let httpRes = { probed: 0, alive: 0 }
    if (authorized) {
      await setStep(db, domainId, 'http')
      httpRes = await stageHttp(db, domainId, liveHosts)
    }

    // 3b) nuclei (opcional, autorizado + env)
    if (authorized && NUCLEI_ENABLED) {
      await setStep(db, domainId, 'exposures')
      const aliveAssets = await db.DomainAsset.find({ domainId, type: 'subdomain', alive: true }).select('value').lean()
      await stageNuclei(db, domainId, aliveAssets.map((a) => a.value))
    }

    // 3b-2) subdomain takeover confirmado (nuclei -tags takeover) — autorizado.
    // Sobre os hosts que resolvem (a heurística passiva de CNAME pendente já rodou
    // no stageDns, sem autorização). Ver Fase 3.
    if (authorized && TAKEOVER_ENABLED) {
      await setStep(db, domainId, 'takeover')
      await stageTakeover(db, domainId, liveHosts)
    }

    // 3b-3) recon visual (screenshots) dos hosts vivos — autorizado. Ver Fase 4.
    if (authorized && SCREENSHOT_ENABLED && CHROME_BIN) {
      await setStep(db, domainId, 'screenshots')
      const aliveWeb = await db.DomainAsset.find({ domainId, type: 'subdomain', alive: true }).select('value').lean()
      await stageScreenshots(db, domainId, aliveWeb.map((a) => a.value))
    }

    // 3c) port scan (naabu) — só autorizado. Nos IPs PRÓPRios do domínio (os que
    // resolveram para IP não-bloqueado), mais os vizinhos do netblock (Fase 2).
    if (authorized && PORTSCAN_ENABLED) {
      await setStep(db, domainId, 'ports')
      const ownIps = [...new Set(resolved.filter((r) => r && r.resolves).flatMap((r) => r.ips || []))]
        .filter((ip) => !isBlockedIp(ip))

      // Clean slate: portas são um retrato do estado ATUAL, re-derivado a cada
      // scan. Apaga tudo antes de re-escanear — senão os IPs de mail que rotacionam
      // (Microsoft 365/MailChimp) acumulam indefinidamente e ficam sem rótulo.
      await db.DomainAsset.deleteMany({ domainId, type: 'port' }).catch(() => {})

      // ASN/holder por IP ANTES do scan: identifica quem é provedor SaaS/e-mail
      // (pra rotular a porta) e quais faixas o alvo possui (pra expandir). É só
      // RIPEstat (leitura, sem tocar o alvo), então roda mesmo com expansão off.
      let cidrs = []
      let providerFor = null
      if (ownIps.length) {
        try {
          // maxIps alto: precisa classificar TODOS os IPs escaneados (rótulo SaaS),
          // não só uns poucos. As chamadas RIPEstat rodam em paralelo (asn.js).
          const r = await lookupNetblocks(ownIps, { targetDomain: domain, maxPrefixIps: ASN_MAX_PREFIX_IPS, maxIps: 80 })
          cidrs = r.cidrs
          await db.Domain.findByIdAndUpdate(domainId, { $set: { asnInfo: r.asns } }).catch(() => {})
          // Classifica por IP exato E por PREFIXO: um único lookup de qualquer IP
          // do bloco da Microsoft (52.96.0.0/14) classifica TODOS os 52.97.x, mesmo
          // os que não foram consultados individualmente (robusto a lacunas do lookup).
          providerFor = (ip) => {
            let holder = r.ipMap[ip] && r.ipMap[ip].holder
            if (!holder) { const hit = r.asns.find((a) => a.prefix && ipInCidr(ip, a.prefix)); holder = hit && hit.holder }
            return classifyProvider(holder)
          }
        } catch (e) { console.warn('[asm] lookup de ASN falhou:', e?.message) }
      }

      // Port scan dos IPs PRÓPRios (rotulando os de SaaS de terceiro).
      await stagePortScan(db, domainId, ownIps, { fromNeighbor: false, providerFor })

      // Fase 2: expande o netblock SÓ quando o alvo demonstravelmente POSSUI a
      // faixa (holder do ASN casa com o domínio) E ela é de tamanho contido.
      if (ASN_ENABLED && cidrs.length) {
        try {
          const ownSet = new Set(ownIps)
          const { ips: neighborIps } = expandCidrsV4(cidrs, { maxIps: ASN_MAX_IPS })
          const toScan = neighborIps.filter((ip) => !ownSet.has(ip))  // não re-escaneia os próprios
          if (toScan.length) await stagePortScan(db, domainId, toScan, { fromNeighbor: true, providerFor })
        } catch (e) { console.warn('[asm] expansão de netblock falhou:', e?.message) }
      }
    }

    // 4) score + contadores (o sinal de vazamento vem do módulo Vazamentos, por
    //    string de domínio — não rodamos leak aqui; ASM = superfície).
    await setStep(db, domainId, 'scoring')
    const { score, level } = await recomputeDomain(db, domainId)

    // 5) diff de superfície vs. o scan anterior (novo/sumido + Δscore).
    const currentAssets = await db.DomainAsset.find({ domainId }).select('type value fingerprint severity cveId alive label source cname').lean()
    const diff = computeAssetDiff({ previousAssets, currentAssets, scopedTypes })
    const now = new Date()
    const scoreDelta = score - previousScore

    await db.Domain.findByIdAndUpdate(domainId, { $set: {
      scanState: 'done', scanStep: 'done', lastScanAt: now,
      lastDiff: { ...diff, computedAt: now, scoreDelta },
    } })

    // 6) histórico de monitoramento — 1 registro por execução, pra a linha do
    //    tempo mostrar que o monitoramento é contínuo (ver models/DomainScan).
    const histSubs = currentAssets.filter((a) => a.type === 'subdomain')
    await db.DomainScan.create({
      domainId, ranAt: now, trigger, authorized,
      assetCount: currentAssets.length,
      subdomainCount: histSubs.length,
      aliveCount: histSubs.filter((a) => a.alive).length,  // web-vivos, não portas
      portCount: currentAssets.filter((a) => a.type === 'port').length,
      exposureCount: currentAssets.filter((a) => a.type === 'exposure').length,
      cveCount: currentAssets.filter((a) => a.cveId).length,
      riskScore: score, riskLevel: level,
      newCount: diff.newCount, missingCount: diff.missingCount, scoreDelta,
    }).catch((e) => console.warn('[asm] falha ao gravar histórico de scan:', e?.message))

    // 7) monitoramento risk-triggered (#2b): transforma "o que mudou" em eventos
    //    acionáveis (novo subdomínio, exposição alta, CVE, takeover, piora de
    //    score) e grava no feed. Não-fatal — um erro aqui não invalida o scan.
    try {
      const events = deriveMonitorEvents({ diff, currentAssets, previousAssets, previousScore, score, now })
      if (events.length) {
        await db.MonitorEvent.insertMany(events.map((e) => ({ ...e, domainId, domain: dom.domain })))
      }
    } catch (e) { console.warn('[asm] falha ao gravar eventos de monitoramento:', e?.message) }
  } catch (err) {
    await db.Domain.findByIdAndUpdate(domainId, { $set: {
      scanState: 'failed', scanStep: null, scanError: String(err?.message || err).slice(0, 300),
    } }).catch(() => {})
  }
}

// Recomputa contadores + score a partir do estado persistido (idempotente). O
// sinal de vazamento vem por STRING de domínio (módulo Vazamentos escreve por
// domain), então o score reflete buscas de exposição feitas para este domínio.
async function recomputeDomain(db, domainId) {
  const dom = await db.Domain.findById(domainId).lean()
  const [assets, leaks] = await Promise.all([
    db.DomainAsset.find({ domainId }).lean(),
    db.LeakedCredential.find({ domain: dom ? dom.domain : '__none__' }).lean(),
  ])
  const { score, level, reasons } = computeScore({ assets, leaks: LEAKS_ENABLED ? leaks : [] })
  // Contadores por categoria que NÃO se sobrepõem (Fase 2, Bugs 2/4). Um host é
  // 1 subdomínio; porta é grão à parte (IP:porta). `webAliveCount` conta só
  // subdomínio que responde HTTP — antes `aliveCount` somava portas (todas
  // alive:true), inflando "vivos".
  const subs = assets.filter((a) => a.type === 'subdomain')
  const webAlive = subs.filter((a) => a.alive).length
  await db.Domain.findByIdAndUpdate(domainId, { $set: {
    assetCount: assets.length,               // total cru — só histórico, UI não exibe
    subdomainCount: subs.length,
    webAliveCount: webAlive,
    aliveCount: webAlive,                     // compat: aliveCount == webAliveCount
    exposureCount: assets.filter((a) => a.type === 'exposure').length,
    portCount: assets.filter((a) => a.type === 'port').length,
    leakCount: leaks.length,
    riskScore: score, riskLevel: level, riskReasons: reasons,
  } })
  return { score, level }
}

// No boot, scans interrompidos ficam presos em 'scanning' (processo in-process
// não sobrevive a restart) → reconcilia para 'failed'/interrupted.
// Frente 0: roda no boot, sem request — precisa varrer TODOS os tenants. Se
// recebesse um `db` só, recuperaria o scan de um tenant e deixaria os outros
// presos em 'scanning' para sempre.
async function recoverInterruptedScansFor(db) {
  try {
    const r = await db.Domain.updateMany(
      { scanState: 'scanning' },
      { $set: { scanState: 'failed', scanStep: null, scanError: 'interrompido (restart do backend)' } }
    )
    return r.modifiedCount || 0
  } catch { return 0 }
}

module.exports = { runScan, scanBlockReason, recomputeDomain, recoverInterruptedScansFor, recoverInterruptedScans, isProbeSafe, upsertAsset, extractCveId }

// Fan-out por tenant do recover de boot (ver recoverInterruptedScansFor).
async function recoverInterruptedScans() {
  const { forEachTenant } = require('../tenancy')
  const results = await forEachTenant(({ db }) => recoverInterruptedScansFor(db))
  return results.filter((r) => r.ok).reduce((n, r) => n + (r.value || 0), 0)
}
