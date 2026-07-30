// Guarda contra SSRF: usado antes de qualquer probe ativo (httpx/nuclei) ou de
// aceitar um "domínio" que na verdade é um endereço IP. Bloqueia loopback,
// RFC1918, link-local (inclui o endpoint de metadata de nuvem 169.254.169.254)
// e unique-local IPv6. Não é proteção contra DNS rebinding em runtime — isso
// exige egress-filtering em nível de rede/firewall, fora do alcance do código.
const net = require('net')

function isIpLiteral(str) {
  return net.isIP(String(str || '')) !== 0
}

function isBlockedIpv4(ip) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true
  const [a, b] = parts
  if (a === 127) return true // loopback
  if (a === 10) return true // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true // RFC1918
  if (a === 192 && b === 168) return true // RFC1918
  if (a === 169 && b === 254) return true // link-local + metadata de nuvem
  if (a === 0) return true // "this network"
  if (a >= 224) return true // multicast/reservado
  return false
}

function isBlockedIpv6(ip) {
  const lower = ip.toLowerCase()
  if (lower === '::1' || lower === '::') return true // loopback / unspecified
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice('::ffff:'.length)
    if (net.isIP(v4) === 4) return isBlockedIpv4(v4)
  }
  if (/^fe[89ab]/.test(lower)) return true // link-local fe80::/10
  if (/^f[cd]/.test(lower)) return true // unique-local fc00::/7
  return false
}

// Verdadeiro se o IP não deve ser alvo de probe ativo (loopback/privado/metadata).
// IP malformado também é bloqueado (falha para o lado seguro).
function isBlockedIp(ip) {
  const version = net.isIP(ip)
  if (version === 4) return isBlockedIpv4(ip)
  if (version === 6) return isBlockedIpv6(ip)
  return true
}

// ── Faixas de IP (CIDR) — usado ao expandir ranges de ASN (asnmap) para o port
// scan (naabu). Só IPv4. A regra de ouro do ASM: NUNCA passar uma faixa crua a
// uma ferramenta ativa; expandir aqui, filtrar CADA IP por isBlockedIp, e limitar
// o total (uma /16 são 65k IPs). Isso é o guarda anti-SSRF para faixas.
function ipv4ToInt(ip) {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]
}
function intToIpv4(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

// Parseia "a.b.c.d/nn" → { base:int, prefix, first:int, last:int } ou null.
function parseCidrV4(cidr) {
  const m = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/.exec(String(cidr || '').trim())
  if (!m) return null
  const base = ipv4ToInt(m[1])
  const prefix = Number(m[2])
  if (base === null || prefix < 0 || prefix > 32) return null
  const mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0
  const first = (base & mask) >>> 0
  const last = (first | (~mask >>> 0)) >>> 0
  return { base: first, prefix, first, last }
}

function ipInCidr(ip, cidr) {
  const c = parseCidrV4(cidr)
  const n = ipv4ToInt(String(ip || ''))
  if (!c || n === null) return false
  return n >= c.first && n <= c.last
}

function ipInAnyCidr(ip, cidrs) {
  if (!Array.isArray(cidrs)) return false
  return cidrs.some((c) => ipInCidr(ip, c))
}

// Expande uma lista de CIDRs em IPs escaneáveis: só IPv4, pula prefixos absurdos
// (< /minPrefix), remove rede/broadcast, FILTRA cada IP por isBlockedIp (privado/
// metadata nunca entra) e corta no total `maxIps`. Devolve { ips, truncated }.
function expandCidrsV4(cidrs, { maxIps = 4096, minPrefix = 16 } = {}) {
  const ips = []
  let truncated = false
  for (const cidr of Array.isArray(cidrs) ? cidrs : []) {
    const c = parseCidrV4(cidr)
    if (!c || c.prefix < minPrefix) continue // faixa inválida ou grande demais
    // /31 e /32 não têm rede/broadcast reserváveis; senão pula os dois extremos.
    const start = c.prefix >= 31 ? c.first : (c.first + 1) >>> 0
    const end = c.prefix >= 31 ? c.last : (c.last - 1) >>> 0
    for (let n = start; n <= end; n = (n + 1) >>> 0) {
      if (ips.length >= maxIps) { truncated = true; return { ips, truncated } }
      const ip = intToIpv4(n)
      if (!isBlockedIp(ip)) ips.push(ip)
      if (n === end) break // guarda contra overflow do >>>0 no último
    }
  }
  return { ips, truncated }
}

module.exports = { isIpLiteral, isBlockedIp, parseCidrV4, ipInCidr, ipInAnyCidr, expandCidrsV4 }
