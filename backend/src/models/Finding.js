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

  // --- Taxonomia (config/finding-taxonomy.yaml) ---
  // state separa o que É vulnerabilidade do que é só observação/indício.
  state:          { type: String, enum: ['confirmed', 'probable', 'informational', 'false_positive'], default: 'informational', index: true },
  confidence:     { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  reproducible:   { type: Boolean, default: null },
  poc:            { type: String, default: null },
  needsToConfirm: { type: String, default: null },   // preenchido quando state=probable
  ruledOutReason: { type: String, default: null },   // preenchido quando state=false_positive

  // --- Classificação padronizada ---
  cvssVector:     { type: String, default: null },
  owasp:          { type: String, default: null },
  owaspApi:       { type: String, default: null },
  cwe:            { type: String, default: null },
  mitre:          { type: String, default: null },
  discoveredBy:   { type: String, default: null },

  // --- Ciclo de vida (Fase 5) — o operador é dono destes; o watcher não os
  //     sobrescreve em re-scan. `in_progress` = "em correção". `regressed` = o
  //     scanner viu de novo algo que estava `fixed`. `false_positive` mora em
  //     `state` (acima). Prazo derivado de política por severidade, sobrescrevível. ---
  fingerprint:        { type: String, default: null, index: true },
  remediationStatus:  { type: String, enum: ['open', 'in_progress', 'fixed', 'regressed', 'accepted_risk'], default: 'open', index: true },
  owner:              { type: String, default: null },   // quem está corrigindo
  dueDate:            { type: Date, default: null },     // prazo de correção
  statusHistory:      { type: [{ status: String, at: Date, by: String, note: String }], default: [] },
  // Integração de ticketing (#5): ref externa quando o achado virou ticket.
  ticketUrl:          { type: String, default: null },
  ticketRef:          { type: String, default: null },   // ex.: "#42"
  ticketType:         { type: String, default: null },   // 'github' | …
  firstSeen:          { type: String, default: null },
  lastSeen:           { type: String, default: null },
}, { timestamps: true })

module.exports = mongoose.model('Finding', findingSchema)
