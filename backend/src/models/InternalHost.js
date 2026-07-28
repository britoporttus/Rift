const mongoose = require('mongoose')
const crypto = require('crypto')

// Dispositivo descoberto numa rede interna. Upsert idempotente por `fingerprint`
// (`${networkId}:${mac||ip}`) — re-imports atualizam (não duplicam) e mantêm
// firstSeen/lastSeen pra rastrear o que é novo entre coletas. Mesmo padrão do
// DomainAsset.
const portSchema = new mongoose.Schema({
  port:    { type: Number },
  proto:   { type: String, default: 'tcp' },   // tcp | udp
  service: { type: String, default: null },     // ex. ssh, http, telnet
  product: { type: String, default: null },     // ex. OpenSSH, nginx
  version: { type: String, default: null },
}, { _id: false })

const DEVICE_TYPES = [
  'server', 'workstation', 'hypervisor', 'router', 'switch', 'firewall', 'printer',
  'camera', 'iot', 'nas', 'voip', 'mobile', 'unknown',
]

const hostSchema = new mongoose.Schema({
  _id:       { type: String, default: () => crypto.randomUUID() },
  networkId: { type: String, required: true, index: true },

  ip:        { type: String, required: true },
  mac:       { type: String, default: null },
  macVendor: { type: String, default: null },   // fabricante resolvido pelo OUI do MAC
  hostname:  { type: String, default: null },
  os:        { type: String, default: null },    // OS/fingerprint reportado pelo nmap

  deviceType: { type: String, enum: DEVICE_TYPES, default: 'unknown' },
  openPorts:  { type: [portSchema], default: [] },
  protocols:  { type: [String], default: [] },   // rótulos de protocolo (ex. SMBv1, Telnet)

  // Análise de segurança (analyze.js)
  severity: { type: String, enum: ['critical', 'high', 'medium', 'low', 'info'], default: 'info' },
  labels:   { type: [String], default: [] },     // flags: "Telnet exposto", "não identificado"...

  // `online` = visto na última coleta que cobriu o CIDR dele; `gone` = o CIDR foi
  // varrido e ele não respondeu. Sem isto um host que saiu da rede ficaria "vivo"
  // pra sempre e inflaria hostCount/score indefinidamente. Só hosts DENTRO do
  // escopo varrido são marcados como `gone` — coleta parcial (um agente por
  // sub-rede) não pode apagar o que ela nunca olhou.
  status:      { type: String, enum: ['online', 'gone'], default: 'online', index: true },
  goneSince:   { type: Date, default: null },

  source:      { type: String, default: 'agent' },
  fingerprint: { type: String, index: true, unique: true, sparse: true },  // `${networkId}:${mac||ip}`
  firstSeen:   { type: Date, default: null },
  lastSeen:    { type: Date, default: null },
}, { timestamps: true, _id: false })

module.exports = mongoose.model('InternalHost', hostSchema)
module.exports.DEVICE_TYPES = DEVICE_TYPES
