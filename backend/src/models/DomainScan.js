const mongoose = require('mongoose')
const crypto = require('crypto')

// Histórico de monitoramento — UM registro por execução de scan de um domínio.
// Torna visível que o monitoramento é CONTÍNUO (linha do tempo de scans), em vez
// de parecer que rodou uma vez só. É um snapshot leve (contadores + score + diff
// daquele momento); os ativos/exposições em si vivem em DomainAsset com
// firstSeen/lastSeen. Escrito ao fim de cada runScan (scanner.js).
const scanSchema = new mongoose.Schema({
  _id:        { type: String, default: () => crypto.randomUUID() },
  domainId:   { type: String, required: true, index: true },
  ranAt:      { type: Date, default: Date.now, index: true },
  trigger:    { type: String, enum: ['manual', 'monitor'], default: 'manual' },
  authorized: { type: Boolean, default: false },   // se o probe ativo (httpx/nuclei) rodou neste scan

  // Snapshot de contadores no momento do scan
  assetCount:     { type: Number, default: 0 },   // total cru (contém os demais)
  subdomainCount: { type: Number, default: 0 },   // hosts descobertos
  aliveCount:     { type: Number, default: 0 },   // hosts web-vivos (não portas)
  portCount:      { type: Number, default: 0 },
  exposureCount:  { type: Number, default: 0 },
  cveCount:       { type: Number, default: 0 },
  riskScore:     { type: Number, default: 0 },
  riskLevel:     { type: String, default: 'info' },

  // Delta vs. o scan anterior (mesma computação do lastDiff em Domain)
  newCount:     { type: Number, default: 0 },
  missingCount: { type: Number, default: 0 },
  scoreDelta:   { type: Number, default: 0 },
}, { timestamps: false, _id: false })

// Consulta canônica: histórico de um domínio, mais recente primeiro.
scanSchema.index({ domainId: 1, ranAt: -1 })

module.exports = mongoose.model('DomainScan', scanSchema)
