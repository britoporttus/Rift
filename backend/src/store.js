const Engagement = require('./models/Engagement')
const Usage = require('./models/Usage')
const Finding = require('./models/Finding')

async function readEngagements() {
  return Engagement.find().sort({ createdAt: -1 }).lean()
}

async function getEngagement(id) {
  return Engagement.findById(id).lean()
}

async function createEngagement(data) {
  const e = new Engagement(data)
  await e.save()
  return e.toObject()
}

async function updateEngagement(id, patch) {
  return Engagement.findByIdAndUpdate(id, { ...patch, updatedAt: new Date() }, { new: true }).lean()
}

async function deleteEngagement(id) {
  return Engagement.findByIdAndDelete(id)
}

async function readUsage() {
  return Usage.find().sort({ ts: -1 }).lean()
}

async function appendUsage(entry) {
  await Usage.create(entry)
}

// Custo acumulado (US$) de um engagement ao longo da vida — soma de todos os
// registros de Usage. Usado como porta de orçamento ANTES de iniciar um turno:
// como o `claude --print` só reporta o custo do turno NO FINAL (não dá pra
// interromper no meio), o único ponto de enforcement real é recusar começar um
// novo turno quando o teto do engagement já foi atingido.
async function sumUsageUsd(engagementId) {
  const [row] = await Usage.aggregate([
    { $match: { engagementId } },
    { $group: { _id: null, usd: { $sum: '$usd' } } },
  ])
  return row?.usd || 0
}

// REL-4: total real de findings de um engagement (contagem idempotente, usada
// para não inflar findingsCount a cada re-scan do watcher).
async function countFindings(engagementId) {
  return Finding.countDocuments({ engagementId })
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
