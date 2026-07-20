// LeakCheck — Public API (grátis, SEM chave). Retorna AGREGADO por domínio:
// contagem de exposições (`found`), categorias de dado (`fields`) e as fontes
// (`sources`, incluindo "Stealer Logs" e breaches nomeados) — NUNCA o dado em
// claro. É o modelo "fatos de exposição" defensável.
// Licença: uso comercial permitido COM atribuição visível "Powered by LeakCheck".
// Verificado respondendo deste servidor (200, ex.: tesla.com → found:6, sources
// Stealer Logs + Kinokong.org).
const { fetchSafe, networkErrorResult, commonErrorResult } = require('./http')

const id = 'leakcheck_public'
const label = 'LeakCheck (público)'
const API = 'https://leakcheck.io/api/public'

const FIELD_MAP = {
  origin: 'Origin', username: 'Usernames', id: 'ID', password: 'Passwords',
  email: 'Email addresses', name: 'Names', phone: 'Phone numbers', address: 'Addresses',
  ip: 'IP addresses', dob: 'Dates of birth', hash: 'Password hashes',
}
function mapFields(fields) { return (fields || []).map((f) => FIELD_MAP[f] || f) }

async function search(domain) {
  const { res, networkError } = await fetchSafe(`${API}?check=${encodeURIComponent(domain)}`, {
    headers: { 'User-Agent': 'Rift-ASM', Accept: 'application/json' },
  })
  if (networkError) return networkErrorResult(networkError)
  // Keyless/público — nunca teve checagem de 401/403/429 (não se aplica sem auth).
  const err = commonErrorResult(res, { checkAuth: false, checkRateLimit: false })
  if (err) return err

  const body = await res.json().catch(() => ({}))
  if (!body || body.success === false) return { available: true, breaches: [] }   // sem resultados = resposta real válida

  const fields = body.fields || []
  const hasPassword = fields.some((f) => /pass/i.test(f))
  const sources = Array.isArray(body.sources) ? body.sources : []
  const stealer = sources.some((s) => /stealer/i.test(s.name || ''))
  const dataClasses = mapFields(fields)

  // Fontes NOMEADAS (breaches de base de dados) viram aparições reais. O genérico
  // "Stealer Logs" fica só no agregado (não é um breach nomeado).
  const breaches = sources
    .filter((s) => s.name && !/stealer\s*logs/i.test(s.name))
    .map((s) => ({
      category: 'breach', account: null,
      breachName: s.name, breachTitle: s.name, breachDate: s.date || null, seenDate: s.date || null,
      dataClasses, hasPassword, description: null,
    }))

  return {
    available: true,
    breaches,
    aggregate: {
      found: Number(body.found) || 0,
      hasPassword, stealer,
      sources: sources.map((s) => s.name).filter(Boolean),
    },
  }
}

module.exports = { id, label, needsKey: false, real: true, search }
