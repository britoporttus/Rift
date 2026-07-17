'use strict'
// ── Cofre de credenciais EFÊMERO (ETAPA 1 multi-domínio) ───────────────────────
// Decisão do operador (2026-07-17): credenciais de domínios autenticados (Azure/AD/
// SAP) NÃO são persistidas. Nada em repouso — nem no disco, nem no Mongo, nem em log.
// O operador informa a credencial por-run; ela vive SÓ na memória deste processo e é
// descartada ao fim do run (ou por TTL, backstop p/ sessões abandonadas).
//
// CONTRATO DURO (não quebrar):
//   - Este módulo NÃO importa fs, nem mongoose, nem escreve em disco. De propósito.
//   - Os VALORES das credenciais nunca são logados nem serializados p/ resposta HTTP.
//     Use describe() para expor apenas METADADOS (quais campos estão setados).
//   - Trade-off aceito: sem credencial persistida ⇒ SEM run agendado/headless
//     autenticado. Packs autenticados só rodam em modo interativo, com o operador
//     fornecendo a credencial na hora.
//
// Chave (key): identificador do run/sessão que o caller escolhe (ex.: `${engId}:${sessionId}`
// ou o runnerKey do agent-runner). O escopo é por-run — não por-engagement persistente.

// TTL backstop: se um run for abandonado sem clear(), a credencial expira e some.
const TTL_MS = Number(process.env.CRED_VAULT_TTL_MS) || 2 * 60 * 60 * 1000 // 2h

// store: key -> { creds: object, expiresAt: number }. SÓ em memória deste processo.
const store = new Map()

// Sweep periódico dos expirados (evita reter credencial de run abandonado).
// unref → não segura o event loop / não impede o processo de encerrar.
const sweep = setInterval(() => {
  const now = Date.now()
  for (const [k, v] of store) if (now >= v.expiresAt) wipe(k)
}, Math.min(TTL_MS, 5 * 60 * 1000))
if (sweep.unref) sweep.unref()

// Zera os valores antes de remover (não deixa a credencial "vazar" por referência
// pendurada até o GC). Best-effort — objetos congelados são apenas descartados.
function wipe(key) {
  const v = store.get(key)
  if (v && v.creds && typeof v.creds === 'object') {
    try { for (const k of Object.keys(v.creds)) v.creds[k] = null } catch { /* frozen */ }
  }
  store.delete(key)
}

// Guarda a credencial deste run em memória. Substitui qualquer credencial anterior
// da mesma key. `creds` é um objeto de campos (ex.: { tenantId, clientId, clientSecret }).
function set(key, creds, ttlMs = TTL_MS) {
  if (!key || !creds || typeof creds !== 'object') throw new Error('cred-vault.set: key e creds (objeto) obrigatórios')
  store.set(String(key), { creds: { ...creds }, expiresAt: Date.now() + ttlMs })
}

// Recupera a credencial (ou null se ausente/expirada). Só chamada no momento de
// injetar no processo do run — nunca numa resposta HTTP.
function get(key) {
  const v = store.get(String(key))
  if (!v) return null
  if (Date.now() >= v.expiresAt) { wipe(String(key)); return null }
  return v.creds
}

function has(key) {
  return get(key) != null
}

// Descarta a credencial deste run (chamar no onClose do run). Idempotente.
function clear(key) {
  wipe(String(key))
}

// Metadados SEGUROS p/ UI/log: quais campos estão setados e quando expira — NUNCA
// os valores. Retorna null se não há credencial.
function describe(key) {
  const v = store.get(String(key))
  if (!v || Date.now() >= v.expiresAt) return null
  return { fields: Object.keys(v.creds), expiresAt: v.expiresAt }
}

// Só para testes/shutdown — limpa tudo.
function _clearAll() {
  for (const k of [...store.keys()]) wipe(k)
}

module.exports = { set, get, has, clear, describe, _clearAll, TTL_MS }
