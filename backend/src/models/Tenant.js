const mongoose = require('mongoose')

/**
 * Registro de tenant — vive no CONTROL PLANE (banco compartilhado `rift_control`).
 *
 * Precisa estar no control plane porque o login acontece ANTES de sabermos a
 * qual tenant o usuário pertence: é justamente este documento que responde essa
 * pergunta. Os dados do cliente (engagements, findings, relatórios) vivem no
 * banco do tenant, não aqui.
 *
 * `dbUri` é o que permite mover um cliente para instância dedicada sem tocar em
 * código — é upgrade de deploy, não de arquitetura. Vazio = usa o cluster
 * compartilhado padrão com o banco `dbName`.
 */
const tenantSchema = new mongoose.Schema({
  slug: {
    type: String, required: true, unique: true, lowercase: true, trim: true,
    // Entra em nome de banco e em caminho de diretório — restringe para não
    // permitir travessia de path nem caractere inválido no Mongo.
    match: /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/,
  },
  name: { type: String, required: true, trim: true },

  // Domínios de e-mail que resolvem para este tenant no SSO. É o mecanismo de
  // atribuição automática quando o User não tem tenantId explícito.
  allowedEmailDomains: { type: [String], default: [], index: true },

  // Conexão. Vazio → cluster compartilhado padrão (ver tenancy.js).
  dbUri:  { type: String, default: null },
  dbName: { type: String, default: null },

  // `suspended` mantém os dados mas nega acesso — necessário para inadimplência
  // ou incidente, sem apagar nada.
  status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },

  // Tenant interno da operação (Porttus/Trustsis) vs cliente pagante. Usado para
  // não expor tenants internos em telas de cliente e para relatórios de billing.
  kind: { type: String, enum: ['internal', 'customer'], default: 'customer' },

  notes: { type: String, default: null },
}, { timestamps: true })

module.exports = mongoose.model('Tenant', tenantSchema)
