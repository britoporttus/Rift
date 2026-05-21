const Engagement = require('./models/Engagement')
const Usage = require('./models/Usage')

async function readEngagements() {
  return Engagement.find().sort({ createdAt: -1 }).lean()
}

async function writeEngagements(data) {
  // Used only during migration — bulk replace
  await Engagement.deleteMany({})
  if (data.length) await Engagement.insertMany(data)
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

module.exports = {
  readEngagements,
  writeEngagements,
  getEngagement,
  createEngagement,
  updateEngagement,
  deleteEngagement,
  readUsage,
  appendUsage,
}
