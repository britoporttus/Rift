// Agregações das visões por papel (Fase 6) — puras, sem I/O, testáveis isoladas
// (mesmo espírito de asm/score.js, asm/diff.js, finding-lifecycle.js).
//
//   gestor  → "o que está sendo corrigido?" → fila por estado + métricas de correção
//   diretor → "meu ambiente está seguro?"   → veredito + tendência + 3 KPIs
//
// `now` é sempre injetado (nunca Date.now aqui) para manter pureza/determinismo.

const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info']
const OPEN_STATES = ['open', 'in_progress', 'regressed']  // ainda demandam ação

// Um achado "conta" para o gestor/diretor se é vulnerabilidade de fato ou indício
// acionável — não observação informativa. Espelha o `state` da taxonomia.
function isActionable(f) {
  return f.state === 'confirmed' || f.state === 'probable'
}

function isOpen(f) {
  const s = f.remediationStatus || 'open'
  return OPEN_STATES.includes(s)
}

function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

// ── Gestor ────────────────────────────────────────────────────────────────
// Retorna { metrics, queue }. `queue` = achados abertos ordenados por prazo
// (estourado primeiro) e severidade. `metrics` = os números do topo.
function gestorOverview(findings, now) {
  const act = findings.filter(isActionable)
  const open = act.filter(isOpen)

  // Backlog por severidade (só o que está aberto).
  const backlogBySev = {}
  for (const s of SEV_ORDER) backlogBySev[s] = 0
  for (const f of open) backlogBySev[f.severity] = (backlogBySev[f.severity] || 0) + 1

  // Prazo estourado = tem dueDate no passado e ainda está aberto.
  const overdue = open.filter((f) => f.dueDate && new Date(f.dueDate) < now)

  // Tempo médio de correção: para os que estão `fixed`, do firstSeen ao evento
  // de correção (último statusHistory com status fixed) — ou updatedAt como proxy.
  const fixed = act.filter((f) => (f.remediationStatus || '') === 'fixed')
  let avgFixDays = null
  if (fixed.length) {
    const spans = fixed.map((f) => {
      const start = f.firstSeen ? new Date(f.firstSeen) : (f.createdAt ? new Date(f.createdAt) : null)
      const fixEvt = (f.statusHistory || []).filter((h) => h.status === 'fixed').pop()
      const end = fixEvt ? new Date(fixEvt.at) : (f.updatedAt ? new Date(f.updatedAt) : null)
      return start && end ? Math.max(0, daysBetween(start, end)) : null
    }).filter((n) => n != null)
    if (spans.length) avgFixDays = Math.round(spans.reduce((a, b) => a + b, 0) / spans.length)
  }

  // % dentro do prazo: dos fixed que tinham dueDate, quantos foram corrigidos antes.
  const fixedWithDue = fixed.filter((f) => f.dueDate)
  let onTimePct = null
  if (fixedWithDue.length) {
    const onTime = fixedWithDue.filter((f) => {
      const fixEvt = (f.statusHistory || []).filter((h) => h.status === 'fixed').pop()
      const end = fixEvt ? new Date(fixEvt.at) : (f.updatedAt ? new Date(f.updatedAt) : now)
      return end <= new Date(f.dueDate)
    })
    onTimePct = Math.round((onTime.length / fixedWithDue.length) * 100)
  }

  const queue = open
    .map((f) => ({
      id: f._id || f.id,
      title: f.title,
      severity: f.severity,
      engagementId: f.engagementId,
      engagementName: f.engagementName,
      location: f.location || null,   // onde: endpoint/URL/parâmetro
      target: null,                    // preenchido pelo endpoint (Engagement.target)
      remediationStatus: f.remediationStatus || 'open',
      owner: f.owner || null,
      dueDate: f.dueDate || null,
      overdue: !!(f.dueDate && new Date(f.dueDate) < now),
    }))
    .sort((a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) ||
      (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity))

  return {
    metrics: {
      open: open.length,
      inProgress: open.filter((f) => f.remediationStatus === 'in_progress').length,
      overdue: overdue.length,
      avgFixDays,
      onTimePct,
      backlogBySev,
    },
    queue,
  }
}

// ── Diretor ───────────────────────────────────────────────────────────────
// Uma tela: veredito (postura), tendência (série do índice) e 3 KPIs.
// `domains` traz o riskScore por domínio; `findings` dá o recorte acionável.
function diretorOverview(domains, findings, now) {
  const act = findings.filter(isActionable)
  const open = act.filter(isOpen)

  // Postura geral = pior índice de exposição entre os domínios (o elo mais fraco
  // define a segurança percebida). Média enganaria com muitos domínios seguros.
  const scores = domains.map((d) => d.riskScore || 0)
  const worst = scores.length ? Math.max(...scores) : 0
  const worstDomain = domains.find((d) => (d.riskScore || 0) === worst)
  const level = worst >= 75 ? 'critical' : worst >= 50 ? 'high' : worst >= 25 ? 'medium' : worst > 0 ? 'low' : 'info'
  const lvlOf = (s) => s >= 75 ? 'critical' : s >= 50 ? 'high' : s >= 25 ? 'medium' : s > 0 ? 'low' : 'info'

  // "Onde o risco está": os domínios mais expostos, com id para navegar. É a
  // resposta explícita ao "de qual domínio é isso?" na tela do diretor.
  const hotspots = domains
    .filter((d) => (d.riskScore || 0) > 0)
    .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))
    .slice(0, 5)
    .map((d) => ({ id: d._id, domain: d.domain, score: d.riskScore || 0, level: lvlOf(d.riskScore || 0) }))

  // Veredito em uma frase — a resposta a "meu ambiente está seguro?".
  const criticalsOpen = open.filter((f) => f.severity === 'critical').length
  let verdict
  if (criticalsOpen > 0) verdict = `${criticalsOpen} exposição(ões) crítica(s) em aberto — requer atenção`
  else if (level === 'high' || level === 'critical') verdict = 'exposição elevada — correções em andamento'
  else if (open.length > 0) verdict = 'sob controle — sem críticos em aberto'
  else verdict = 'nenhuma exposição acionável em aberto'

  return {
    posture: {
      score: worst, level, verdict,
      worstDomain: worstDomain ? worstDomain.domain : null,
      worstDomainId: worstDomain ? worstDomain._id : null,
    },
    hotspots,
    kpis: {
      criticalsOpen,
      inProgress: open.filter((f) => f.remediationStatus === 'in_progress').length,
      overdue: open.filter((f) => f.dueDate && new Date(f.dueDate) < now).length,
    },
    domainCount: domains.length,
  }
}

// Tendência de POSTURA: pior índice de exposição por dia, nos últimos `days`.
// Fonte = DomainScan (1 registro por scan). Um dia = o maior riskScore de
// qualquer domínio naquele dia (o elo mais fraco define a postura). Retorna
// pontos { date: 'YYYY-MM-DD', score } em ordem cronológica. `now` injetado.
function postureTrend(scans, days, now) {
  const cutoff = new Date(now.getTime() - days * 86400000)
  const byDay = new Map()
  for (const s of scans) {
    const ranAt = s.ranAt ? new Date(s.ranAt) : null
    if (!ranAt || ranAt < cutoff) continue
    const day = ranAt.toISOString().slice(0, 10)
    const cur = byDay.get(day) || 0
    byDay.set(day, Math.max(cur, s.riskScore || 0))
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, score]) => ({ date, score }))
}

// ── Kanban de correção (evolução das Fases 5+6) ─────────────────────────────
// Achados acionáveis agrupados por estado de remediação, para um quadro estilo
// Azure DevOps. `ownerFilter` (opcional) = só os do técnico. Cards ordenados por
// prazo estourado, depois severidade. Colunas seguem REMEDIATION_STATES úteis.
const BOARD_COLUMNS = ['open', 'in_progress', 'fixed', 'accepted_risk']

function kanbanBoard(findings, now, { ownerFilter = null } = {}) {
  const act = findings.filter(isActionable).filter((f) => !ownerFilter || f.owner === ownerFilter)
  const card = (f) => ({
    id: f._id || f.id,
    title: f.title,
    severity: f.severity,
    engagementId: f.engagementId,
    engagementName: f.engagementName,
    target: null,        // preenchido pelo endpoint
    location: f.location || null,
    remediationStatus: f.remediationStatus || 'open',
    owner: f.owner || null,
    dueDate: f.dueDate || null,
    overdue: !!(f.dueDate && new Date(f.dueDate) < now && isOpen(f)),
  })
  const sortCards = (arr) => arr.sort((a, b) =>
    Number(b.overdue) - Number(a.overdue) ||
    SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) ||
    (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity))

  const columns = {}
  for (const col of BOARD_COLUMNS) columns[col] = []
  for (const f of act) {
    const st = f.remediationStatus || 'open'
    // `regressed` mora na coluna "Aberto" (é acionável), mas o card guarda o
    // status real para exibir o selo "regrediu".
    const col = st === 'regressed' ? 'open' : (BOARD_COLUMNS.includes(st) ? st : 'open')
    columns[col].push(card(f))
  }
  for (const col of BOARD_COLUMNS) sortCards(columns[col])
  return { columns, counts: Object.fromEntries(BOARD_COLUMNS.map((c) => [c, columns[c].length])) }
}

module.exports = { gestorOverview, diretorOverview, postureTrend, kanbanBoard, isActionable, isOpen, OPEN_STATES, SEV_ORDER, BOARD_COLUMNS }
