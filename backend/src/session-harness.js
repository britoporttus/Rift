// Harness de sessão (#3) — pré-voo do pentest autenticado: dado um alvo + uma
// credencial, PROVAR (deterministicamente, sem IA) que o login funciona e a
// sessão se sustenta ANTES de gastar token de agente. O agente descobrir que
// não logou depois de ter rodado é o desperdício que isto evita.
//
// A ANÁLISE (dado o que voltou, qual o veredito) é pura e testável aqui; o I/O
// (buscar as URLs, resolver DNS, anti-SSRF) mora no runner abaixo.

const http = require('http')
const https = require('https')
const dns = require('dns').promises
const { URL } = require('url')
const { isBlockedIp } = require('./net-guard')

// Marcadores comuns de FALHA de login num corpo HTML (pt/en). Se o corpo grita
// "senha inválida", não adianta cookie nenhum — não logou.
const FAILURE_MARKERS = [
  /invalid (username|password|credentials|login)/i,
  /(incorrect|wrong) (password|username|credentials)/i,
  /senha (inválida|incorreta)/i, /usuário (inválido|não encontrado)/i,
  /credenciais inválidas/i, /login (failed|inválido)/i, /authentication failed/i,
]
// Marcador de que ainda estamos na TELA DE LOGIN (não avançou).
const LOGIN_FORM_MARKERS = [/type=["']password["']/i, /name=["']password["']/i]

// Dado o resultado das duas etapas (POST de login + GET protegido), decide o
// veredito. Puro: recebe objetos simples, não faz I/O.
//   loginResp:     { status, setCookie: string[], location, body }
//   protectedResp: { status, body } | null   (etapa de sustentação; opcional)
//   opts:          { successContains }        (marcador de sucesso informado pelo operador)
function analyzeLogin(loginResp, protectedResp, opts = {}) {
  const reasons = []
  const evidence = {}
  const body = loginResp.body || ''

  // 1) Falha explícita no corpo → reprova na hora.
  const failHit = FAILURE_MARKERS.find((re) => re.test(body))
  if (failHit) {
    return { verdict: 'failed', sessionEstablished: false, sustained: false,
      reasons: ['A resposta indica credencial inválida.'], evidence: { failureMarker: true } }
  }

  // 2) Sessão estabelecida? Cookie de sessão OU redirect para fora do login.
  const cookies = (loginResp.setCookie || []).map((c) => String(c).split('=')[0].trim()).filter(Boolean)
  const hasSessionCookie = cookies.length > 0
  const redirectedAway = loginResp.status >= 300 && loginResp.status < 400 &&
    loginResp.location && !/login|signin|auth/i.test(loginResp.location)
  evidence.cookies = cookies
  evidence.status = loginResp.status
  if (loginResp.location) evidence.redirect = loginResp.location

  const sessionEstablished = hasSessionCookie || !!redirectedAway
  if (hasSessionCookie) reasons.push(`Cookie de sessão emitido (${cookies.join(', ')}).`)
  if (redirectedAway) reasons.push(`Redirecionou para fora do login (${loginResp.location}).`)

  // 3) Marcador de sucesso informado pelo operador (opcional, forte).
  if (opts.successContains && body.includes(opts.successContains)) {
    reasons.push(`Página pós-login contém "${opts.successContains}".`)
    evidence.successMarker = true
  }

  // 4) Sustentação: a página protegida NÃO mostra o formulário de login de novo.
  let sustained = null
  if (protectedResp) {
    const stillLogin = LOGIN_FORM_MARKERS.some((re) => re.test(protectedResp.body || '')) || protectedResp.status === 401 || protectedResp.status === 403
    sustained = !stillLogin
    reasons.push(sustained ? 'A sessão se sustenta numa página protegida.' : 'A página protegida ainda exige login — sessão não sustentou.')
    evidence.protectedStatus = protectedResp.status
  }

  // 'ok' exige EVIDÊNCIA de que a sessão funciona: sustentação confirmada, ou ao
  // menos um cookie de sessão. Um redirect solto (sem cookie, sem sustentação) é
  // sinal fraco → 'inconclusive', não 'ok' (não prometer o que não se provou).
  let verdict
  if (!sessionEstablished) verdict = 'inconclusive'
  else if (sustained === false) verdict = 'failed'
  else if (sustained === true) verdict = 'ok'
  else verdict = hasSessionCookie ? 'ok' : 'inconclusive'   // sustained === null

  return { verdict, sessionEstablished, sustained, reasons, evidence }
}

// Resolve o host e recusa se QUALQUER IP for interno (anti-SSRF, mesmo padrão do
// ASM — a URL vem do operador). Retorna os IPs válidos ou lança.
async function assertSafeHost(host) {
  let ips = []
  try { ips = await dns.resolve4(host) } catch { /* pode ser IPv6/CNAME */ }
  if (!ips.length) { try { const a = await dns.lookup(host, { all: true }); ips = a.map((x) => x.address) } catch {} }
  if (!ips.length) throw new Error(`não foi possível resolver ${host}`)
  if (ips.some((ip) => isBlockedIp(ip))) throw new Error(`alvo resolve para IP interno/bloqueado — recusado (anti-SSRF)`)
  return ips
}

function fetchRaw(urlStr, { method = 'GET', headers = {}, body = null, timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(urlStr) } catch { return reject(new Error('URL inválida')) }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return reject(new Error('só http/https'))
    const lib = u.protocol === 'https:' ? https : http
    const req = lib.request(u, { method, headers, timeout: timeoutMs }, (res) => {
      const chunks = []
      let size = 0
      res.on('data', (d) => { size += d.length; if (size <= 512 * 1024) chunks.push(d) })  // teto 512KB
      res.on('end', () => resolve({
        status: res.statusCode,
        setCookie: res.headers['set-cookie'] || [],
        location: res.headers['location'] || null,
        body: Buffer.concat(chunks).toString('utf8'),
      }))
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

// Pré-voo completo. `loginUrl` (form action), credenciais e nomes de campo.
// `protectedUrl` (opcional) é a página usada para checar sustentação.
async function runSessionCheck({ loginUrl, username, password, usernameField = 'username', passwordField = 'password', extraFields = {}, protectedUrl = null, successContains = null } = {}) {
  const u = new URL(loginUrl)
  await assertSafeHost(u.hostname)   // anti-SSRF antes de qualquer request

  const form = new URLSearchParams({ [usernameField]: username, [passwordField]: password, ...extraFields }).toString()
  const loginResp = await fetchRaw(loginUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': Buffer.byteLength(form), 'user-agent': 'Rift-SessionHarness/1.0' },
    body: form,
  })

  // Etapa de sustentação: usa o cookie recebido na página protegida (ou re-GET do login).
  let protectedResp = null
  const cookieHeader = (loginResp.setCookie || []).map((c) => String(c).split(';')[0]).join('; ')
  if (cookieHeader) {
    const target = protectedUrl || loginUrl
    await assertSafeHost(new URL(target).hostname)
    protectedResp = await fetchRaw(target, { method: 'GET', headers: { cookie: cookieHeader, 'user-agent': 'Rift-SessionHarness/1.0' } }).catch(() => null)
  }

  return analyzeLogin(loginResp, protectedResp, { successContains })
}

module.exports = { analyzeLogin, runSessionCheck, assertSafeHost, FAILURE_MARKERS }
