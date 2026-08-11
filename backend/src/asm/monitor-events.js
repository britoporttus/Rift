// Monitoramento risk-triggered (#2b) — deriva EVENTOS notáveis de um scan, puro
// e testável (mesmo espírito de diff.js/score.js). O scheduler já re-escaneia por
// tempo; aqui transformamos "o que mudou" em sinais acionáveis: novo subdomínio,
// nova exposição alta/crítica, novo CVE, piora de score, candidato a takeover.
//
// Cada evento: { type, severity, title, detail, at }. `severity` reaproveita a
// escala do produto (critical..info) para a UI ordenar/colorir sem tradução.

const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 }

// `score_worsened` só dispara acima deste salto — ruído de ±1 não é evento.
const SCORE_JUMP = 8

// Deriva eventos comparando o estado ANTERIOR com o ATUAL de um domínio.
//   diff            = saída de computeAssetDiff (newAssets[], newHostCount, …)
//   currentAssets   = DomainAsset[] após o scan
//   previousAssets  = DomainAsset[] antes (p/ detectar CVE/exposição realmente nova)
//   previousScore/score, now (Date, injetado)
function deriveMonitorEvents({ diff = {}, currentAssets = [], previousAssets = [], previousScore = 0, score = 0, now = new Date() } = {}) {
  const events = []
  const prevFp = new Set(previousAssets.map((a) => a.fingerprint).filter(Boolean))
  const isNew = (a) => a.fingerprint && !prevFp.has(a.fingerprint)

  // 1) Novos subdomínios (superfície cresceu) — só quando há baseline (não é o
  //    1º scan, senão "tudo é novo" e o evento seria ruído).
  const newHosts = (diff.newHostCount || 0)
  if (newHosts > 0 && previousAssets.length > 0) {
    const examples = (diff.newAssets || []).filter((a) => a.type === 'subdomain').map((a) => a.value)
    events.push({
      type: 'new_subdomain',
      severity: 'info',
      title: `${newHosts} novo(s) subdomínio(s)`,
      detail: examples.slice(0, 5).join(', ') || null,
    })
  }

  // 2) Novas exposições alta/crítica (nuclei/probe classificou) — o sinal mais forte.
  const newExposures = currentAssets.filter((a) => a.type === 'exposure' && isNew(a) && SEV_RANK[a.severity] >= SEV_RANK.high)
  for (const e of newExposures) {
    events.push({
      type: 'new_exposure',
      severity: e.severity,
      title: `Nova exposição ${e.severity === 'critical' ? 'crítica' : 'alta'}: ${e.label || e.value}`,
      detail: e.value || null,
    })
  }

  // 3) Novos CVEs (asset com cveId inédito).
  const newCves = currentAssets.filter((a) => a.cveId && isNew(a))
  const cveIds = [...new Set(newCves.map((a) => a.cveId))]
  if (cveIds.length) {
    const worst = newCves.reduce((m, a) => SEV_RANK[a.severity] > SEV_RANK[m] ? a.severity : m, 'info')
    events.push({
      type: 'new_cve',
      severity: worst,
      title: `${cveIds.length} novo(s) CVE(s) detectado(s)`,
      detail: cveIds.slice(0, 5).join(', '),
    })
  }

  // 4) Candidato a subdomain takeover (exposição do tipo takeover, nova).
  const takeovers = currentAssets.filter((a) => a.type === 'exposure' && isNew(a) && /takeover/i.test(a.source || a.label || ''))
  for (const t of takeovers) {
    events.push({ type: 'takeover_candidate', severity: t.severity || 'high', title: `Candidato a takeover: ${t.value}`, detail: t.cname || null })
  }

  // 5) Piora relevante de score (exposição aumentou).
  const delta = (score || 0) - (previousScore || 0)
  if (delta >= SCORE_JUMP) {
    events.push({
      type: 'score_worsened',
      severity: delta >= 20 ? 'high' : 'medium',
      title: `Índice de exposição subiu ${delta} ponto(s)`,
      detail: `de ${previousScore} para ${score}`,
    })
  }

  return events.map((e) => ({ ...e, at: now }))
}

// A "temperatura" do domínio decide a cadência risk-triggered: um domínio que
// gerou evento alto/crítico recente é re-escaneado mais cedo. Puro/testável.
function hottestSeverity(events) {
  return events.reduce((m, e) => SEV_RANK[e.severity] > SEV_RANK[m] ? e.severity : m, 'info')
}

module.exports = { deriveMonitorEvents, hottestSeverity, SEV_RANK, SCORE_JUMP }
