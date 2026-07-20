'use strict'
// P2-36 (auditoria 2026-07-20): as chamadas HTTP dos providers de leak
// repetiam quase o mesmo bloco de tratamento de erro (rede/401/403/429/!ok)
// em cada arquivo — risco de divergência silenciosa se um for atualizado sem
// replicar nos outros. Helpers com os checks OPCIONAIS que cada provider já
// fazia de forma diferente (nem todos checavam 401 ou 429) — preserva
// exatamente o comportamento anterior de cada um via flags, não força todos a
// se comportarem igual.

// Envolve o fetch: nunca lança, devolve {res} ou {networkError}.
async function fetchSafe(url, opts) {
  try {
    const res = await fetch(url, opts)
    return { res }
  } catch (err) {
    return { networkError: err }
  }
}

// Shape padrão de erro por falha de rede (try/catch do fetch).
function networkErrorResult(err) {
  return { available: false, reason: `network_error: ${err.message}`, breaches: [] }
}

// Checa status HTTP comuns de falha (auth/rate-limit/genérico). Devolve o
// shape de erro do provider, ou `null` se a resposta deve seguir pro parse
// normal (res.ok, ou um status que o chamador trata como caso especial ANTES
// de chegar aqui — ex.: HIBP 404 = "sem vazamentos", não erro).
function commonErrorResult(res, { checkAuth = true, unauthorizedReason = 'unauthorized', checkRateLimit = true } = {}) {
  if (checkAuth && (res.status === 401 || res.status === 403)) {
    return { available: false, reason: unauthorizedReason, breaches: [] }
  }
  if (checkRateLimit && res.status === 429) {
    return { available: false, reason: 'rate_limited', breaches: [] }
  }
  if (!res.ok) {
    return { available: false, reason: `http_${res.status}`, breaches: [] }
  }
  return null
}

module.exports = { fetchSafe, networkErrorResult, commonErrorResult }
