const mongoose = require('mongoose')
const crypto = require('crypto')

// Domínio = alvo do módulo ASM/TPRM (um fornecedor, parceiro ou ativo próprio).
// É uma entidade TOP-LEVEL própria — NÃO um engagement. O conselho recomendou
// separar: pentest é ativo/autorizado/profundo; ASM é passivo/contínuo/largo.
//
// `authorized` é o gate central que codifica o insight legal (LGPD + posse do
// domínio): sondagem ativa (httpx/nuclei) e providers reais de vazamento só
// rodam quando o fornecedor autorizou por contrato/onboarding. Sem isso, só o
// que é verdadeiramente passivo (subfinder por fontes públicas, DNS) roda.
const domainSchema = new mongoose.Schema({
  _id:        { type: String, default: () => crypto.randomUUID() },
  domain:     { type: String, required: true, index: true },   // apex, ex. fornecedor.com (lowercase)
  name:       { type: String, default: null },                 // rótulo amigável ("Fornecedor X")
  kind:       { type: String, enum: ['vendor', 'partner', 'internal', 'other'], default: 'vendor' },
  notes:      { type: String, default: null },

  // --- Autorização (gate legal) ---
  authorized:        { type: Boolean, default: false },
  authorizedBy:      { type: String, default: null },
  authorizedAt:      { type: Date, default: null },
  authorizationNote: { type: String, default: null },

  // --- Estado do scan (o front faz polling disto) ---
  scanState:  { type: String, enum: ['idle', 'scanning', 'done', 'failed'], default: 'idle', index: true },
  scanStep:   { type: String, default: null },   // subdomains | dns | http | urls | leaks | done
  scanError:  { type: String, default: null },
  scanStartedAt: { type: Date, default: null },
  lastScanAt:    { type: Date, default: null },
  lastScanBy:    { type: String, default: null },

  // --- Contadores derivados (recomputados ao fim de cada scan) ---
  assetCount:  { type: Number, default: 0 },
  aliveCount:  { type: Number, default: 0 },
  leakCount:   { type: Number, default: 0 },
  exposureCount: { type: Number, default: 0 },
  portCount:   { type: Number, default: 0 },

  // --- ASN / netblock (descoberto via RIPEstat na Fase 2). `tooLarge` = prefixo
  //     grande de cloud, não expandido. Guardado só para exibição/contexto. ---
  asnInfo: {
    type: [{ asn: String, holder: String, prefix: String, tooLarge: Boolean, owned: Boolean }],
    default: [],
  },

  // --- Risco (transparente: guardamos os motivos) ---
  riskScore:  { type: Number, default: 0 },   // 0-100
  riskLevel:  { type: String, enum: ['critical', 'high', 'medium', 'low', 'info'], default: 'info' },
  riskReasons: { type: [String], default: [] },

  // --- Monitoramento contínuo ---
  // É SEMPRE-ATIVO (sem toggle): o asm-scheduler re-escaneia todo domínio numa
  // cadência padrão, usando `lastScanAt` acima como fonte de verdade de "quando
  // rodou por último". Não há campo de agendamento por domínio.

  // --- Diff do último scan vs. o anterior (asm/diff.js), recomputado a cada
  // scan e persistido para não recalcular a cada GET. Ver scanner.js runScan().
  lastDiff: {
    computedAt:    { type: Date, default: null },
    newAssets:     { type: [{ type: { type: String }, value: String, severity: String }], default: [] },
    missingAssets: { type: [{ type: { type: String }, value: String }], default: [] },
    newCount:      { type: Number, default: 0 },
    missingCount:  { type: Number, default: 0 },
    scoreDelta:    { type: Number, default: 0 },
  },
}, { timestamps: true, _id: false })

module.exports = mongoose.model('Domain', domainSchema)
