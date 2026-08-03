'use strict'
/**
 * Prova de posse de domínio.
 *
 * Por que existe: até aqui `Domain.authorized` era um toggle manual do admin,
 * apoiado numa referência contratual. Isso funciona quando quem cadastra é o
 * operador, que responde pelo que faz. Não funciona com cliente self-service:
 * qualquer um poderia cadastrar `banco-qualquer.com.br` e escanear a
 * infraestrutura de um terceiro **a partir do nosso IP**. O ônus recai sobre
 * nós, não sobre quem cadastrou.
 *
 * Decisão do operador (2026-08-03): a verificação bloqueia **tudo** — nem a
 * coleta passiva roda antes — e **ninguém dispensa**, nem admin. É a política
 * mais conservadora possível; o trade-off aceito é que um pentest contratado
 * cujo alvo o cliente não administra no DNS precisa ser resolvido antes, no DNS
 * do alvo.
 *
 * Dois métodos, ambos padrão de mercado (ACM, Search Console, etc.):
 *
 *   DNS  → registro TXT em `_rift-verify.<domínio>` contendo o token.
 *          Prova controle da zona: é o mais forte.
 *   HTTP → arquivo em `https://<domínio>/.well-known/rift-verify.txt`.
 *          Prova controle do servidor web. Mais fácil, um pouco mais fraco
 *          (quem tem upload num diretório servido consegue).
 *
 * SEGURANÇA: a checagem HTTP é uma requisição a um host escolhido pelo usuário
 * — é literalmente o padrão de um SSRF. Todo IP resolvido passa pelo
 * `net-guard` antes de qualquer conexão, e não seguimos redirect (um 302 para
 * `169.254.169.254` contornaria a validação do host original).
 */
const crypto = require('crypto')
const dns = require('dns').promises
const https = require('https')
const http = require('http')
const { isBlockedIp, isIpLiteral } = require('./net-guard')

const TXT_PREFIX = '_rift-verify'
const HTTP_PATH = '/.well-known/rift-verify.txt'
const TOKEN_BYTES = 24
const HTTP_TIMEOUT_MS = Number(process.env.DOMAIN_VERIFY_TIMEOUT_MS) || 8000
const MAX_BODY_BYTES = 4096

/** Token opaco de verificação. Novo a cada pedido — não deriva do domínio. */
function generateToken() {
  return `rift-verify-${crypto.randomBytes(TOKEN_BYTES).toString('base64url')}`
}

/** O que o usuário precisa publicar. Puro — a UI monta a instrução com isto. */
function verificationInstructions(domain, token) {
  return {
    dns:  { type: 'TXT', name: `${TXT_PREFIX}.${domain}`, value: token },
    http: { url: `https://${domain}${HTTP_PATH}`, content: token },
  }
}

/** Comparação em tempo constante — o token é um segredo de curta duração. */
function tokenMatches(found, expected) {
  const a = Buffer.from(String(found || '').trim())
  const b = Buffer.from(String(expected || '').trim())
  if (a.length !== b.length || a.length === 0) return false
  return crypto.timingSafeEqual(a, b)
}

// ── DNS ─────────────────────────────────────────────────────────────────────

async function verifyDns(domain, token, resolver = dns) {
  const name = `${TXT_PREFIX}.${domain}`
  let records
  try {
    records = await resolver.resolveTxt(name)
  } catch (err) {
    const code = err && err.code
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      return { ok: false, method: 'dns', error: `Nenhum registro TXT em ${name}. A propagação do DNS pode levar alguns minutos.` }
    }
    return { ok: false, method: 'dns', error: `Falha ao consultar ${name}: ${err.message}` }
  }
  // resolveTxt devolve string[][] (um TXT pode vir fragmentado em chunks).
  const values = (records || []).map((chunks) => (Array.isArray(chunks) ? chunks.join('') : String(chunks)))
  const hit = values.some((v) => tokenMatches(v, token))
  return hit
    ? { ok: true, method: 'dns' }
    : { ok: false, method: 'dns', error: `TXT encontrado em ${name}, mas o valor não confere com o token atual.` }
}

// ── HTTP ────────────────────────────────────────────────────────────────────

/**
 * Resolve o host e recusa se QUALQUER IP for privado/loopback/link-local. Não
 * basta checar um: um domínio pode resolver para vários endereços e a conexão
 * escolhe qualquer um deles.
 */
async function resolvePublicIps(domain, resolver = dns) {
  if (isIpLiteral(domain)) throw new Error('Literal de IP não pode ser verificado como domínio')
  const addrs = await resolver.lookup(domain, { all: true, verbatim: true })
  const ips = (Array.isArray(addrs) ? addrs : [addrs]).map((a) => a.address)
  if (ips.length === 0) throw new Error('Domínio não resolve para nenhum IP')
  const blocked = ips.filter((ip) => isBlockedIp(ip))
  if (blocked.length > 0) {
    throw new Error(`Domínio resolve para endereço de rede interna (${blocked[0]}) — verificação recusada`)
  }
  return ips
}

function fetchBody(url, ip) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const lib = u.protocol === 'https:' ? https : http
    const req = lib.request({
      // Conecta no IP JÁ validado e manda o Host — fecha a janela de TOCTOU em
      // que o DNS muda entre a validação e a conexão (rebinding).
      host: ip,
      servername: u.hostname,
      path: u.pathname,
      method: 'GET',
      headers: { Host: u.hostname, 'User-Agent': 'Rift-DomainVerify/1.0' },
      timeout: HTTP_TIMEOUT_MS,
      // Certificado inválido não invalida a prova de posse (muitos alvos usam
      // self-signed); o que importa é o conteúdo servido por aquele IP.
      rejectUnauthorized: false,
    }, (res) => {
      // Redirect NÃO é seguido de propósito: um 302 para um IP interno
      // contornaria toda a validação feita acima.
      if (res.statusCode >= 300 && res.statusCode < 400) {
        res.resume()
        return reject(new Error(`Redirect (${res.statusCode}) não é seguido — publique o arquivo na URL exata.`))
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode} ao buscar o arquivo`))
      }
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => {
        body += c
        if (body.length > MAX_BODY_BYTES) { req.destroy(); reject(new Error('Arquivo grande demais')) }
      })
      res.on('end', () => resolve(body))
    })
    req.on('timeout', () => { req.destroy(); reject(new Error('Tempo esgotado')) })
    req.on('error', reject)
    req.end()
  })
}

async function verifyHttp(domain, token, deps = {}) {
  const resolver = deps.resolver || dns
  const get = deps.fetchBody || fetchBody
  let ips
  try {
    ips = await resolvePublicIps(domain, resolver)
  } catch (err) {
    return { ok: false, method: 'http', error: err.message }
  }
  const url = `https://${domain}${HTTP_PATH}`
  try {
    const body = await get(url, ips[0])
    return tokenMatches(body, token)
      ? { ok: true, method: 'http' }
      : { ok: false, method: 'http', error: 'Arquivo encontrado, mas o conteúdo não confere com o token atual.' }
  } catch (err) {
    return { ok: false, method: 'http', error: `${url}: ${err.message}` }
  }
}

/**
 * Tenta os dois métodos. DNS primeiro (prova mais forte); se falhar, HTTP.
 * Devolve o primeiro sucesso, ou os dois erros para a UI explicar o que fazer.
 */
async function verifyDomain(domain, token, deps = {}) {
  const d = await verifyDns(domain, token, deps.resolver)
  if (d.ok) return d
  const h = await verifyHttp(domain, token, deps)
  if (h.ok) return h
  return { ok: false, method: null, error: `${d.error} | ${h.error}`, attempts: [d, h] }
}

module.exports = {
  TXT_PREFIX, HTTP_PATH,
  generateToken, verificationInstructions, tokenMatches,
  verifyDns, verifyHttp, verifyDomain, resolvePublicIps,
}
