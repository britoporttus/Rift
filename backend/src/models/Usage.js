const mongoose = require('mongoose')

const usageSchema = new mongoose.Schema({
  usd:            { type: Number, required: true },
  tokens:         { type: Number, default: 0 },
  engagementId:   { type: String },
  engagementName: { type: String },
  userId:         { type: String, index: true },
  userName:       { type: String },
  userEmail:      { type: String },
  ts:             { type: Date, default: Date.now },
})

module.exports = mongoose.model('Usage', usageSchema)
