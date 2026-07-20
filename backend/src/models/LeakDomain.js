const mongoose = require('mongoose')
const crypto = require('crypto')

// "Busca" de exposição de vazamento por domínio (módulo Vazamentos, estilo QuimeraX).
// É a entidade da LISTA de buscas + headline metrics cacheadas. O detalhe rico
// (timeline, famílias de stealer, tabela de credenciais) é computado on-the-fly a
// partir de LeakedCredential (ver leaks/aggregate.js). Independe do módulo Domínios
// (ASM) — conecta-se por string de domínio.
const leakDomainSchema = new mongoose.Schema({
  _id:      { type: String, default: () => crypto.randomUUID() },
  domain:   { type: String, required: true, unique: true, index: true },

  searchState: { type: String, enum: ['idle', 'searching', 'done', 'failed'], default: 'idle' },
  searchError: { type: String, default: null },
  lastSearchAt: { type: Date, default: null },
  lastSearchBy: { type: String, default: null },
  providersRan: { type: [String], default: [] },   // ex.: ['mock'] ou ['hibp','dehashed']

  // Headline metrics (como os cards do QuimeraX)
  riskScore:          { type: Number, default: 0 },   // 0-100
  riskLevel:          { type: String, enum: ['critical', 'high', 'medium', 'low', 'info'], default: 'info' },
  riskReasons:        { type: [String], default: [] },
  malwareCompromises: { type: Number, default: 0 },   // logs de infostealer
  leakedPasswords:    { type: Number, default: 0 },
  employeesAtRisk:    { type: Number, default: 0 },   // contas corp. em logs de malware
  affectedUsers:      { type: Number, default: 0 },   // contas distintas em breaches
  breachCount:        { type: Number, default: 0 },

  // Agregado das fontes que dão contagem/estatística (LeakCheck público: found;
  // Hudson Rock: employees/users/totalStealers + famílias de stealer). Guardado
  // para reproduzir o assessment no GET sem re-consultar a fonte.
  // Shape: { found, hasPassword, stealer, sources:[], employees, users, malware, families:{name:count} }
  agg: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Metadados extras (Hudson Rock): logo do domínio + exposição de cadeia
  // (domínios de terceiros p/ os quais os funcionários vazaram credencial).
  logo:              { type: String, default: null },
  thirdPartyDomains: { type: mongoose.Schema.Types.Mixed, default: [] },  // [{domain, occurrence}]
}, { timestamps: true, _id: false })

module.exports = mongoose.model('LeakDomain', leakDomainSchema)
