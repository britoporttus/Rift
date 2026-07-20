const mongoose = require('mongoose')

const usageSchema = new mongoose.Schema({
  usd:            { type: Number, required: true },
  tokens:         { type: Number, default: 0 },
  // P1-23 (auditoria 2026-07-20): sem índice, toda agregação de custo por
  // engagement (GET /api/engagements/:id, fechamento de job, dashboard) fazia
  // table scan na coleção inteira — cresce a cada turno do agente.
  engagementId:   { type: String, index: true },
  engagementName: { type: String },
  userId:         { type: String, index: true },
  userName:       { type: String },
  userEmail:      { type: String },
  ts:             { type: Date, default: Date.now },
})
// Composto: cobre tanto o $match por engagementId isolado quanto consultas
// que também ordenam/filtram por data dentro de um engagement.
usageSchema.index({ engagementId: 1, ts: -1 })

module.exports = mongoose.model('Usage', usageSchema)
