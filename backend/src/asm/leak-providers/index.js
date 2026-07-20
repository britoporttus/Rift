// Registro dos providers de vazamento e orquestração da busca por domínio.
//
// Fontes REAIS (rodam de verdade):
//   • leakcheck_public — grátis, keyless, agregado por domínio (roda SEMPRE; é
//     "fato de exposição" público, não expõe dado pessoal → sem gate legal).
//   • hibp / dehashed  — record-level (needsKey); só em domínio AUTORIZADO
//     (contrato/onboarding) — insight legal do conselho.
// mock (demo/sintético) é FALLBACK: só roda quando NENHUMA fonte real respondeu
// (ex.: rede caiu), para a UI não ficar vazia — e é claramente rotulado.
const mock = require('./mock')
const leakcheckPublic = require('./leakcheck-public')
const leakcheckPro = require('./leakcheck-pro')
const hibp = require('./hibp')
const dehashed = require('./dehashed')
const { getLeakProviderCreds, isLeakProviderConfigured } = require('../../settings')

const REAL = [leakcheckPublic, leakcheckPro, hibp, dehashed]
const ALL = [leakcheckPublic, leakcheckPro, hibp, dehashed, mock]
const byId = Object.fromEntries(ALL.map((p) => [p.id, p]))

// Catálogo para a UI (sem segredos).
function listProviders() {
  return [
    { id: leakcheckPublic.id, label: leakcheckPublic.label, needsKey: false, configured: true, real: true },
    { id: leakcheckPro.id, label: leakcheckPro.label, needsKey: true, configured: isLeakProviderConfigured('leakcheck'), real: true },
    { id: hibp.id,     label: hibp.label,     needsKey: true, configured: isLeakProviderConfigured('hibp'),     real: true },
    { id: dehashed.id, label: dehashed.label, needsKey: true, configured: isLeakProviderConfigured('dehashed'), real: true },
    { id: 'hudsonrock', label: 'Hudson Rock (navegador)', needsKey: false, configured: true, real: true, clientSide: true },
    { id: mock.id,     label: 'Demo (fallback)', needsKey: false, configured: true, real: false },
  ]
}

// Roda a checagem em todas as fontes aplicáveis.
// Retorna { breaches:[{provider,...}], providers:[report], aggregate:{found,hasPassword,stealer,sources} }.
async function runLeakCheck(domain, { authorized } = {}) {
  const report = []
  const breaches = []
  const aggregate = { found: 0, hasPassword: false, stealer: false, sources: [] }
  let realRan = 0

  for (const p of REAL) {
    if (p.needsKey && !authorized) { report.push({ id: p.id, ran: false, reason: 'domain_not_authorized' }); continue }
    if (p.needsKey && !isLeakProviderConfigured(p.id)) { report.push({ id: p.id, ran: false, reason: 'no_api_key' }); continue }
    try {
      const creds = p.needsKey ? getLeakProviderCreds(p.id) : {}
      const r = await p.search(domain, creds)
      const found = (r.breaches || []).map((b) => ({ ...b, provider: p.id }))
      breaches.push(...found)
      if (r.aggregate) {
        aggregate.found += r.aggregate.found || 0
        aggregate.hasPassword = aggregate.hasPassword || !!r.aggregate.hasPassword
        aggregate.stealer = aggregate.stealer || !!r.aggregate.stealer
        aggregate.sources.push(...(r.aggregate.sources || []))
      }
      const ok = r.available !== false
      if (ok) realRan++
      report.push({ id: p.id, ran: true, available: ok, reason: r.reason || null, count: found.length })
    } catch (err) {
      report.push({ id: p.id, ran: true, available: false, reason: `error: ${err.message}`, count: 0 })
    }
  }

  // Fallback demo — só se NENHUMA fonte real respondeu (não quando o real deu 0).
  if (realRan === 0) {
    try {
      const r = await mock.search(domain)
      breaches.push(...(r.breaches || []).map((b) => ({ ...b, provider: mock.id })))
      report.push({ id: mock.id, ran: true, available: true, reason: 'fallback_no_real_source', count: (r.breaches || []).length })
    } catch { /* noop */ }
  }

  aggregate.sources = [...new Set(aggregate.sources)]
  return { breaches, providers: report, aggregate }
}

module.exports = { listProviders, runLeakCheck, byId }
