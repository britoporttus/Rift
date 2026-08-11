const mongoose = require('mongoose')
const crypto = require('crypto')

// Evento de monitoramento risk-triggered (#2b) — 1 registro por mudança notável
// detectada num scan de ASM (novo subdomínio, exposição alta, CVE, takeover,
// piora de score). É o feed que responde "o que mudou que importa?".
const monitorEventSchema = new mongoose.Schema({
  _id:       { type: String, default: () => crypto.randomUUID() },
  domainId:  { type: String, required: true, index: true },
  domain:    { type: String, required: true },   // desnormalizado p/ o feed não precisar de join
  type:      { type: String, enum: ['new_subdomain', 'new_exposure', 'new_cve', 'takeover_candidate', 'score_worsened'], required: true },
  severity:  { type: String, enum: ['critical', 'high', 'medium', 'low', 'info'], default: 'info', index: true },
  title:     { type: String, required: true },
  detail:    { type: String, default: null },
  seen:      { type: Boolean, default: false, index: true },   // operador já viu no feed
  at:        { type: Date, default: Date.now, index: true },
}, { timestamps: false })

// Feed cronológico decrescente é o acesso dominante.
monitorEventSchema.index({ at: -1 })

module.exports = mongoose.model('MonitorEvent', monitorEventSchema)
