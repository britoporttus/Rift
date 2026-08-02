// Serviço de busca de exposição (módulo Vazamentos). Orquestra os providers,
// persiste as credenciais (mascaradas), computa o assessment e atualiza o resumo.
// Gate legal (insight do conselho): fontes REAIS record-level (HIBP/DeHashed) só
// rodam se o domínio estiver REGISTRADO E AUTORIZADO no módulo Domínios; LeakCheck
// público (agregado) roda sempre. Conecta os dois módulos pela string de domínio.
const crypto = require('crypto')
const Domain = require('../models/Domain')
const LeakDomain = require('../models/LeakDomain')
const LeakedCredential = require('../models/LeakedCredential')
const { runLeakCheck } = require('../asm/leak-providers')
const { computeExposure } = require('./aggregate')
const { maskAccount, sanitizeCredential } = require('./mask')
const { isIpLiteral } = require('../net-guard')

// Mesma validação de `api/domains.js` (rejeita literal de IP) — mantida local
// porque os dois módulos evoluem por rotas de API distintas, mas ambos usam
// `net-guard` como fonte única do que conta como "IP, não domínio".
function normalizeDomain(raw) {
  if (!raw || typeof raw !== 'string') return null
  let d = raw.trim().toLowerCase()
  d = d.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].replace(/^www\./, '').replace(/\.$/, '')
  if (isIpLiteral(d)) return null
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) return null
  return d
}

// Hash de dedup — NUNCA texto claro. Antes disso o fingerprint era a string
// composta com `b.account` cru embutido, e como o upsert não regravava esse
// campo no `$set`, o Mongo persistia o e-mail original (via o filtro) mesmo
// com `account` mascarado no resto do documento — vazamento de PII (P0-2 da
// auditoria 2026-07-20). O hash fecha esse vetor: irreversível, mas ainda
// determinístico p/ dedup.
function buildFingerprint(domain, b) {
  const raw = `${domain}:${b.provider}:${b.category || 'breach'}:${b.account || '?'}:${b.sourceUrl || b.breachName || '?'}:${b.seenDate || ''}`
  return crypto.createHash('sha256').update(raw).digest('hex')
}

// Persiste um conjunto de "breaches" (de qualquer origem: providers ou ingestão
// externa) e recomputa/salva o assessment. Reutilizado por runSearch e por ingest.
async function persistResults(domain, { breaches = [], aggregate = null, extra = null, providerIds = [], userName, domainId } = {}) {
  const now = new Date()
  for (const b of breaches) {
    const account = maskAccount(b.account)
    const fp = buildFingerprint(domain, b)
    const set = {
      domain, domainId: domainId || null, category: b.category || 'breach', provider: b.provider, account,
      breachName: b.breachName || null, breachTitle: b.breachTitle || null, breachDate: b.breachDate || null,
      addedDate: b.addedDate || null, pwnCount: b.pwnCount ?? null, dataClasses: b.dataClasses || [],
      hasPassword: !!b.hasPassword, sourceUrl: b.sourceUrl || null, stealerFamily: b.stealerFamily || null,
      seenDate: b.seenDate || null, description: b.description || null,
      severity: (b.category === 'malware' || b.hasPassword) ? 'high' : 'medium', lastSeen: now,
    }
    // P1-17: fingerprint agora é `unique` — uma corrida entre duas ingestões pro
    // MESMO fingerprint (ex.: runSearch e ingest quase simultâneos) pode fazer o
    // upsert perder a corrida (E11000). 1 retry como update puro é suficiente
    // (o doc já existe, criado pela escrita concorrente que venceu).
    try {
      await LeakedCredential.findOneAndUpdate({ fingerprint: fp }, { $set: set, $setOnInsert: { firstSeen: now } }, { upsert: true })
    } catch (err) {
      if (err && err.code === 11000) {
        await LeakedCredential.findOneAndUpdate({ fingerprint: fp }, { $set: set }).catch(() => {})
      }
    }
  }

  const creds = await LeakedCredential.find({ domain }).lean()
  const existing = await LeakDomain.findOne({ domain }).lean()
  // Merge do agregado das fontes (LeakCheck público + Hudson Rock) — preserva o
  // sinal de origens anteriores quando esta não trouxe agregado (ex.: record-level).
  const prevAgg = (existing && existing.agg) || {}
  const mergedAgg = aggregate ? mergeAgg(prevAgg, aggregate) : prevAgg
  const a = computeExposure(creds, mergedAgg)
  const providersRan = [...new Set([...(existing?.providersRan || []), ...providerIds])]

  const set = {
    searchState: 'done', searchError: null, lastSearchAt: now, lastSearchBy: userName || null, providersRan,
    riskScore: a.riskScore, riskLevel: a.riskLevel, riskReasons: a.riskReasons,
    malwareCompromises: a.metrics.malwareCompromises, leakedPasswords: a.metrics.leakedPasswords,
    employeesAtRisk: a.metrics.employeesAtRisk, affectedUsers: a.metrics.affectedUsers, breachCount: a.metrics.breachCount,
    agg: mergedAgg,
  }
  // Metadados extras (Hudson Rock) — só sobrescreve se vieram nesta ingestão.
  if (extra) {
    if (extra.logo) set.logo = extra.logo
    if (Array.isArray(extra.thirdPartyDomains) && extra.thirdPartyDomains.length) set.thirdPartyDomains = extra.thirdPartyDomains
  }
  await LeakDomain.findOneAndUpdate({ domain }, { $set: set }, { upsert: true })
  return a
}

function mergeAgg(a = {}, b = {}) {
  return {
    found: Math.max(a.found || 0, b.found || 0),
    hasPassword: !!(a.hasPassword || b.hasPassword),
    stealer: !!(a.stealer || b.stealer),
    employees: Math.max(a.employees || 0, b.employees || 0),
    users: Math.max(a.users || 0, b.users || 0),
    malware: Math.max(a.malware || 0, b.malware || 0),
    sources: [...new Set([...(a.sources || []), ...(b.sources || [])])],
    families: { ...(a.families || {}), ...(b.families || {}) },
    // P1-16: sinal de paginação truncada (ex.: DeHashed com mais resultados do
    // que o teto de custo buscou) — precisa sobreviver ao merge, senão a UI
    // nunca sabe que a lista de contas está incompleta.
    truncated: !!(a.truncated || b.truncated),
    totalAvailable: Math.max(a.totalAvailable || 0, b.totalAvailable || 0),
  }
}

async function runSearch(domainRaw, { userName } = {}) {
  const domain = normalizeDomain(domainRaw)
  if (!domain) throw new Error('Domínio inválido. Ex.: fornecedor.com')

  const reg = await Domain.findOne({ domain }).lean()
  const authorized = !!(reg && reg.authorized)
  const domainId = reg ? reg._id : null

  await LeakDomain.findOneAndUpdate({ domain }, { $set: { domain, searchState: 'searching', searchError: null } }, { upsert: true })
  try {
    const { breaches, providers, aggregate } = await runLeakCheck(domain, { authorized })
    // Só conta como "fonte usada" quem RODOU E contribuiu (available). Assim uma
    // LeakCheck Pro sem plano (403) ou provider que errou não vira badge enganoso.
    const providerIds = providers.filter((p) => p.ran && p.available !== false).map((p) => p.id)
    const a = await persistResults(domain, { breaches, aggregate, providerIds, userName, domainId })
    return { domain, authorized, providers, assessment: a }
  } catch (err) {
    await LeakDomain.findOneAndUpdate({ domain }, { $set: { searchState: 'failed', searchError: String(err?.message || err).slice(0, 300) } }).catch(() => {})
    throw err
  }
}

// Ingestão externa — dado coletado FORA do backend (ex.: navegador do operador
// consultando a Hudson Rock grátis, cujo IP de datacenter é bloqueado). O
// normalizador já mascara/descarta cleartext; aqui só persistimos.
async function ingest(domainRaw, { breaches, aggregate, extra, providerIds, userName }) {
  const domain = normalizeDomain(domainRaw)
  if (!domain) throw new Error('Domínio inválido')
  const reg = await Domain.findOne({ domain }).lean()

  // P0-3 (auditoria 2026-07-20): esta rota era o buraco no gate de autorização
  // legal. `runSearch` checa `Domain.authorized` antes de consultar provider
  // pago, mas a ingestão manual (pensada pro operador colar dado coletado no
  // próprio navegador) nunca checava nada — e o `raw` é 100% controlado pelo
  // cliente. Qualquer usuário autenticado podia fabricar "vazamentos" para um
  // domínio de terceiro NÃO autorizado e persistir dado pessoal sem base legal,
  // poluindo KPIs/timeline/grafo com informação não verificada.
  //
  // O gate mora aqui, no núcleo, e não só na rota: assim o worker, um script ou
  // uma rota futura não conseguem contornar por esquecimento.
  if (!reg || reg.authorized !== true) {
    const err = new Error(
      `Domínio "${domain}" não está autorizado. Registre o domínio e autorize-o (com referência contratual) antes de ingerir dados de vazamento.`
    )
    err.code = 'DOMAIN_NOT_AUTHORIZED'
    throw err
  }

  return persistResults(domain, { breaches, aggregate, extra, providerIds, userName, domainId: reg._id })
}

async function getAssessment(domainRaw) {
  const domain = normalizeDomain(domainRaw)
  if (!domain) return null
  const summary = await LeakDomain.findOne({ domain }).lean()
  const creds = await LeakedCredential.find({ domain }).sort({ category: 1, seenDate: -1 }).lean()
  const agg = (summary && summary.agg) || {}
  const a = computeExposure(creds, agg)
  return {
    domain,
    summary: summary ? { ...summary, id: summary._id } : null,
    assessment: a,
    credentials: creds.map((c) => ({ ...sanitizeCredential(c), id: c._id })),
  }
}

module.exports = { runSearch, ingest, getAssessment, normalizeDomain, persistResults, buildFingerprint, mergeAgg }
