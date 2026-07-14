const mongoose = require('mongoose')

// Resumo executivo escrito por IA (1 doc por engagement, upsert). É o ÚNICO ponto do
// relatório que usa o modelo — o resto é determinístico. Cacheado para não gastar token
// a cada abertura; `findingsCount` no momento da geração sinaliza se ficou desatualizado.
const reportNarrativeSchema = new mongoose.Schema({
  _id:          { type: String },              // = engagementId (1:1)
  engagementId: { type: String, required: true, index: true },
  summary:      { type: String, default: '' }, // parágrafos de resumo executivo (prosa)
  riskLevel:    { type: String, default: null },// critical|high|medium|low|info (postura geral)
  attackChains: { type: [String], default: [] },// cadeias de ataque plausíveis (só findings reais)
  recommendations: { type: [String], default: [] }, // prioridades de remediação
  model:        { type: String, default: null },
  findingsCount:{ type: Number, default: 0 },  // nº de findings quando gerado (staleness)
  costUsd:      { type: Number, default: 0 },
  generatedAt:  { type: Date, default: Date.now },
}, { _id: false, timestamps: false })

module.exports = mongoose.model('ReportNarrative', reportNarrativeSchema)
