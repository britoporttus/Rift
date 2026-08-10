// P2-37 (auditoria 2026-07-20): computeScore (asm/score.js) e computeExposure
// (leaks/aggregate.js) são funções puras e isoladas, mas não tinham nenhum
// teste — exatamente o cálculo que vira o "score de risco" mostrado ao
// operador em Domínios/Vazamentos. Ver docs/ROADMAP-AUDITORIA-2026-07-20.md.
const { test } = require('node:test')
const assert = require('node:assert')
const { computeScore, levelFromScore } = require('../src/asm/score')
const { computeExposure, monthKey } = require('../src/leaks/aggregate')

// ── computeScore ────────────────────────────────────────────────────────────
test('computeScore: sem assets nem leaks → score 0, level info, sem reasons', () => {
  const r = computeScore({})
  assert.equal(r.score, 0)
  assert.equal(r.level, 'info')
  assert.deepEqual(r.reasons, [])
})

test('computeScore: leaks sem senha somam 4pts/leak até o teto de 30', () => {
  const r1 = computeScore({ leaks: [{}, {}] }) // 2 * 4 = 8
  assert.equal(r1.score, 8)
  const r2 = computeScore({ leaks: Array.from({ length: 20 }, () => ({})) }) // 20*4=80 → teto 30
  assert.equal(r2.score, 30)
})

test('computeScore: leaks COM senha somam pontos extras (6pts cada, teto 25)', () => {
  const r = computeScore({ leaks: [{ hasPassword: true }, { hasPassword: true }] })
  // 2 leaks (sem-senha-pts: 2*4=8) + 2 com senha (2*6=12) = 20
  assert.equal(r.score, 20)
  assert.ok(r.reasons.some((x) => /senha exposta/.test(x)))
})

test('computeScore: exposições (assets com severidade) aplicam o peso de SEV_WEIGHT', () => {
  const r = computeScore({ assets: [{ severity: 'critical', label: 'RCE' }, { severity: 'medium', value: 'x.com' }] })
  assert.equal(r.score, 40 + 12)
  assert.ok(r.reasons.some((x) => x.includes('RCE')))
})

test('computeScore: severidade "info" não pontua nem gera reason', () => {
  const r = computeScore({ assets: [{ severity: 'info', label: 'nada' }] })
  assert.equal(r.score, 0)
  assert.deepEqual(r.reasons, [])
})

test('computeScore: hosts vivos somam até o teto de 15', () => {
  // Só HOST web vivo (type:'subdomain' + alive) conta — porta tem alive:true mas
  // não é host (Bug 2 da Fase 2 de legibilidade). Daí o type nos fixtures.
  const r1 = computeScore({ assets: [{ type: 'subdomain', alive: true }] }) // floor(1/3)+2 = 2
  assert.equal(r1.score, 2)
  const r2 = computeScore({ assets: Array.from({ length: 50 }, () => ({ type: 'subdomain', alive: true })) }) // teto 15
  assert.equal(r2.score, 15)
})

test('computeScore: porta viva NÃO conta como host web vivo', () => {
  // 8 portas alive:true de 1 host não devem inflar o score como se fossem 8 hosts.
  const r = computeScore({ assets: [
    { type: 'subdomain', alive: true },
    ...Array.from({ length: 8 }, () => ({ type: 'port', alive: true })),
  ] })
  assert.equal(r.score, 2) // só o 1 host conta: floor(1/3)+2
})

test('computeScore: nunca passa de 100 mesmo somando todos os sinais no máximo', () => {
  const r = computeScore({
    leaks: Array.from({ length: 20 }, () => ({ hasPassword: true })), // 30+25=55
    assets: [
      ...Array.from({ length: 10 }, () => ({ severity: 'critical', label: 'x' })), // 10*40=400
      ...Array.from({ length: 50 }, () => ({ alive: true })), // 15
    ],
  })
  assert.equal(r.score, 100)
  assert.equal(r.level, 'critical')
})

test('computeScore: reasons truncado em 8 (não estoura a UI)', () => {
  const r = computeScore({ assets: Array.from({ length: 20 }, (_, i) => ({ severity: 'low', label: `exp-${i}` })) })
  assert.equal(r.reasons.length, 8)
})

test('levelFromScore: limites exatos', () => {
  assert.equal(levelFromScore(0), 'info')
  assert.equal(levelFromScore(1), 'low')
  assert.equal(levelFromScore(24), 'low')
  assert.equal(levelFromScore(25), 'medium')
  assert.equal(levelFromScore(49), 'medium')
  assert.equal(levelFromScore(50), 'high')
  assert.equal(levelFromScore(74), 'high')
  assert.equal(levelFromScore(75), 'critical')
  assert.equal(levelFromScore(100), 'critical')
})

// ── computeExposure / monthKey ───────────────────────────────────────────────
test('monthKey: extrai YYYY-MM de datas válidas, null para inválidas/ausentes', () => {
  assert.equal(monthKey('2024-03-15'), '2024-03')
  assert.equal(monthKey('2024-03'), '2024-03')
  assert.equal(monthKey(''), null)
  assert.equal(monthKey(null), null)
  assert.equal(monthKey('data-invalida'), null)
})

test('computeExposure: sem creds nem agg → tudo zerado, level info', () => {
  const r = computeExposure([], {})
  assert.deepEqual(r.metrics, { malwareCompromises: 0, leakedPasswords: 0, employeesAtRisk: 0, affectedUsers: 0, breachCount: 0 })
  assert.equal(r.riskLevel, 'info')
  assert.deepEqual(r.timeline, [])
  assert.deepEqual(r.stealerFamilies, [])
})

test('computeExposure: credenciais malware contam employeesAtRisk e malwareCompromises', () => {
  const creds = [
    { category: 'malware', account: 'a@x.com', stealerFamily: 'Redline', seenDate: '2024-01-10' },
    { category: 'malware', account: 'b@x.com', stealerFamily: 'Redline', seenDate: '2024-01-20' },
  ]
  const r = computeExposure(creds, {})
  assert.equal(r.metrics.malwareCompromises, 2)
  assert.equal(r.metrics.employeesAtRisk, 2)
  assert.equal(r.timeline.length, 1)
  assert.deepEqual(r.timeline[0], { month: '2024-01', count: 2 })
  assert.equal(r.stealerFamilies[0].name, 'Redline')
  assert.equal(r.stealerFamilies[0].count, 2)
  assert.equal(r.stealerFamilies[0].pct, 100)
})

test('computeExposure: breach (não-malware) conta breachCount distinto por breachName', () => {
  const creds = [
    { category: 'breach', account: 'a@x.com', breachName: 'Adobe' },
    { category: 'breach', account: 'b@x.com', breachName: 'Adobe' }, // mesmo breach, não duplica
    { category: 'breach', account: 'c@x.com', breachName: 'LinkedIn' },
  ]
  const r = computeExposure(creds, {})
  assert.equal(r.metrics.breachCount, 2) // Adobe + LinkedIn
  assert.equal(r.metrics.affectedUsers, 3) // 3 contas distintas
})

test('computeExposure: hasPassword conta leakedPasswords', () => {
  const creds = [
    { category: 'breach', account: 'a@x.com', hasPassword: true },
    { category: 'breach', account: 'b@x.com', hasPassword: false },
  ]
  const r = computeExposure(creds, {})
  assert.equal(r.metrics.leakedPasswords, 1)
})

test('computeExposure: agregado (agg) usa MAX com record-level, nunca soma (evita duplicar fontes sobrepostas)', () => {
  const creds = [{ category: 'malware', account: 'a@x.com', hasPassword: true }]
  const agg = { employees: 10, users: 5, malware: 3, hasPassword: true, found: 8 }
  const r = computeExposure(creds, agg)
  // employeesAtRisk = max(distinct(1), agg.employees=10, ...) = 10, não 1+10
  assert.equal(r.metrics.employeesAtRisk, 10)
  assert.equal(r.metrics.malwareCompromises, 3) // max(1 record, agg.malware=3)
})

test('computeExposure: famílias de stealer do agg.families entram via MAX, não soma', () => {
  const creds = [{ category: 'malware', account: 'a@x.com', stealerFamily: 'Vidar' }]
  const agg = { families: { Vidar: 5, Raccoon: 2 } }
  const r = computeExposure(creds, agg)
  const vidar = r.stealerFamilies.find((f) => f.name === 'Vidar')
  const raccoon = r.stealerFamilies.find((f) => f.name === 'Raccoon')
  assert.equal(vidar.count, 5) // max(1 do record, 5 do agg) — não 1+5=6
  assert.equal(raccoon.count, 2)
})

test('computeExposure: risco sobe com mais sinais (regressão de monotonicidade do score)', () => {
  const baixo = computeExposure([{ category: 'breach', account: 'a@x.com' }], {})
  const alto = computeExposure(
    Array.from({ length: 10 }, (_, i) => ({ category: 'malware', account: `u${i}@x.com`, hasPassword: true })),
    {}
  )
  assert.ok(alto.riskScore > baixo.riskScore)
})
