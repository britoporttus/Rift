const mongoose = require('mongoose')

const engagementSchema = new mongoose.Schema({
  _id:          { type: String },
  name:         { type: String, required: true },
  target:       { type: String, required: true },
  scope:        { type: mongoose.Schema.Types.Mixed, default: {} },
  status:       { type: String, enum: ['idle', 'active', 'completed'], default: 'idle' },
  phase:        { type: String, default: null },
  progress:     { type: Number, default: 0 },
  findingsCount:{ type: Number, default: 0 },
  slug:         { type: String },
  date:         { type: String },
  createdAt:    { type: Date, default: Date.now },
  updatedAt:    { type: Date, default: Date.now },
}, { _id: false, timestamps: false })

module.exports = mongoose.model('Engagement', engagementSchema)
