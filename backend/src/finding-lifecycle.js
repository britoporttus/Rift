// Ciclo de vida do achado (Fase 5 do roadmap de legibilidade) — lógica pura,
// sem I/O, no mesmo espírito de asm/score.js e asm/diff.js (testável isolada).
//
// O operador é dono do `remediationStatus`; o scanner só detecta regressão
// (fixed → regressed) na re-ingestão. A regra que não pode quebrar: um achado
// tratado (fixed/accepted_risk) não é ressuscitado por re-scan.

const REMEDIATION_STATES = ['open', 'in_progress', 'fixed', 'regressed', 'accepted_risk']

// Rótulo humano por estado (pt-BR) — a UI e o gestor leem isto, não o enum.
const STATUS_LABEL = {
  open:          'Aberto',
  in_progress:   'Em correção',
  fixed:         'Corrigido',
  regressed:     'Regrediu',
  accepted_risk: 'Risco aceito',
}

// Transições que o OPERADOR pode fazer a partir de cada estado. `regressed` só o
// sistema atribui (na re-ingestão) — o operador o trata como um "aberto" de novo.
const ALLOWED_TRANSITIONS = {
  open:          ['in_progress', 'fixed', 'accepted_risk'],
  in_progress:   ['fixed', 'accepted_risk', 'open'],
  fixed:         ['open', 'accepted_risk'],          // reabrir manualmente, se preciso
  regressed:     ['in_progress', 'fixed', 'accepted_risk'],
  accepted_risk: ['open', 'in_progress'],
}

// SLA padrão (dias) por severidade — deriva o prazo quando o operador não
// informa um. Números conservadores; sobrescrevíveis por `dueDate` explícito.
const SLA_DAYS = { critical: 7, high: 15, medium: 30, low: 60, info: 90 }

function slaDaysFor(severity) {
  return SLA_DAYS[String(severity || 'info').toLowerCase()] ?? SLA_DAYS.info
}

// Prazo padrão a partir de `from` (Date) e da severidade. `from` é injetado
// (nunca chama Date.now aqui) para manter a função pura e testável.
function defaultDueDate(severity, from) {
  const base = from instanceof Date ? from : new Date(from)
  const d = new Date(base)
  d.setDate(d.getDate() + slaDaysFor(severity))
  return d
}

function canTransition(fromStatus, toStatus) {
  if (!REMEDIATION_STATES.includes(toStatus)) return false
  const from = REMEDIATION_STATES.includes(fromStatus) ? fromStatus : 'open'
  if (from === toStatus) return false
  return (ALLOWED_TRANSITIONS[from] || []).includes(toStatus)
}

// Um achado tratado (fixed/accepted_risk) que o scanner volta a ver:
//   fixed → regressed (voltou a existir; não é "reaberto", é regressão)
//   accepted_risk → mantém (o operador aceitou o risco; não incomodar)
//   os demais mantêm o estado atual (o operador manda).
// Retorna { status, historyEntry|null }. `at` é injetado (pureza).
function reingestTransition(currentStatus, at, fileStatus) {
  if (currentStatus == null) {
    return { status: REMEDIATION_STATES.includes(fileStatus) ? fileStatus : 'open', historyEntry: null }
  }
  if (currentStatus === 'fixed') {
    return { status: 'regressed', historyEntry: { status: 'regressed', at, by: 'sistema', note: 'reapareceu no re-scan' } }
  }
  return { status: currentStatus, historyEntry: null }
}

module.exports = {
  REMEDIATION_STATES, STATUS_LABEL, ALLOWED_TRANSITIONS, SLA_DAYS,
  slaDaysFor, defaultDueDate, canTransition, reingestTransition,
}
