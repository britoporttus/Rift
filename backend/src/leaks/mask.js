// Mascara a conta (LGPD): joao.silva@x.com → j******a@x.com. Fonte única —
// usada ao persistir qualquer credencial vazada (senha nunca é armazenada).
function maskAccount(acct) {
  if (!acct || typeof acct !== 'string') return acct || null
  const at = acct.indexOf('@')
  if (at <= 0) return acct[0] + '***'
  const local = acct.slice(0, at), dom = acct.slice(at)
  const masked = local.length <= 2 ? local[0] + '*' : local[0] + '*'.repeat(Math.max(1, local.length - 2)) + local[local.length - 1]
  return masked + dom
}

// Remove campos internos que nunca devem chegar ao cliente. `fingerprint` é
// um hash de dedup (ver buildFingerprint em leaks/search.js) — não deveria
// carregar PII, mas mesmo assim não faz sentido expor esse detalhe de
// implementação via API. Ponto único de saída para qualquer rota que devolva
// um documento de LeakedCredential.
function sanitizeCredential(doc) {
  if (!doc || typeof doc !== 'object') return doc
  const { fingerprint, __v, ...rest } = doc
  return rest
}

module.exports = { maskAccount, sanitizeCredential }
