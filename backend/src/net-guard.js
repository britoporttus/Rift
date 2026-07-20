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

module.exports = { isIpLiteral, isBlockedIp }
