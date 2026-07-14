const mongoose = require('mongoose')

// Uma ETAPA do fluxo (uma fase do pentest). O Job garante que o fluxo seja
// rastreado do início ao fim, mesmo que o run caia/reinicie.
const stepSchema = new mongoose.Schema({
  key:     { type: String, required: true },   // recon | enum | vuln | exploit | post | report
  label:   { type: String, required: true },
  status:  { type: String, enum: ['pending', 'active', 'done', 'skipped'], default: 'pending' },
  startedAt: { type: Date, default: null },
  endedAt:   { type: Date, default: null },
}, { _id: false })

// Job = UM run do agente (uma "tarefa" orquestrada). O agente executa o pentest; o
// backend mantém o Job avançando pelas etapas a partir da ATIVIDADE REAL do agente
// (mesma inferência de fase do painel), e o fecha no desfecho. Persistente e
// reconciliável: um Job 'running' sem run vivo (após restart) é marcado 'failed'.
const jobSchema = new mongoose.Schema({
  _id:          { type: String },
  engagementId: { type: String, required: true, index: true },
  sessionId:    { type: String, default: 'default' },
  frameworkId:  { type: String, default: 'v2' },
  // Espelha o runState do engagement, mas por-run (histórico de execuções).
  status:       { type: String, enum: ['running', 'completed', 'stopped', 'failed'], default: 'running', index: true },
  reason:       { type: String, default: null },     // stopReason (operator|budget|incomplete|safeguard|timeout|error…)
  steps:        { type: [stepSchema], default: [] },
  currentStep:  { type: String, default: null },
  findingsCount:{ type: Number, default: 0 },
  spentUsd:     { type: Number, default: 0 },
  startedAt:    { type: Date, default: Date.now },
  endedAt:      { type: Date, default: null },
  updatedAt:    { type: Date, default: Date.now },
}, { _id: false, timestamps: false })

jobSchema.index({ engagementId: 1, startedAt: -1 })

module.exports = mongoose.model('Job', jobSchema)
