const mongoose = require('mongoose')
const crypto = require('crypto')

// Ocorrência de vazamento associada a um domínio, vinda de um PROVIDER externo
// (HIBP/DeHashed/…) via chave de API — NUNCA de um corpus próprio. Guardamos só
// metadados de exposição; senha em claro NÃO é persistida (`hasPassword` sinaliza
// sem armazenar o segredo). LGPD: `account` gravado mascarado por padrão.
//
// `category` separa as naturezas (como no QuimeraX):
//   • malware   → credencial corporativa em log de infostealer (tem sourceUrl + stealerFamily)
//   • breach    → aparição em vazamento de base de dados (tem breachName/date/dataClasses)
//   • combolist → lista de credenciais agregada
const leakSchema = new mongoose.Schema({
  _id:       { type: String, default: () => crypto.randomUUID() },
  domain:    { type: String, required: true, index: true },   // string autoritativa (busca standalone)
  domainId:  { type: String, default: null, index: true },     // FK opcional p/ Domain registrado

  category:  { type: String, enum: ['malware', 'breach', 'combolist'], default: 'breach', index: true },
  account:   { type: String, default: null },   // e-mail/usuário (mascarado)
  provider:  { type: String, default: null },    // hibp | dehashed | mock

  // breach
  breachName:  { type: String, default: null },
  breachTitle: { type: String, default: null },
  breachDate:  { type: String, default: null },
  addedDate:   { type: String, default: null },
  pwnCount:    { type: Number, default: null },
  dataClasses: { type: [String], default: [] },

  // malware / infostealer
  sourceUrl:     { type: String, default: null },   // URL onde a credencial foi capturada
  stealerFamily: { type: String, default: null },   // Redline | Stealc | Risepro | …
  seenDate:      { type: String, default: null },    // data de captura (YYYY-MM-DD)

  hasPassword: { type: Boolean, default: false },
  description: { type: String, default: null },
  severity:    { type: String, enum: ['critical', 'high', 'medium', 'low', 'info'], default: 'medium' },

  // P1-17 (auditoria 2026-07-20): unique — mesmo racional do DomainAsset (ver
  // comentário lá). Rodar scripts/dedupe-fingerprints.js ANTES de subir esta
  // mudança se já houver dado em produção.
  fingerprint: { type: String, index: true, unique: true, sparse: true },
  firstSeen:   { type: Date, default: null },
  lastSeen:    { type: Date, default: null },
}, { timestamps: true, _id: false })

module.exports = mongoose.model('LeakedCredential', leakSchema)
