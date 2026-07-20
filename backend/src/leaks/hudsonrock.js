// Normaliza a resposta da Hudson Rock Cavalier (API grátis de infostealer) para o
// nosso schema. O JSON é coletado PELO NAVEGADOR do operador (o IP do servidor é
// bloqueado) e enviado via /api/leaks/ingest. Shape real (verificado):
//   { total, totalStealers, employees, users, totalUrls,
//     stealerFamilies: {"RedLine": 27400, ...},
//     data: { employees_urls:[{url,type,occurrence}], clients_urls:[...], all_urls:[...] },
//     last_employee_compromised, last_user_compromised }
// Não há senha em claro na resposta grátis (só URLs/contadores/famílias).
const MAX_URLS = 500

function normalizeHudsonRock(domain, raw) {
  const data = (raw && raw.data) || {}
  const buckets = []
  if (Array.isArray(data.employees_urls)) buckets.push(...data.employees_urls.map((u) => ({ ...toUrl(u), kind: 'funcionário' })))
  if (Array.isArray(data.clients_urls)) buckets.push(...data.clients_urls.map((u) => ({ ...toUrl(u), kind: 'cliente' })))
  const urls = buckets.length ? buckets : (Array.isArray(data.all_urls) ? data.all_urls.map((u) => ({ ...toUrl(u), kind: '' })) : [])

  const breaches = []
  for (const u of urls.slice(0, MAX_URLS)) {
    if (!u.url) continue
    breaches.push({
      category: 'malware', account: null, sourceUrl: u.url,
      stealerFamily: null, seenDate: null, hasPassword: true,
      dataClasses: ['Passwords', 'Email addresses'],
      description: `Infostealer (Hudson Rock)${u.kind ? ' · ' + u.kind : ''}${u.occurrence ? ' · ' + u.occurrence + 'x' : ''}`,
    })
  }

  const families = {}
  const sf = raw && raw.stealerFamilies
  if (sf && typeof sf === 'object') for (const [k, v] of Object.entries(sf)) families[k] = Number(v) || 0

  const aggregate = {
    found: Number(raw.total) || Number(raw.totalStealers) || urls.length,
    hasPassword: true, stealer: true, sources: ['Hudson Rock'],
    employees: Number(raw.employees) || 0,
    users: Number(raw.users) || 0,
    malware: Number(raw.totalStealers) || 0,
    families,
  }

  // Extra (metadados do domínio): logo + exposição de cadeia (credenciais dos
  // funcionários do alvo vazadas para OUTROS fornecedores — sinal TPRM forte).
  const tpd = Array.isArray(raw.thirdPartyDomains)
    ? raw.thirdPartyDomains
        .filter((t) => t && t.domain)
        .map((t) => ({ domain: String(t.domain), occurrence: Number(t.occurrence) || 1 }))
        .sort((a, b) => b.occurrence - a.occurrence)
        .slice(0, 100)
    : []
  const extra = {
    logo: typeof raw.logo === 'string' && /^https?:\/\//.test(raw.logo) ? raw.logo : null,
    thirdPartyDomains: tpd,
  }

  return { breaches, aggregate, extra }
}

function toUrl(u) { return typeof u === 'string' ? { url: u } : (u || {}) }

module.exports = { normalizeHudsonRock }
