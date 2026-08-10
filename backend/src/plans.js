'use strict'
/**
 * Planos por tenant.
 *
 * A tese econômica que define a divisão: **o ASM não gasta token de IA.** Ele
 * roda binários determinísticos (subfinder/httpx/nuclei) — o custo marginal de
 * um scan é CPU e banda. O agente de pentest, ao contrário, é o único
 * componente caro. Por isso o corte não é "o free escaneia menos", e sim "o
 * free escaneia, mas não põe o agente de IA para trabalhar".
 *
 * Consequência prática: a cadência de monitoramento é DIÁRIA nos dois planos.
 * Reduzir a cadência do free economizaria quase nada e destruiria justamente o
 * valor que traz o cliente de volta todo dia.
 *
 * Plain JS/CommonJS: exercitável por `node --test` sem toolchain.
 */

const PLANS = {
  free: {
    id: 'free',
    label: 'Free',
    // Monitoramento de superfície externa — a isca. Diário.
    rescanIntervalDays: 1,
    maxDomains: Number(process.env.PLAN_FREE_MAX_DOMAINS) || 3,
    // O agente de IA é o que se cobra.
    canRunPentest: false,
    canRunInternalNetwork: false,
    // Relatório resumido: contagem e severidade, SEM evidência, PoC, payload
    // ou recomendação detalhada — é o que se compra ao assinar.
    reportDetail: 'summary',
    canExportCsv: false,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    rescanIntervalDays: 1,
    maxDomains: Number(process.env.PLAN_PRO_MAX_DOMAINS) || 0,   // 0 = sem teto
    canRunPentest: true,
    canRunInternalNetwork: true,
    reportDetail: 'full',
    canExportCsv: true,
  },
  // A operação (Porttus) não tem teto — é quem entrega o serviço.
  internal: {
    id: 'internal',
    label: 'Interno',
    rescanIntervalDays: Number(process.env.ASM_RESCAN_INTERVAL_DAYS) || 7,
    maxDomains: 0,
    canRunPentest: true,
    canRunInternalNetwork: true,
    reportDetail: 'full',
    canExportCsv: true,
  },
}

const DEFAULT_PLAN = 'free'

/**
 * Plano efetivo de um tenant. **Fail-closed**: tenant sem plano reconhecido cai
 * no `free`, nunca no mais permissivo — um typo em `plan` não pode liberar o
 * agente de IA de graça.
 */
function planFor(tenant) {
  const id = tenant && tenant.plan
  return PLANS[id] || PLANS[DEFAULT_PLAN]
}

/** Uma capacidade específica do plano do tenant. */
function planAllows(tenant, capability) {
  const p = planFor(tenant)
  return p[capability] === true
}

/** Cadência de re-scan, em ms, para o asm-scheduler. */
function rescanIntervalMs(tenant) {
  return planFor(tenant).rescanIntervalDays * 24 * 60 * 60 * 1000
}

/**
 * Teto de domínios. `0` = sem teto. Devolve `{ allowed, limit, current }` para
 * a rota poder explicar o motivo em vez de só recusar.
 */
function canAddDomain(tenant, currentCount) {
  const { maxDomains } = planFor(tenant)
  if (!maxDomains) return { allowed: true, limit: 0, current: currentCount }
  return { allowed: currentCount < maxDomains, limit: maxDomains, current: currentCount }
}

module.exports = { PLANS, DEFAULT_PLAN, planFor, planAllows, rescanIntervalMs, canAddDomain }
