// Descoberta de netblock via RIPEstat (HTTP keyless, sem chave). O asnmap da
// ProjectDiscovery passou a exigir chave PDCP; RIPEstat é aberto e cobre o que
// precisamos: IP → ASN + prefixo anunciado, e o holder (organização) do ASN.
//
// GUARDA ANTI-CLOUD + ANTI-HOSPEDAGEM (crítico): a maioria dos alvos está em
// provedor (cloud, datacenter, SaaS de e-mail) — o ASN/bloco é do PROVEDOR, não
// do cliente. Mesmo um /24 num datacenter é COMPARTILHADO: o alvo tem 1 IP lá, o
// resto do bloco é de outros clientes. Escanear esses vizinhos = escanear
// terceiros e atribuí-los ao alvo por engano.
//
// Por isso só expandimos um prefixo quando (a) ele é de tamanho contido
// (`maxPrefixIps`, senão `tooLarge`) E (b) o alvo DEMONSTRAVELMENTE POSSUI a
// faixa — o nome do holder do ASN casa com o nome do domínio (`owned`). IDC19,
// MailChimp, Hostinger, Interserver etc. não casam → só viram contexto, não são
// escaneados.
const { parseCidrV4 } = require('../net-guard')

// Normaliza para comparação: minúsculas, só alfanumérico, sem separadores.
function compact(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '') }

// O alvo "possui" a faixa se um rótulo significativo do domínio aparece no nome
// do holder do ASN. Ex.: trustsis.com + "IDC19 SOLUCOES EM TECNOLOGIA" → NÃO
// (provedor); trustsis.com + "TRUSTSIS LTDA" → SIM. Rótulos < 4 chars e TLDs são
// ignorados (ruído). Conservador: na dúvida, NÃO possui → não expande.
function ownsRange(holder, targetDomain) {
  if (!holder || !targetDomain) return false
  const h = compact(holder)
  const labels = String(targetDomain).toLowerCase().split('.')
    .filter((l) => l.length >= 4 && !['com', 'net', 'org', 'www', 'gov', 'edu', 'info'].includes(l))
  return labels.some((l) => h.includes(compact(l)))
}

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

// ips: string[] (IPs públicos já net-guard-safe do stageDns). `targetDomain` é o
// domínio sendo escaneado — usado para decidir se o alvo POSSUI a faixa.
// Retorna { asns: [{asn, holder, prefix, tooLarge, owned}], cidrs: [expansíveis] }.
// `cidrs` só contém prefixos owned && !tooLarge (os que é seguro/legítimo expandir).
async function lookupNetblocks(ips, { targetDomain = null, maxIps = 5, maxPrefixIps = 1024, fetchFn } = {}) {
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
    const holder = holderCache[asn]
    const owned = ownsRange(holder, targetDomain)
    // dedup por prefixo
    if (!asns.some((a) => a.prefix === prefix)) {
      asns.push({ asn: `AS${asn}`, holder, prefix, tooLarge, owned })
    }
    // Só expande faixa PRÓPRIA e de tamanho contido. Provedor (não-owned) ou bloco
    // grande de cloud vira só contexto — nunca escaneamos os vizinhos.
    if (owned && !tooLarge) cidrs.add(prefix)
  }
  return { asns, cidrs: [...cidrs] }
}

module.exports = { lookupNetblocks, ownsRange }
