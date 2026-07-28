const mongoose = require('mongoose')
const crypto = require('crypto')

// Rede interna = alvo do módulo de descoberta/inventário de LAN. Entidade
// TOP-LEVEL própria (cria várias por cliente: LAN local, DMZ, rede de nuvem...).
// Cada rede tem um `enrollToken`: a plataforma NÃO alcança a rede do cliente, então
// um AGENTE local (nmap) roda dentro dela e reporta com esse token. Ver
// internal/agent-template.py e api/internal-networks.js (POST /ingest).
//
// `authorized` é o gate legal — o operador confirma que tem permissão de escanear
// a rede. O ingest só é aceito com authorized === true (auditoria de segurança
// mostrou que gates contornáveis viram problema).
const networkSchema = new mongoose.Schema({
  _id:         { type: String, default: () => crypto.randomUUID() },
  name:        { type: String, required: true },
  description: { type: String, default: null },
  kind:        { type: String, enum: ['lan', 'dmz', 'cloud', 'other'], default: 'lan' },

  // --- Token do agente (segredo; regenerável) ---
  enrollToken: { type: String, default: () => crypto.randomBytes(24).toString('hex'), index: true },

  // --- Autorização (gate legal) ---
  authorized:        { type: Boolean, default: false },
  authorizedBy:      { type: String, default: null },
  authorizedAt:      { type: Date, default: null },
  authorizationNote: { type: String, default: null },

  // --- Última coleta ---
  lastImportAt: { type: Date, default: null },
  lastImportBy: { type: String, default: null },
  agent: {                                     // metadados do último agente que reportou
    hostname:   { type: String, default: null },
    os:         { type: String, default: null },
    version:    { type: String, default: null },
    privileged: { type: Boolean, default: false },  // rodou como root/admin (ARP + OS detection)
  },
  // CIDRs cobertos pela última coleta — define o escopo em que hosts podem ser
  // marcados como sumidos (ver internal/cidr.js).
  lastScannedCidrs: { type: [String], default: [] },
  // Avisos do coletor (rodou em WSL, sem root, ninguém respondeu). Ficam visíveis
  // no painel: a v1 aceitava coleta degradada em silêncio e ela passava por
  // inventário legítimo, com score de risco e tudo.
  lastWarnings: { type: [String], default: [] },

  // --- Contadores derivados (recomputados a cada import) ---
  hostCount:  { type: Number, default: 0 },
  aliveCount: { type: Number, default: 0 },
  riskyCount: { type: Number, default: 0 },    // hosts com severidade > info
  deviceTypeCounts: { type: mongoose.Schema.Types.Mixed, default: {} },  // { server: 3, printer: 1, ... }

  // --- Risco transparente (mesmo padrão do Domain) ---
  riskScore:   { type: Number, default: 0 },
  riskLevel:   { type: String, enum: ['critical', 'high', 'medium', 'low', 'info'], default: 'info' },
  riskReasons: { type: [String], default: [] },

  // --- Diff do último import vs. o anterior (novo/sumido) ---
  lastDiff: {
    computedAt:   { type: Date, default: null },
    newHosts:     { type: [{ ip: String, mac: String, deviceType: { type: String } }], default: [] },
    missingHosts: { type: [{ ip: String, mac: String, deviceType: { type: String } }], default: [] },
    newCount:     { type: Number, default: 0 },
    missingCount: { type: Number, default: 0 },
    scoreDelta:   { type: Number, default: 0 },
  },
}, { timestamps: true, _id: false })

module.exports = mongoose.model('InternalNetwork', networkSchema)
