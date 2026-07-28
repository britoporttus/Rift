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

module.exports = { ipInCidr, ipInAnyCidr, ipToInt }
