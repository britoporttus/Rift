const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  email:        { type: String, required: true, unique: true, lowercase: true },
  name:         { type: String, required: true },
  // Frente 0: `client` é o usuário do CLIENTE (SaaS), distinto do operador
  // interno. O isolamento de DADO já vem do banco por tenant; a role controla o
  // que a operação expõe: cliente não vê custo/tokens, seletor de framework ou
  // modelo, painel admin, gestão de usuários nem relatório executivo, e não
  // dispara fase agressiva.
  role:         { type: String, enum: ['admin', 'user', 'client'], default: 'user' },
  // Fase 6 (visões por papel): PROFUNDIDADE de leitura, ORTOGONAL a `role`. `role`
  // é acesso (interno vs cliente); `depth` é o quanto a tela mostra —
  // `tecnico` vê tudo, `gestor` vê o andamento das correções, `diretor` vê só o
  // veredito. Operador interno pode alternar; cliente fica preso ao seu `depth`.
  depth:        { type: String, enum: ['tecnico', 'gestor', 'diretor'], default: 'tecnico' },
  // Vínculo explícito com o tenant. Vence a resolução por domínio de e-mail
  // (ver tenancy.resolveTenant) — necessário para um consultor da Porttus operar
  // dentro do tenant de um cliente sem trocar de e-mail.
  tenantId:     { type: String, default: null, index: true },
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
