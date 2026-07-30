// Descoberta de netblock via RIPEstat (HTTP keyless, sem chave). O asnmap da
// ProjectDiscovery passou a exigir chave PDCP; RIPEstat é aberto e cobre o que
// precisamos: IP → ASN + prefixo anunciado, e o holder (organização) do ASN.
//
// GUARDA ANTI-CLOUD (crítico): a maioria dos alvos está hospedada em cloud
// (AWS/Google/Cloudflare) — o ASN é do PROVEDOR, não do cliente, e tem milhões
// de IPs. Escanear o ASN inteiro seria escanear o provedor todo. Por isso só
// devolvemos o **prefixo que contém o IP do alvo** (ex.: o /24), e só se for de
// tamanho contido (`maxPrefixIps`); prefixo grande de cloud é marcado `tooLarge`
// e NÃO entra na expansão.
const { parseCidrV4 } = require('../net-guard')

const RIPESTAT = 'https://stat.ripe.net/data'

async function httpJson(url, { timeoutMs = 12000, fetchFn } = {}) {
  const f = fetchFn || (typeof fetch === 'function' ? fetch : null)
  if (!f) return null
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await f(url, { signal: ctrl.signal, headers: { 'User-Agent': 'rift-asm' } })
    if (!r || !r.ok) return null
    return await r.json()
  } catch { return null } finally { clearTimeout(t) }
}

// ips: string[] (IPs públicos já net-guard-safe do stageDns).
// Retorna { asns: [{asn, holder, prefix, tooLarge}], cidrs: [prefixos expansíveis] }.
async function lookupNetblocks(ips, { maxIps = 5, maxPrefixIps = 1024, fetchFn } = {}) {
  const distinct = []
  const seen = new Set()
  for (const ip of Array.isArray(ips) ? ips : []) {
    if (seen.has(ip)) continue
    seen.add(ip); distinct.push(ip)
    if (distinct.length >= maxIps) break
  }

  const asns = []
  const cidrs = new Set()
  const holderCache = {}
  for (const ip of distinct) {
    const ni = await httpJson(`${RIPESTAT}/network-info/data.json?resource=${encodeURIComponent(ip)}`, { fetchFn })
    const prefix = ni?.data?.prefix
    const asn = Array.isArray(ni?.data?.asns) && ni.data.asns.length ? ni.data.asns[0] : null
    if (!prefix || asn == null) continue
    const c = parseCidrV4(prefix)
    if (!c) continue // prefixo IPv6 ou malformado → ignora (só fazemos v4)
    const size = Math.pow(2, 32 - c.prefix)
    const tooLarge = size > maxPrefixIps

    if (holderCache[asn] === undefined) {
      const ov = await httpJson(`${RIPESTAT}/as-overview/data.json?resource=AS${asn}`, { fetchFn })
      holderCache[asn] = (ov && ov.data && ov.data.holder) || null
    }
    // dedup por prefixo
    if (!asns.some((a) => a.prefix === prefix)) {
      asns.push({ asn: `AS${asn}`, holder: holderCache[asn], prefix, tooLarge })
    }
    if (!tooLarge) cidrs.add(prefix)
  }
  return { asns, cidrs: [...cidrs] }
}

module.exports = { lookupNetblocks }
