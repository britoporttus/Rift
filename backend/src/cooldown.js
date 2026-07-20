'use strict'
// P1-15 (auditoria 2026-07-20): sem rate-limit, qualquer usuário autenticado
// podia disparar buscas/scans repetidos no mesmo domínio sem cooldown — abuso
// de custo em provider pago (DeHashed/LeakCheck Pro) ou de recursos (scanner
// ASM). Ver docs/ROADMAP-AUDITORIA-2026-07-20.md.
//
// Puro e testável sem DB/Date.now mockado: recebe `now` explícito.
function cooldownRemainingMs(lastAt, cooldownMs, now = Date.now()) {
  if (!lastAt || !cooldownMs || cooldownMs <= 0) return 0
  const elapsed = now - new Date(lastAt).getTime()
  const remaining = cooldownMs - elapsed
  return remaining > 0 ? Math.ceil(remaining) : 0
}

// Só admin pode pular o cooldown, e só com `force:true` explícito no corpo —
// nunca implícito, pra não virar um jeito silencioso de sempre ignorar o gate.
function canForceCooldown(body, user) {
  return body?.force === true && user?.role === 'admin'
}

module.exports = { cooldownRemainingMs, canForceCooldown }
