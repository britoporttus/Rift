'use strict'
// Fonte ÚNICA de verdade para "quantos findings existem".
//
// BUG (191 ≠ 44): o dashboard mostrava 191 (total via GET /api/findings, que
// devolvia TODOS os Finding docs do banco) enquanto a soma dos cards dava 44
// (campo `findingsCount` armazenado, defasado). O banco tinha 143 findings
// ÓRFÃOS — de 4 engagements já removidos (DVWA, Juice Shop, LorenIpsum, GDS4U),
// importados por scripts antigos — inflando o total global. Além disso não havia
// dedup (DISTINCT) por finding.
//
// Regras (as mesmas em dashboard, cards e tela de Findings):
//   1. Só conta findings de engagements que AINDA existem (sem órfãos).
//   2. Dedup: mesmo engagement + mesmo fingerprint = o mesmo finding (re-scan) →
//      conta uma vez. Findings sem fingerprint não são deduplicados (não dá para
//      afirmar que são iguais) — cada um conta.
//
// Plain CJS de propósito: puro e testável com `node --test`, sem toolchain extra.

function engIdOf(f) {
  return String(f.engagementId ?? f.engagement_id ?? '')
}

// Filtra órfãos (quando existingEngagementIds é fornecido) e deduplica por
// (engagementId, fingerprint). Preserva a ordem de entrada.
function cleanFindings(findings, existingEngagementIds = null) {
  const existing = existingEngagementIds
    ? new Set(existingEngagementIds.map(String))
    : null
  const seen = new Set()
  const out = []
  for (const f of findings || []) {
    const eid = engIdOf(f)
    if (existing && !existing.has(eid)) continue        // órfão → não conta
    const fp = f.fingerprint
    if (fp) {
      const key = `${eid}|${fp}`
      if (seen.has(key)) continue                        // duplicado real → 1×
      seen.add(key)
    }
    out.push(f)
  }
  return out
}

// Agregações derivadas do MESMO conjunto limpo — garante que total, soma por
// engagement e soma por severidade sempre batem.
function summarize(findings) {
  const bySeverity = {}
  const byEngagement = {}
  for (const f of findings || []) {
    const sev = (f.severity || 'info')
    bySeverity[sev] = (bySeverity[sev] || 0) + 1
    const eid = engIdOf(f)
    byEngagement[eid] = (byEngagement[eid] || 0) + 1
  }
  return { total: (findings || []).length, bySeverity, byEngagement }
}

module.exports = { cleanFindings, summarize }
