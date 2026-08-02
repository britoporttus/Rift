'use strict'
/**
 * Frente 0 — isolamento por tenant (banco por cliente).
 *
 * Duas camadas:
 *
 *   CONTROL PLANE  banco compartilhado (`rift_control`, a conexão default do
 *                  mongoose). Guarda `User` e `Tenant` — o login precisa
 *                  resolver ANTES de sabermos o tenant — mais o espelho de
 *                  `Usage` para o painel admin/billing não ter que varrer N
 *                  bancos.
 *
 *   TENANT PLANE   um banco por cliente (`rift_t_<slug>`), com os dados dele:
 *                  Engagement, Finding, Domain*, Internal*, Chat*, Job,
 *                  ReportNarrative, Leak*. Uma query não alcança outro tenant
 *                  porque é literalmente outro banco.
 *
 * Regra inegociável (**fail-closed**): sem tenant resolvido, nega. NUNCA cair
 * num banco default — um fallback silencioso aqui reintroduz exatamente o
 * vazamento cross-organização que esta camada existe para impedir.
 *
 * Conexões são CACHEADAS por tenant (`Map<tenantId, Connection>`). Abrir
 * conexão por request esgotaria o pool do Mongo em minutos.
 */
const mongoose = require('mongoose')

// Modelos que vivem no banco do TENANT. Reaproveitamos o `.schema` já compilado
// dos model files existentes — assim nenhum deles precisa ser reescrito, o que
// mantém o refactor (o passo mais invasivo da Frente 0) sem big-bang.
const TENANT_MODEL_FILES = {
  Engagement:        './models/Engagement',
  Finding:           './models/Finding',
  ChatSession:       './models/ChatSession',
  ChatMessage:       './models/ChatMessage',
  Domain:            './models/Domain',
  DomainAsset:       './models/DomainAsset',
  DomainScan:        './models/DomainScan',
  InternalNetwork:   './models/InternalNetwork',
  InternalHost:      './models/InternalHost',
  InternalScan:      './models/InternalScan',
  LeakDomain:        './models/LeakDomain',
  LeakedCredential:  './models/LeakedCredential',
  ReportNarrative:   './models/ReportNarrative',
  Job:               './models/Job',
  // Usage é gravado no tenant E espelhado no control plane (decisão 2026-08-01):
  // o painel admin e o billing precisam agregar sem fan-out por N bancos.
  Usage:             './models/Usage',
}

// Modelos que NUNCA saem do control plane.
const CONTROL_MODEL_NAMES = ['User', 'Tenant']

const DEFAULT_TENANT_DB_PREFIX = process.env.TENANT_DB_PREFIX || 'rift_t_'
// Teto de conexões cacheadas — protege o Mongo de um número grande de tenants.
const MAX_CACHED_CONNECTIONS = Number(process.env.TENANT_MAX_CONNECTIONS) || 50

/** Erro tipado para as rotas mapearem em 401/403 sem adivinhar pela mensagem. */
class TenantResolutionError extends Error {
  constructor(message, code = 'TENANT_UNRESOLVED') {
    super(message)
    this.name = 'TenantResolutionError'
    this.code = code
  }
}

function tenantDbName(tenant) {
  if (tenant && tenant.dbName) return tenant.dbName
  return `${DEFAULT_TENANT_DB_PREFIX}${tenant.slug}`
}

/** Base URI do cluster compartilhado, sem o nome do banco. */
function baseClusterUri() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rift'
  // Troca o path do banco preservando querystring (replicaSet, authSource…).
  return uri.replace(/\/[^/?]*(\?|$)/, '/$1')
}

function tenantUri(tenant) {
  if (tenant.dbUri) return tenant.dbUri                    // instância dedicada
  const base = baseClusterUri()
  const [head, query] = base.split('?')
  return `${head.replace(/\/$/, '')}/${tenantDbName(tenant)}${query ? `?${query}` : ''}`
}

// ── cache de conexões ────────────────────────────────────────────────────────

const connections = new Map()   // tenantId -> mongoose.Connection
const modelCache  = new WeakMap() // Connection -> { [name]: Model }

function schemasForTenant() {
  const out = {}
  for (const [name, file] of Object.entries(TENANT_MODEL_FILES)) {
    // eslint-disable-next-line global-require
    out[name] = require(file).schema
  }
  return out
}

/** Liga os schemas a uma conexão, com cache por conexão. */
function modelsFor(conn) {
  const hit = modelCache.get(conn)
  if (hit) return hit
  const schemas = schemasForTenant()
  const models = {}
  for (const [name, schema] of Object.entries(schemas)) {
    // conn.model reaproveita se já compilado nesta conexão.
    models[name] = conn.models[name] || conn.model(name, schema)
  }
  modelCache.set(conn, models)
  return models
}

/**
 * Conexão do tenant, cacheada. Não abre conexão por request.
 * @param {object} tenant documento de Tenant (lean ou hidratado)
 */
async function connectionFor(tenant) {
  if (!tenant || !tenant.slug) throw new TenantResolutionError('Tenant inválido')
  if (tenant.status === 'suspended') {
    throw new TenantResolutionError(`Tenant "${tenant.slug}" está suspenso`, 'TENANT_SUSPENDED')
  }
  const key = String(tenant._id || tenant.slug)
  const cached = connections.get(key)
  if (cached && cached.readyState !== 99 /* not destroyed */) return cached

  if (connections.size >= MAX_CACHED_CONNECTIONS) {
    throw new TenantResolutionError(
      `Teto de ${MAX_CACHED_CONNECTIONS} conexões de tenant atingido`, 'TENANT_CONNECTION_LIMIT'
    )
  }

  const conn = await mongoose.createConnection(tenantUri(tenant)).asPromise()
  connections.set(key, conn)
  return conn
}

/** Conexão + models já ligados. É o que o middleware injeta em `req.db`. */
async function dbFor(tenant) {
  const conn = await connectionFor(tenant)
  return { tenant, conn, ...modelsFor(conn) }
}

// ── resolução usuário → tenant ───────────────────────────────────────────────

function emailDomain(email) {
  const at = String(email || '').lastIndexOf('@')
  return at === -1 ? null : String(email).slice(at + 1).toLowerCase().trim()
}

/**
 * Resolve o tenant de um usuário autenticado.
 *
 * Ordem: `user.tenantId` explícito (atribuição manual vence) → domínio do
 * e-mail via `allowedEmailDomains`. Sem match → lança. **Nunca** devolve um
 * tenant "padrão".
 *
 * @param {object} user       `req.user`
 * @param {object} TenantModel injetável para teste
 */
async function resolveTenant(user, TenantModel) {
  const Tenant = TenantModel || require('./models/Tenant')
  if (!user) throw new TenantResolutionError('Usuário não autenticado', 'NO_USER')

  if (user.tenantId) {
    const t = await Tenant.findById(user.tenantId).lean()
    if (!t) throw new TenantResolutionError(`Tenant ${user.tenantId} não existe`, 'TENANT_NOT_FOUND')
    if (t.status === 'suspended') throw new TenantResolutionError(`Tenant "${t.slug}" está suspenso`, 'TENANT_SUSPENDED')
    return t
  }

  const domain = emailDomain(user.email)
  if (!domain) throw new TenantResolutionError('Usuário sem e-mail — impossível resolver tenant', 'NO_EMAIL')

  const t = await Tenant.findOne({ allowedEmailDomains: domain, status: 'active' }).lean()
  if (!t) {
    throw new TenantResolutionError(
      `Nenhum tenant ativo aceita o domínio "${domain}". Atribua o usuário a um tenant explicitamente.`,
      'TENANT_UNRESOLVED'
    )
  }
  return t
}

/** Status HTTP para cada causa de falha — evita adivinhação nas rotas. */
function statusForError(err) {
  if (!err || err.name !== 'TenantResolutionError') return 500
  if (err.code === 'NO_USER') return 401
  if (err.code === 'TENANT_CONNECTION_LIMIT') return 503
  return 403
}

/** Fecha tudo (shutdown / teste). */
async function closeAll() {
  const all = [...connections.values()]
  connections.clear()
  await Promise.allSettled(all.map((c) => c.close()))
}

function cachedConnectionCount() { return connections.size }

module.exports = {
  TenantResolutionError,
  TENANT_MODEL_FILES, CONTROL_MODEL_NAMES,
  tenantDbName, tenantUri, baseClusterUri,
  connectionFor, modelsFor, dbFor,
  resolveTenant, emailDomain, statusForError,
  closeAll, cachedConnectionCount,
}
