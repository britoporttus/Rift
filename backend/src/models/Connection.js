const mongoose = require('mongoose')
const crypto = require('crypto')

// Conexão de integração (#5) — por tenant. Uma por plataforma+config (ex.: um
// repo do GitHub). O token vai CIFRADO (settings.encryptSecret) e NUNCA é
// devolvido pela API. `configured` reflete se há token utilizável.
const connectionSchema = new mongoose.Schema({
  _id:       { type: String, default: () => crypto.randomUUID() },
  type:      { type: String, required: true },            // 'github' | 'jira' | …
  label:     { type: String, default: null },             // rótulo amigável (ex.: "GitHub do Rift")
  config:    { type: mongoose.Schema.Types.Mixed, default: {} },  // { owner, repo } etc. (sem segredo)
  tokenEnc:  { type: mongoose.Schema.Types.Mixed, default: null }, // { iv, tag, data } — cifrado
  createdBy: { type: String, default: null },
}, { timestamps: true })

module.exports = mongoose.model('Connection', connectionSchema)
