const mongoose = require('mongoose')

const usageSchema = new mongoose.Schema({
  usd:          { type: Number, required: true },
  tokens:       { type: Number, default: 0 },
  engagementId: { type: String },
  ts:           { type: Date, default: Date.now },
})

module.exports = mongoose.model('Usage', usageSchema)
