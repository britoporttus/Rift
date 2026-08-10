const { test } = require('node:test')
const assert = require('node:assert')
const { gestorOverview, diretorOverview, postureTrend, kanbanBoard, isActionable, isOpen } = require('../src/overview')

const NOW = new Date('2026-08-10T12:00:00Z')
const past = (d) => new Date(NOW.getTime() - d * 86400000)
const future = (d) => new Date(NOW.getTime() + d * 86400000)

test('gestor: só achado acionável entra (observação informativa não conta)', () => {
  const findings = [
    { _id: '1', state: 'confirmed', severity: 'high', remediationStatus: 'open' },
    { _id: '2', state: 'informational', severity: 'low', remediationStatus: 'open' },
  ]
  const { metrics } = gestorOverview(findings, NOW)
  assert.equal(metrics.open, 1)
})

test('gestor: prazo estourado só conta achado aberto com dueDate no passado', () => {
  const findings = [
    { _id: '1', state: 'confirmed', severity: 'critical', remediationStatus: 'open', dueDate: past(3) },   // estourado
    { _id: '2', state: 'confirmed', severity: 'high', remediationStatus: 'in_progress', dueDate: future(5) }, // no prazo
    { _id: '3', state: 'confirmed', severity: 'high', remediationStatus: 'fixed', dueDate: past(10) },      // corrigido, não conta
  ]
  const { metrics } = gestorOverview(findings, NOW)
  assert.equal(metrics.overdue, 1)
  assert.equal(metrics.inProgress, 1)
})

test('gestor: fila ordena estourado primeiro, depois por severidade', () => {
  const findings = [
    { _id: 'a', state: 'confirmed', severity: 'low',      remediationStatus: 'open' },
    { _id: 'b', state: 'confirmed', severity: 'critical', remediationStatus: 'open', dueDate: past(1) }, // estourado
    { _id: 'c', state: 'confirmed', severity: 'high',     remediationStatus: 'open' },
  ]
  const { queue } = gestorOverview(findings, NOW)
  assert.equal(queue[0].id, 'b', 'estourado vem primeiro')
  assert.equal(queue[1].id, 'c', 'depois por severidade (high antes de low)')
})

test('gestor: tempo médio de correção usa o evento de fixed no histórico', () => {
  const findings = [{
    _id: '1', state: 'confirmed', severity: 'high', remediationStatus: 'fixed',
    firstSeen: past(10).toISOString(),
    statusHistory: [{ status: 'fixed', at: past(4) }],   // corrigido 6 dias após visto
  }]
  const { metrics } = gestorOverview(findings, NOW)
  assert.equal(metrics.avgFixDays, 6)
})

test('gestor: % dentro do prazo', () => {
  const findings = [
    { _id: '1', state: 'confirmed', severity: 'high', remediationStatus: 'fixed', dueDate: future(2), statusHistory: [{ status: 'fixed', at: past(1) }] }, // no prazo
    { _id: '2', state: 'confirmed', severity: 'high', remediationStatus: 'fixed', dueDate: past(5),  statusHistory: [{ status: 'fixed', at: past(1) }] }, // atrasado
  ]
  const { metrics } = gestorOverview(findings, NOW)
  assert.equal(metrics.onTimePct, 50)
})

test('diretor: postura = PIOR índice entre os domínios (elo mais fraco)', () => {
  const domains = [
    { domain: 'a.com', riskScore: 12 },
    { domain: 'b.com', riskScore: 68 },
    { domain: 'c.com', riskScore: 30 },
  ]
  const { posture } = diretorOverview(domains, [], NOW)
  assert.equal(posture.score, 68)
  assert.equal(posture.worstDomain, 'b.com')
  assert.equal(posture.level, 'high')
})

test('diretor: veredito destaca críticos em aberto', () => {
  const domains = [{ domain: 'a.com', riskScore: 40 }]
  const findings = [{ _id: '1', state: 'confirmed', severity: 'critical', remediationStatus: 'open' }]
  const { posture, kpis } = diretorOverview(domains, findings, NOW)
  assert.equal(kpis.criticalsOpen, 1)
  assert.match(posture.verdict, /crítica/)
})

test('diretor: ambiente limpo → veredito tranquilo', () => {
  const domains = [{ domain: 'a.com', riskScore: 8 }]
  const { posture } = diretorOverview(domains, [], NOW)
  assert.match(posture.verdict, /nenhuma exposição acionável/)
})

test('postureTrend: pior índice por dia, dentro da janela, cronológico', () => {
  const scans = [
    { ranAt: past(1), riskScore: 40 },
    { ranAt: past(1), riskScore: 68 },   // mesmo dia → fica o maior (68)
    { ranAt: past(3), riskScore: 20 },
    { ranAt: past(40), riskScore: 90 },  // fora da janela de 30 dias → ignora
  ]
  const t = postureTrend(scans, 30, NOW)
  assert.equal(t.length, 2)
  assert.equal(t[0].date < t[1].date, true, 'ordem cronológica')
  const day1 = t.find((p) => p.date === past(1).toISOString().slice(0, 10))
  assert.equal(day1.score, 68, 'pior índice do dia')
})

test('kanban: agrupa por coluna; regrediu cai em "aberto"; conta certo', () => {
  const findings = [
    { _id: '1', state: 'confirmed', severity: 'high', remediationStatus: 'open' },
    { _id: '2', state: 'confirmed', severity: 'critical', remediationStatus: 'in_progress' },
    { _id: '3', state: 'confirmed', severity: 'medium', remediationStatus: 'regressed' },   // → coluna open
    { _id: '4', state: 'confirmed', severity: 'low', remediationStatus: 'fixed' },
    { _id: '5', state: 'informational', severity: 'info', remediationStatus: 'open' },        // não acionável → fora
  ]
  const { columns, counts } = kanbanBoard(findings, NOW)
  assert.equal(counts.open, 2, 'open + regressed')
  assert.equal(counts.in_progress, 1)
  assert.equal(counts.fixed, 1)
  assert.ok(columns.open.some((c) => c.id === '3'), 'regrediu está na coluna aberto')
  assert.ok(!columns.open.some((c) => c.id === '5'), 'informativo não entra')
})

test('kanban: scope "mine" filtra pelo dono', () => {
  const findings = [
    { _id: '1', state: 'confirmed', severity: 'high', remediationStatus: 'in_progress', owner: 'Ana' },
    { _id: '2', state: 'confirmed', severity: 'high', remediationStatus: 'in_progress', owner: 'Beto' },
  ]
  const { counts } = kanbanBoard(findings, NOW, { ownerFilter: 'Ana' })
  assert.equal(counts.in_progress, 1)
})

test('isActionable / isOpen', () => {
  assert.ok(isActionable({ state: 'confirmed' }))
  assert.ok(!isActionable({ state: 'informational' }))
  assert.ok(isOpen({ remediationStatus: 'regressed' }))
  assert.ok(!isOpen({ remediationStatus: 'fixed' }))
})
