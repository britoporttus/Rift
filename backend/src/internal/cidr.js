// Contenção de IP em CIDR — função PURA, sem I/O. Existe porque o ingest só pode
// marcar um host como "sumido" se a coleta realmente varreu o CIDR dele: com
// vários agentes (um por sub-rede) reportando para a mesma rede, comparar contra
// o inventário inteiro faria cada agente apagar o trabalho dos outros.
// Só IPv4 — o agente só reporta IPv4 hoje.

function ipToInt(ip) {
  const parts = String(ip || '').split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const b = Number(p)
    if (b > 255) return null
    n = (n * 256) + b
  }
  return n
}

// ipInCidr('192.168.0.5', '192.168.0.0/24') → true. Entrada inválida → false
// (nunca lança: um CIDR malformado do agente não pode derrubar o import).
function ipInCidr(ip, cidr) {
  const [base, bitsRaw] = String(cidr || '').split('/')
  const bits = Number(bitsRaw)
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false
  const ipN = ipToInt(ip)
  const baseN = ipToInt(base)
  if (ipN === null || baseN === null) return false
  if (bits === 0) return true
  const mask = bits === 32 ? 0xFFFFFFFF : (0xFFFFFFFF << (32 - bits)) >>> 0
  return ((ipN & mask) >>> 0) === ((baseN & mask) >>> 0)
}

function ipInAnyCidr(ip, cidrs = []) {
  return (Array.isArray(cidrs) ? cidrs : []).some((c) => ipInCidr(ip, c))
}

// True se o IP é o endereço de REDE ou de BROADCAST de algum CIDR varrido —
// nenhum dos dois é um host real, e a tabela ARP às vezes devolve o .255 de uma
// /24. Só se aplica a prefixos <= /30: um /31 é ponto-a-ponto e um /32 é host
// único, nenhum tem rede/broadcast separados.
function isNetworkOrBroadcast(ip, cidrs = []) {
  const ipN = ipToInt(ip)
  if (ipN === null) return false
  for (const c of (Array.isArray(cidrs) ? cidrs : [])) {
    const [base, bitsRaw] = String(c || '').split('/')
    const bits = Number(bitsRaw)
    if (!Number.isInteger(bits) || bits < 0 || bits > 30) continue
    const baseN = ipToInt(base)
    if (baseN === null) continue
    const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0
    const network = (baseN & mask) >>> 0
    const broadcast = (network | ((~mask) >>> 0)) >>> 0
    if (ipN === network || ipN === broadcast) return true
  }
  return false
}

// IPs que nunca são um host individual coletável, independente de escopo:
// 0.0.0.0, broadcast global, multicast/reservado (224/4+) e link-local
// (169.254/16). IP inválido também cai aqui (sem IP não há o que inventariar).
function isNonHostIp(ip) {
  const n = ipToInt(ip)
  if (n === null || n === 0) return true
  if (((n >>> 24) & 0xFF) >= 224) return true          // 224/4 multicast + 240/4 reservado (inclui 255.255.255.255)
  if (((n >>> 16) & 0xFFFF) === 0xA9FE) return true     // 169.254/16 link-local
  return false
}

module.exports = { ipInCidr, ipInAnyCidr, ipToInt, isNetworkOrBroadcast, isNonHostIp }
