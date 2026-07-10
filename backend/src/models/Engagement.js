const mongoose = require('mongoose')

const engagementSchema = new mongoose.Schema({
  _id:          { type: String },
  name:         { type: String, required: true },
  target:       { type: String, required: true },
  scope:        { type: mongoose.Schema.Types.Mixed, default: {} },
  status:       { type: String, enum: ['idle', 'active', 'completed'], default: 'idle' },
  // Estado de execução do run interativo (painel de Execução). Sobrevive à
  // navegação e ao restart do backend (A-STATE-4). Distinto de `status`
  // (lifecycle geral / usado pelo scheduler e dashboard):
  //   idle       = nunca iniciado / resetado → CTA "Iniciar"
  //   running    = run ativo                 → botão "Parar"
  //   stopped    = parado pelo operador/erro  → "Continuar" | "Começar do zero"
  //   completed  = run concluído sozinho      → "Continuar" | "Começar do zero"
  runState:     { type: String, enum: ['idle', 'running', 'stopped', 'completed'], default: 'idle' },
  phase:        { type: String, default: null },
  progress:     { type: Number, default: 0 },
  findingsCount:{ type: Number, default: 0 },
  slug:         { type: String },
  date:         { type: String },

  // Agendamento de scans recorrentes (monitoramento contínuo da superfície de ataque)
  schedule: {
    enabled:        { type: Boolean, default: false },
    frequency:      { type: String, enum: ['daily', 'weekly'], default: 'weekly' },
    // 'recon' = só recon passivo | 'recon_enum' = recon+enum | 'full' = até o relatório
    phases:         { type: String, enum: ['recon', 'recon_enum', 'full'], default: 'full' },
    // Quando false, fases agressivas (exploit/post) NÃO rodam sozinhas — param no checkpoint.
    autoExploit:    { type: Boolean, default: false },
    costCeilingUsd: { type: Number, default: 5 },
    nextRunAt:      { type: Date, default: null },
    lastRunAt:      { type: Date, default: null },
    lastRunStatus:  { type: String, default: null }, // 'running' | 'completed' | 'budget_exceeded' | 'error'
  },

  createdAt:    { type: Date, default: Date.now },
  updatedAt:    { type: Date, default: Date.now },
}, { _id: false, timestamps: false })

module.exports = mongoose.model('Engagement', engagementSchema)
