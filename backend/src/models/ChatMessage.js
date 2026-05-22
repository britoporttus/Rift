const mongoose = require('mongoose')

const chatMessageSchema = new mongoose.Schema({
  engagementId: { type: String, required: true, index: true },
  type:         { type: String, required: true },
  payload:      { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true })

chatMessageSchema.index({ engagementId: 1, createdAt: 1 })

module.exports = mongoose.model('ChatMessage', chatMessageSchema)
