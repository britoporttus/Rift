'use strict'
// Desfecho de um run do agente — a fonte única de verdade do estado final.
//
// BUG (ETAPA 1.3): o server derivava `code === 0 ? 'completed' : 'stopped'`.
// Como `claude --print` sai com código 0 sempre que o TURNO do CLI termina (não
// quando o pentest termina), um run que parou antes de Vulnerabilidades — ou que
// foi RECUSADO pelo safeguard do modelo (que também sai 0) — aparecia como
// "concluído". Uma falha técnica jamais pode virar "concluído".
//
// As ÚNICAS saídas possíveis (reaproveitando os estados existentes + um novo
// 'failed' e um `stopReason` que explica o porquê):
//   completed              — concluiu de fato (alcançou a fase de Vulnerabilidades)
//   stopped  / operator    — parado pelo operador
//   stopped  / budget      — parado por teto de custo (limite de utilização)
//   stopped  / incomplete  — saiu limpo mas ANTES de cobrir Vulnerabilidades
//   stopped  / interrupted — processo morto sem causa conhecida (ex.: restart do backend)
//   failed   / safeguard   — modelo recusou por safeguard de cibersegurança
//   failed   / timeout     — tempo limite de execução atingido
//   failed   / error       — erro técnico explícito (código de erro real)
//
// Códigos de saída: 0 = limpo; 143 = SIGTERM, 137 = SIGKILL (término deliberado:
// stop/timeout/teto/shutdown — não são "erro" por si só).

// Fase obrigatória final: só é "concluído" quem chegou a testar vulnerabilidades.
const REQUIRED_FINAL_PHASE = 'vuln'

function deriveRunOutcome({
  code,
  operatorStopped = false,
  budgetExceeded = false,
  blockedBySafeguard = false,
  timedOut = false,
  phasesReached = [],
} = {}) {
  const reached = Array.isArray(phasesReached) ? phasesReached : []

  // Precedência: causas explícitas antes de interpretar o código de saída.
  if (operatorStopped)    return { runState: 'stopped', stopReason: 'operator' }
  if (budgetExceeded)     return { runState: 'stopped', stopReason: 'budget' }
  if (blockedBySafeguard) return { runState: 'failed',  stopReason: 'safeguard' }
  if (timedOut)           return { runState: 'failed',  stopReason: 'timeout' }

  const deliberateKill = code === 143 || code === 137
  // Código de erro real (nem limpo, nem kill deliberado) → falha técnica.
  if (code !== 0 && !deliberateKill) return { runState: 'failed', stopReason: 'error' }

  // Kill deliberado sem causa conhecida (não foi operador/teto/timeout) → interrompido.
  if (deliberateKill) return { runState: 'stopped', stopReason: 'interrupted' }

  // Saída limpa (code 0):
  //  - turno sem nenhuma fase (chat casual, relatório, intake) → concluído (nada a "completar").
  //  - alcançou Vulnerabilidades → concluído.
  //  - fez recon/enum mas NÃO chegou a Vulnerabilidades → parado (incompleto), nunca "concluído".
  if (reached.length === 0)                 return { runState: 'completed', stopReason: null }
  if (reached.includes(REQUIRED_FINAL_PHASE)) return { runState: 'completed', stopReason: null }
  return { runState: 'stopped', stopReason: 'incomplete' }
}

module.exports = { deriveRunOutcome, REQUIRED_FINAL_PHASE }
