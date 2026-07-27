const mongoose = require('mongoose')
const crypto = require('crypto')

// Ativo descoberto na superfície de um domínio (subdomínio, host web, URL de
// arquivo público, exposição). Upsert idempotente por `fingerprint` — re-scans
// atualizam (não duplicam) e mantêm firstSeen/lastSeen para rastrear o que é novo.
const assetSchema = new mongoose.Schema({
  _id:       { type: String, default: () => crypto.randomUUID() },
  domainId:  { type: String, required: true, index: true },
  type:      { type: String, enum: ['subdomain', 'web', 'url', 'exposure'], default: 'subdomain' },
  value:     { type: String, required: true },   // ex. api.fornecedor.com  ou  https://.../swagger.json

  // Resolução / probe
  ips:       { type: [String], default: [] },
  cname:     { type: String, default: null },
  alive:     { type: Boolean, default: false },
  statusCode: { type: Number, default: null },
  title:     { type: String, default: null },
  webServer: { type: String, default: null },
  tech:      { type: [String], default: [] },
  scheme:    { type: String, default: null },
  tlsIssuer: { type: String, default: null },
  tlsExpiry: { type: String, default: null },

  // Classificação de exposição (quando o probe/nuclei acha algo notável)
  severity:  { type: String, enum: ['critical', 'high', 'medium', 'low', 'info'], default: 'info' },
  label:     { type: String, default: null },      // ex. "Painel de login exposto", "Swagger público"
  cveId:     { type: String, default: null },      // ex. "CVE-2021-44228" quando a exposição casa uma CVE (nuclei)
  source:    { type: String, default: null },      // subfinder | dns | httpx | gau | nuclei

  // P1-17 (auditoria 2026-07-20): unique — o padrão de upsert (findOneAndUpdate
  // por fingerprint) assumia unicidade que o índice não garantia; duas escritas
  // concorrentes (scans sobrepostos) podiam criar dois documentos com o mesmo
  // fingerprint, quebrando a idempotência e inflando assetCount/score. Rodar
  // scripts/dedupe-fingerprints.js ANTES de subir esta mudança se já houver
  // dado em produção (índice unique falha silenciosamente ao criar se houver
  // duplicata existente).
  fingerprint: { type: String, index: true, unique: true, sparse: true },  // `${domainId}:${type}:${value}`
  firstSeen:   { type: Date, default: null },
  lastSeen:    { type: Date, default: null },
}, { timestamps: true, _id: false })

module.exports = mongoose.model('DomainAsset', assetSchema)
