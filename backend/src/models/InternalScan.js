const mongoose = require('mongoose')
const crypto = require('crypto')

// Histórico de coletas de uma rede interna — 1 registro por import do agente.
// Torna visível que o monitoramento é contínuo (linha do tempo), em vez de
// parecer que rodou uma vez. Snapshot leve; os hosts vivem em InternalHost.
const scanSchema = new mongoose.Schema({
  _id:       { type: String, default: () => crypto.randomUUID() },
  networkId: { type: String, required: true, index: true },
  ranAt:     { type: Date, default: Date.now, index: true },
  trigger:   { type: String, enum: ['agent', 'watch'], default: 'agent' },
  agentHost: { type: String, default: null },

  hostCount:  { type: Number, default: 0 },
  aliveCount: { type: Number, default: 0 },
  riskyCount: { type: Number, default: 0 },
  riskScore:  { type: Number, default: 0 },
  riskLevel:  { type: String, default: 'info' },

  newCount:     { type: Number, default: 0 },
  missingCount: { type: Number, default: 0 },
  scoreDelta:   { type: Number, default: 0 },
}, { timestamps: false, _id: false })

scanSchema.index({ networkId: 1, ranAt: -1 })

module.exports = mongoose.model('InternalScan', scanSchema)
