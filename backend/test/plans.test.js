// Planos por tenant. A tese econômica: o ASM roda binários determinísticos e
// NÃO gasta token de IA — o custo marginal é CPU. O agente de pentest é o único
// componente caro. Por isso o corte não é "o free escaneia menos", e sim "o
// free não põe o agente de IA para trabalhar".
const { test } = require('node:test')
const assert = require('node:assert')
const { planFor, planAllows, rescanIntervalMs, canAddDomain, PLANS } = require('../src/plans')

const DIA = 24 * 60 * 60 * 1000

test('free e pro têm a MESMA cadência diária (o corte não é a frequência)', () => {
  assert.equal(rescanIntervalMs({ plan: 'free' }), DIA)
  assert.equal(rescanIntervalMs({ plan: 'pro' }), DIA)
})

test('o que separa os planos é o agente de IA, não o monitoramento', () => {
  assert.equal(planAllows({ plan: 'free' }, 'canRunPentest'), false)
  assert.equal(planAllows({ plan: 'pro' }, 'canRunPentest'), true)
  assert.equal(planAllows({ plan: 'internal' }, 'canRunPentest'), true)
})

test('free recebe relatório resumido; pro e interno, completo', () => {
  assert.equal(planFor({ plan: 'free' }).reportDetail, 'summary')
  assert.equal(planFor({ plan: 'pro' }).reportDetail, 'full')
  assert.equal(planFor({ plan: 'internal' }).reportDetail, 'full')
})

// ── fail-closed ─────────────────────────────────────────────────────────────

test('plano desconhecido cai em FREE, nunca no mais permissivo', () => {
  for (const t of [{ plan: 'enterprise' }, { plan: 'PRO' }, { plan: '' }, { plan: null }, {}, null, undefined]) {
    const p = planFor(t)
    assert.equal(p.id, 'free', `${JSON.stringify(t)} deveria cair em free`)
    assert.equal(p.canRunPentest, false, 'um typo em `plan` não pode liberar o agente de graça')
  }
})

test('planAllows é falso para capacidade inexistente', () => {
  assert.equal(planAllows({ plan: 'pro' }, 'capacidadeQueNaoExiste'), false)
})

// ── teto de domínios ────────────────────────────────────────────────────────

test('free tem teto de domínios e explica o limite', () => {
  const limite = PLANS.free.maxDomains
  assert.deepEqual(canAddDomain({ plan: 'free' }, limite - 1), { allowed: true, limit: limite, current: limite - 1 })
  assert.equal(canAddDomain({ plan: 'free' }, limite).allowed, false)
  assert.equal(canAddDomain({ plan: 'free' }, limite + 5).allowed, false)
})

test('pro e interno não têm teto (maxDomains 0 = ilimitado)', () => {
  assert.equal(canAddDomain({ plan: 'pro' }, 9999).allowed, true)
  assert.equal(canAddDomain({ plan: 'internal' }, 9999).allowed, true)
})

test('tenant sem plano herda o teto do free (não vira ilimitado)', () => {
  assert.equal(canAddDomain({}, 999).allowed, false)
})
