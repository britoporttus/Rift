// Diff de hosts entre duas coletas da mesma rede — função pura (espelha asm/diff.js).
// O agente sempre re-verifica a rede inteira, então (ao contrário do ASM) não há
// `scopedTypes`: um host que sumiu simplesmente sumiu.
const MAX_EXAMPLES = 20

function computeHostDiff({ previousHosts = [], currentHosts = [] } = {}) {
  const prevFp = new Set(previousHosts.map((h) => h.fingerprint).filter(Boolean))
  const currFp = new Set(currentHosts.map((h) => h.fingerprint).filter(Boolean))
  const hasBaseline = previousHosts.length > 0

  const newHosts = hasBaseline
    ? currentHosts.filter((h) => h.fingerprint && !prevFp.has(h.fingerprint))
    : currentHosts
  const missingHosts = hasBaseline
    ? previousHosts.filter((h) => h.fingerprint && !currFp.has(h.fingerprint))
    : []

  const trim = (h) => ({ ip: h.ip, mac: h.mac || null, deviceType: h.deviceType || 'unknown' })
  return {
    newCount: newHosts.length,
    missingCount: missingHosts.length,
    newHosts: newHosts.slice(0, MAX_EXAMPLES).map(trim),
    missingHosts: missingHosts.slice(0, MAX_EXAMPLES).map(trim),
  }
}

module.exports = { computeHostDiff }
