// LeakCheck — Pro API v2 (COM chave). Diferente do público, retorna RECORD-LEVEL
// por domínio: cada conta com a fonte (breach/stealer) e a data. Preenche a tabela
// e a timeline de verdade. Senha em claro (se vier) é DESCARTADA — só `hasPassword`.
// Gate: record-level de terceiro → só domínio autorizado (needsKey → gated).
const { fetchSafe, networkErrorResult, commonErrorResult } = require('./http')

const id = 'leakcheck'
const label = 'LeakCheck (Pro)'
const API = 'https://leakcheck.io/api/v2/query'

const FIELD_MAP = {
  email: 'Email addresses', username: 'Usernames', password: 'Passwords', hash: 'Password hashes',
  name: 'Names', first_name: 'Names', last_name: 'Names', phone: 'Phone numbers',
  address: 'Addresses', ip: 'IP addresses', dob: 'Dates of birth', origin: 'Origin',
}
function mapFields(fields) { return (fields || []).map((f) => FIELD_MAP[f] || f) }

async function search(domain, { apiKey } = {}) {
  if (!apiKey) return { available: false, reason: 'no_api_key', breaches: [] }
  const { res, networkError } = await fetchSafe(`${API}/${encodeURIComponent(domain)}?type=domain`, {
    headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
  })
  if (networkError) return networkErrorResult(networkError)
  const err = commonErrorResult(res, { unauthorizedReason: 'unauthorized' })
  if (err) return err

  const body = await res.json().catch(() => ({}))
  if (body && body.success === false) return { available: true, breaches: [], reason: body.error || null }
  const results = Array.isArray(body.result) ? body.result : []

  const breaches = results.map((r) => {
    const src = r.source || {}
    const srcName = src.name || (typeof r.source === 'string' ? r.source : 'LeakCheck')
    const isStealer = /stealer/i.test(String(srcName))
    const fields = r.fields || []
    const date = src.breach_date || src.date || null
    return {
      category: isStealer ? 'malware' : 'breach',
      account: r.email || r.username || null,
      breachName: srcName, breachTitle: srcName,
      breachDate: date, seenDate: date,
      dataClasses: mapFields(fields),
      hasPassword: !!r.password || fields.some((f) => /pass/i.test(f)),
      sourceUrl: r.origin || src.url || null,   // stealer logs às vezes trazem a URL de origem
      stealerFamily: null,                       // LeakCheck não informa família (Hudson Rock complementa)
      description: null,
    }
  })

  return { available: true, breaches, aggregate: { found: Number(body.found) || breaches.length, hasPassword: breaches.some((b) => b.hasPassword), stealer: breaches.some((b) => b.category === 'malware'), sources: [...new Set(breaches.map((b) => b.breachName))] } }
}

module.exports = { id, label, needsKey: true, real: true, search }
