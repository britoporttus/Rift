/**
 * Acesso a Engagement/Usage/Finding.
 *
 * Frente 0: todas as funções passam a receber `db` — os models JÁ LIGADOS ao
 * banco do tenant (`req.db` nas rotas, `dbForSlug`/`forEachTenant` nos workers).
 * Antes elas importavam os models globais, o que significava uma coleção só para
 * todo mundo.
 *
 * A assinatura ficou `fn(db, ...)` de propósito, e não `fn(..., db)` opcional:
 * um parâmetro opcional no fim é fácil de esquecer numa chamada, e o
 * esquecimento seria silencioso — a query rodaria no banco compartilhado sem
 * ninguém perceber. Com o `db` na frente e obrigatório, esquecer é um erro
 * imediato e barulhento.
 */

function requireDb(db, fnName) {
  if (!db || !db.Engagement) {
    throw new Error(
      `[store] ${fnName}() chamado sem \`db\` de tenant. ` +
      'Use req.db (rotas) ou dbForSlug/forEachTenant (workers) — nunca os models globais.'
    )
  }
  return db
}

async function readEngagements(db) {
  return requireDb(db, 'readEngagements').Engagement.find().sort({ createdAt: -1 }).lean()
}

async function getEngagement(db, id) {
  return requireDb(db, 'getEngagement').Engagement.findById(id).lean()
}

async function createEngagement(db, data) {
  const e = new (requireDb(db, 'createEngagement').Engagement)(data)
  await e.save()
  return e.toObject()
}

async function updateEngagement(db, id, patch) {
  return requireDb(db, 'updateEngagement')
    .Engagement.findByIdAndUpdate(id, { ...patch, updatedAt: new Date() }, { new: true }).lean()
}

async function deleteEngagement(db, id) {
  return requireDb(db, 'deleteEngagement').Engagement.findByIdAndDelete(id)
}

async function readUsage(db) {
  return requireDb(db, 'readUsage').Usage.find().sort({ ts: -1 }).lean()
}

async function appendUsage(db, entry) {
  await requireDb(db, 'appendUsage').Usage.create(entry)
}

// Custo acumulado (US$) de um engagement ao longo da vida — soma de todos os
// registros de Usage. Usado como porta de orçamento ANTES de iniciar um turno:
// como o `claude --print` só reporta o custo do turno NO FINAL (não dá pra
// interromper no meio), o único ponto de enforcement real é recusar começar um
// novo turno quando o teto do engagement já foi atingido.
async function sumUsageUsd(db, engagementId) {
  const [row] = await requireDb(db, 'sumUsageUsd').Usage.aggregate([
    { $match: { engagementId } },
    { $group: { _id: null, usd: { $sum: '$usd' } } },
  ])
  return row?.usd || 0
}

// REL-4: total real de findings de um engagement (contagem idempotente, usada
// para não inflar findingsCount a cada re-scan do watcher).
async function countFindings(db, engagementId) {
  return requireDb(db, 'countFindings').Finding.countDocuments({ engagementId })
}

module.exports = {
  readEngagements,
  getEngagement,
  createEngagement,
  updateEngagement,
  deleteEngagement,
  readUsage,
  appendUsage,
  sumUsageUsd,
  countFindings,
}
