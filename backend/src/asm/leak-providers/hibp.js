// Have I Been Pwned — busca por DOMÍNIO (endpoint breacheddomain, v3).
// ATENÇÃO (insight do conselho): o Domain Search do HIBP exige que o domínio
// tenha sido VERIFICADO (posse via DNS/e-mail) na conta dona da chave. Para um
// fornecedor, isso só funciona se ele autorizar/verificar — daí o gate
// `domain.authorized`. Sem chave → provider indisponível (não quebra o scan).
const { fetchSafe, networkErrorResult, commonErrorResult } = require('./http')

const id = 'hibp'
const label = 'Have I Been Pwned'
const API = 'https://haveibeenpwned.com/api/v3'

let breachCatalog = null   // cache do catálogo (nome → {date, dataClasses,…})

async function loadCatalog(headers) {
  if (breachCatalog) return breachCatalog
  try {
    const res = await fetch(`${API}/breaches`, { headers })
    if (!res.ok) return {}
    const arr = await res.json()
    breachCatalog = Object.fromEntries(arr.map((b) => [b.Name, b]))
  } catch { breachCatalog = {} }
  return breachCatalog
}

async function search(domain, { apiKey } = {}) {
  if (!apiKey) return { available: false, reason: 'no_api_key', breaches: [] }
  const headers = { 'hibp-api-key': apiKey, 'user-agent': 'Rift-ASM' }

  const { res, networkError } = await fetchSafe(`${API}/breacheddomain/${encodeURIComponent(domain)}`, { headers })
  if (networkError) return networkErrorResult(networkError)
  if (res.status === 404) return { available: true, breaches: [] }   // domínio sem vazamentos
  // HIBP nunca documentou 429 pro Domain Search — mantém o comportamento
  // original (só auth + !ok).
  const err = commonErrorResult(res, { unauthorizedReason: 'unauthorized_or_unverified_domain', checkRateLimit: false })
  if (err) return err

  // { "alias": ["Adobe","LinkedIn"], ... }  — alias = parte local do e-mail
  const map = await res.json().catch(() => ({}))
  const catalog = await loadCatalog(headers)
  const breaches = []
  for (const [alias, names] of Object.entries(map || {})) {
    for (const name of names || []) {
      const meta = catalog[name] || {}
      const dataClasses = meta.DataClasses || []
      breaches.push({
        category: 'breach',
        account: `${alias}@${domain}`,
        breachName: name,
        breachTitle: meta.Title || name,
        breachDate: meta.BreachDate || null,
        seenDate: meta.BreachDate || null,
        addedDate: meta.AddedDate || null,
        pwnCount: meta.PwnCount || null,
        dataClasses,
        hasPassword: dataClasses.some((d) => /password/i.test(d)),
        description: meta.Description ? String(meta.Description).replace(/<[^>]+>/g, '') : null,
      })
    }
  }
  return { available: true, breaches }
}

module.exports = { id, label, needsKey: true, search }
