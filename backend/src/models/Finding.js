const mongoose = require('mongoose')

const findingSchema = new mongoose.Schema({
  engagementId:   { type: String, required: true, index: true },
  engagementName: { type: String },
  severity:       { type: String, enum: ['critical', 'high', 'medium', 'low', 'info'], default: 'info' },
  title:          { type: String, required: true },
  type:           { type: String, default: null },
  location:       { type: String, default: null },
  parameter:      { type: String, default: null },
  payload:        { type: String, default: null },
  evidence:       { type: String, default: null },
  impact:         { type: String, default: null },
  description:    { type: String, default: null },
  recommendation: { type: String, default: null },
  cvss:           { type: Number, default: null },
  phase:          { type: Number, default: null },
  confirmed:      { type: Boolean, default: false },
  sourceFile:     { type: String, default: null },
}, { timestamps: true })

module.exports = mongoose.model('Finding', findingSchema)
