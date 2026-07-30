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

// Provedores de SaaS / e-mail / CDN cujos IPs são INFRA COMPARTILHADA, não o
// servidor do alvo. Quando um subdomínio (mail/mktg/autodiscover) aponta pra cá,
// as portas são do provedor (ex.: mail do Microsoft 365), não exposição do alvo —
// então rotulamos e rebaixamos a severidade. NÃO inclui hospedagem dedicada
// (IDC19/Locaweb/OVH/DigitalOcean), onde o alvo tem servidor próprio.
const SAAS_PROVIDERS = [
  [/microsoft|office ?365|exchange online|outlook/i, 'Microsoft 365'],
  [/\bgoogle\b|gmail|google workspace/i, 'Google'],
  [/mailchimp|rocket ?science group/i, 'MailChimp'],
  [/cloudflare/i, 'Cloudflare'],
  [/akamai/i, 'Akamai'],
  [/fastly/i, 'Fastly'],
  [/sendgrid|twilio/i, 'SendGrid'],
  [/mailgun/i, 'Mailgun'],
  [/mimecast/i, 'Mimecast'],
  [/proofpoint/i, 'Proofpoint'],
  [/sendinblue|brevo/i, 'Brevo'],
  [/\bzoho\b/i, 'Zoho'],
  [/hubspot/i, 'HubSpot'],
  [/salesforce/i, 'Salesforce'],
  [/\brd ?station\b/i, 'RD Station'],
]

// classifyProvider(holder) → { thirdParty, name }. name é o rótulo amigável.
function classifyProvider(holder) {
  const h = String(holder || '')
  for (const [re, name] of SAAS_PROVIDERS) if (re.test(h)) return { thirdParty: true, name }
  return { thirdParty: false, name: null }
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

// Roda `fn` sobre `items` com no máximo `size` em paralelo (pool). Mantém as
// chamadas RIPEstat rápidas mesmo com dezenas de IPs.
async function mapPool(items, size, fn) {
  const out = []
  let i = 0
  await Promise.all(Array.from({ length: Math.min(size, items.length) || 0 }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]) }
  }))
  return out
}

// ips: string[] (IPs públicos já net-guard-safe do stageDns). `targetDomain` é o
// domínio sendo escaneado — usado para decidir se o alvo POSSUI a faixa. Precisa
// cobrir TODOS os IPs escaneados (não só uns poucos): o ipMap rotula a porta por
// provedor, então maxIps é alto e as chamadas rodam em paralelo.
// Retorna { asns: [{asn, holder, prefix, tooLarge, owned}], cidrs, ipMap }.
async function lookupNetblocks(ips, { targetDomain = null, maxIps = 64, maxPrefixIps = 1024, fetchFn } = {}) {
  const distinct = [...new Set((Array.isArray(ips) ? ips : []).filter(Boolean))].slice(0, maxIps)

  // 1) network-info (IP → prefixo + ASN) em paralelo.
  const infos = await mapPool(distinct, 12, async (ip) => {
    const ni = await httpJson(`${RIPESTAT}/network-info/data.json?resource=${encodeURIComponent(ip)}`, { fetchFn })
    const prefix = ni?.data?.prefix
    const asn = Array.isArray(ni?.data?.asns) && ni.data.asns.length ? ni.data.asns[0] : null
    return { ip, prefix, asn }
  })

  // 2) holder por ASN ÚNICO (as-overview), também em paralelo, cacheado.
  const uniqAsns = [...new Set(infos.map((x) => x.asn).filter((x) => x != null))]
  const holders = {}
  await mapPool(uniqAsns, 12, async (asn) => {
    const ov = await httpJson(`${RIPESTAT}/as-overview/data.json?resource=AS${asn}`, { fetchFn })
    holders[asn] = (ov && ov.data && ov.data.holder) || null
  })

  // 3) monta ipMap (todos os IPs), asns (dedup por prefixo) e cidrs (owned && !tooLarge).
  const asns = []
  const cidrs = new Set()
  const ipMap = {}
  for (const { ip, prefix, asn } of infos) {
    if (!prefix || asn == null) continue
    const c = parseCidrV4(prefix)
    if (!c) continue // prefixo IPv6 ou malformado → ignora (só fazemos v4)
    const size = Math.pow(2, 32 - c.prefix)
    const tooLarge = size > maxPrefixIps
    const holder = holders[asn]
    ipMap[ip] = { asn: `AS${asn}`, holder }
    const owned = ownsRange(holder, targetDomain)
    // dedup por prefixo
    if (!asns.some((a) => a.prefix === prefix)) {
      asns.push({ asn: `AS${asn}`, holder, prefix, tooLarge, owned })
    }
    // Só expande faixa PRÓPRIA e de tamanho contido. Provedor (não-owned) ou bloco
    // grande de cloud vira só contexto — nunca escaneamos os vizinhos.
    if (owned && !tooLarge) cidrs.add(prefix)
  }
  return { asns, cidrs: [...cidrs], ipMap }
}

module.exports = { lookupNetblocks, ownsRange, classifyProvider }
