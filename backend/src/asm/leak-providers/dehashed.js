// DeHashed — API v2 (a v1 foi descontinuada: /search dá 404). Busca por domínio
// (`domain:<x>`), record-level. Diferente do HIBP, permite domínio arbitrário —
// por isso fica atrás do gate `authorized` (LGPD/contrato). Alcançável do nosso
// servidor (não bloqueado como a Hudson Rock).
//
// Modelo pay-as-you-go (~US$0,02/query) — encaixa em produto vendável: custo
// variável por consulta, embutível no preço do cliente.
//
// Auth v2: header `Dehashed-Api-Key`. Senha em claro (se vier) é DESCARTADA.
// OBS: shape da v2 validar ao vivo com uma chave real (campos podem vir em arrays).
const id = 'dehashed'
const label = 'DeHashed'
const API = 'https://api.dehashed.com/v2/search'

const first = (v) => (Array.isArray(v) ? v[0] : v)
// Teto de resultados POR PÁGINA. Baixo por padrão (25) como PROTEÇÃO de custo —
// se o DeHashed cobrar por-resultado, uma página não queima muitos créditos.
const PAGE_SIZE = Number(process.env.DEHASHED_PAGE_SIZE) || 25
// P1-16 (auditoria 2026-07-20): antes, só a página 1 era buscada — `aggregate.found`
// mostrava o total real (`body.total`), mas a lista de contas ficava truncada em
// 25 sem NENHUM sinal pra UI de que havia mais. Agora pagina até MAX_PAGES (teto
// de custo explícito — nunca busca "o total inteiro" sem limite) e devolve
// `truncated`/`totalAvailable` quando não coube tudo.
const MAX_PAGES = Number(process.env.DEHASHED_MAX_PAGES) || 4

function mapEntry(e) {
  const email = first(e.email), username = first(e.username)
  const pass = first(e.password) || first(e.hashed_password)
  const url = first(e.url) || null
  const db = String(first(e.database_name) || '').toLowerCase()
  const isMalware = !!url || /stealer|redline|logs?|infostealer/i.test(db)
  const dataClasses = []
  if (email) dataClasses.push('Email addresses')
  if (pass) dataClasses.push('Passwords')
  if (username) dataClasses.push('Usernames')
  if (first(e.phone)) dataClasses.push('Phone numbers')
  return {
    category: isMalware ? 'malware' : 'breach',
    account: email || username || null,
    sourceUrl: url,
    stealerFamily: isMalware ? (first(e.database_name) || null) : null,
    seenDate: null,
    breachName: first(e.database_name) || 'DeHashed',
    breachTitle: first(e.database_name) || 'DeHashed',
    dataClasses, hasPassword: !!pass, pwnCount: null, description: null,
  }
}

async function fetchPage(domain, apiKey, page) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Dehashed-Api-Key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: `domain:${domain}`, size: PAGE_SIZE, page }),
  })
  if (res.status === 401 || res.status === 403) return { error: 'unauthorized_or_no_plan' }
  if (res.status === 429) return { error: 'rate_limited' }
  if (!res.ok) return { error: `http_${res.status}` }
  const body = await res.json().catch(() => ({}))
  return { body }
}

async function search(domain, { apiKey } = {}) {
  if (!apiKey) return { available: false, reason: 'no_api_key', breaches: [] }

  let entries = []
  let total = 0
  let page = 1
  while (page <= MAX_PAGES) {
    let result
    try {
      result = await fetchPage(domain, apiKey, page)
    } catch (err) {
      if (page === 1) return { available: false, reason: `network_error: ${err.message}`, breaches: [] }
      break // já temos página(s) anterior(es) — devolve o que deu, não descarta tudo
    }
    if (result.error) {
      if (page === 1) return { available: false, reason: result.error, breaches: [] }
      break
    }
    const pageEntries = Array.isArray(result.body.entries) ? result.body.entries : []
    total = Number(result.body.total) || total
    entries.push(...pageEntries)
    // Instrumentação de custo: mede quanto cada busca de domínio consome de crédito
    // (a v2 devolve `balance`). Assim descobrimos empiricamente se cobra por-query
    // ou por-resultado ANTES de comprar mais créditos.
    console.log(`[dehashed] domain:${domain} page:${page} | entries:${pageEntries.length} | total:${total} | balance:${result.body.balance ?? '?'}`)
    if (pageEntries.length < PAGE_SIZE) break // última página real
    page++
  }

  const truncated = total > entries.length
  const breaches = entries.map(mapEntry)
  return {
    available: true,
    breaches,
    aggregate: {
      found: total || breaches.length,
      hasPassword: breaches.some((b) => b.hasPassword),
      stealer: breaches.some((b) => b.category === 'malware'),
      sources: [...new Set(breaches.map((b) => b.breachName))],
      truncated,
      totalAvailable: total || breaches.length,
    },
  }
}

module.exports = { id, label, needsKey: true, real: true, search, PAGE_SIZE, MAX_PAGES }
