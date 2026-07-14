'use strict'
// Classificação de findings nas 5 DIMENSÕES independentes (ETAPA 5.2).
//
// BUG: FindingsReport lia `f.finding_type` — campo que a API NUNCA devolveu — então
// todo finding caía no default 'weakness' (a tela mostrava "0 vulnerabilidades / 11
// fraquezas / 0 observações"). A classificação real vem da TAXONOMIA (`state`) +
// `severity` + `reproducible`, todos expostos pelo DTO.
//
// As dimensões são INDEPENDENTES (não devem compartilhar cor/eixo):
//   1. Tipo         — o que É: vulnerabilidade / fraqueza / observação
//   2. Severidade   — critical/high/medium/low/info (fonte: severity)
//   3. Status       — remediação: open/fixed/accepted_risk/regressed
//   4. Confirmação  — validação: confirmed/probable/unvalidated/false_positive
//   5. Exploração   — untested/not_exploitable/potential/confirmed

// Tipo: confirmado = vulnerabilidade; info/ruled-out = observação; resto = fraqueza.
function findingType(f) {
  const state = String(f.state || '').toLowerCase()
  const sev = String(f.severity || 'info').toLowerCase()
  if (state === 'confirmed') return 'vulnerability'
  if (state === 'false_positive') return 'observation'
  if (state === 'informational' || sev === 'info') return 'observation'
  return 'weakness' // probable ou legado com severidade
}

// Confirmação: espelha o `state` da taxonomia.
function findingConfirmation(f) {
  const state = String(f.state || '').toLowerCase()
  if (state === 'confirmed') return 'confirmed'
  if (state === 'probable') return 'probable'
  if (state === 'false_positive') return 'false_positive'
  return 'unvalidated' // informational / sem state
}

// Exploração: usa APENAS o sinal real `reproducible` (+ probable como "potencial").
// Não deriva de "confirmed" — um achado pode ser confirmado (existe) e ainda assim
// não-explorável (ex.: exposição informativa).
function findingExploitation(f) {
  if (f.reproducible === true) return 'confirmed'
  if (f.reproducible === false) return 'not_exploitable'
  if (String(f.state || '').toLowerCase() === 'probable') return 'potential'
  return 'untested'
}

// CVSS: "calculado" quando há vetor CVSS; "estimado" quando só há a nota; senão nenhum.
function cvssKind(f) {
  if (f.cvss == null) return null
  return f.cvssVector ? 'calculated' : 'estimated'
}

module.exports = { findingType, findingConfirmation, findingExploitation, cvssKind }
