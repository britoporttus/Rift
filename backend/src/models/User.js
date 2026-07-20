const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  email:        { type: String, required: true, unique: true, lowercase: true },
  name:         { type: String, required: true },
  role:         { type: String, enum: ['admin', 'user'], default: 'user' },
  passwordHash: { type: String, default: null },
  provider:     { type: String, enum: ['local', 'microsoft'], default: 'local' },
  azureId:      { type: String, default: null },
  lastLogin:    { type: Date, default: null },
  // P1-11 (auditoria 2026-07-20): incrementado em mudança de role/reset de senha
  // para revogar tecnicamente qualquer JWT já emitido (ver auth.js/requireAuth).
  // Sem isso, um admin rebaixado/com senha resetada mantinha o token válido por
  // até 12h (janela do JWT).
  tokenVersion: { type: Number, default: 0 },
}, { timestamps: true })

module.exports = mongoose.model('User', userSchema)
