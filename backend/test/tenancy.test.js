// Frente 0 — isolamento por tenant. Fundação (resolver + roteamento de conexão).
//
// A propriedade que estes testes travam é FAIL-CLOSED: sem tenant resolvido, o
// sistema NEGA. Nunca cai num banco default. Um fallback silencioso aqui
// reintroduz exatamente o vazamento cross-organização que a Frente 0 existe
// para impedir — e seria invisível em teste manual, porque "funciona".
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rift'

const {
  resolveTenant, emailDomain, tenantDbName, tenantUri, baseClusterUri,
  statusForError, TenantResolutionError, TENANT_MODEL_FILES, CONTROL_MODEL_NAMES,
} = require('../src/tenancy')

// Stub do model Tenant — os testes exercem a lógica de resolução, não o Mongo.
function fakeTenantModel(tenants) {
  return {
    findById: (id) => ({ lean: async () => tenants.find((t) => String(t._id) === String(id)) || null }),
    findOne: (q) => ({
      lean: async () => tenants.find((t) =>
        (t.allowedEmailDomains || []).includes(q.allowedEmailDomains) &&
        (!q.status || t.status === q.status)
      ) || null,
    }),
  }
}

const PORTTUS  = { _id: 't1', slug: 'porttus',  allowedEmailDomains: ['porttus.com'],  status: 'active' }
const TRUSTSIS = { _id: 't2', slug: 'trustsis', allowedEmailDomains: ['trustsis.com'], status: 'active' }
const SUSPENSO = { _id: 't3', slug: 'inadimplente', allowedEmailDomains: ['x.com'], status: 'suspended' }
const T = fakeTenantModel([PORTTUS, TRUSTSIS, SUSPENSO])

// ── fail-closed: o coração da Frente 0 ───────────────────────────────────────

test('domínio de e-mail desconhecido NEGA — não cai num tenant padrão', async () => {
  await assert.rejects(
    () => resolveTenant({ email: 'alguem@empresa-aleatoria.com' }, T),
    (e) => e instanceof TenantResolutionError && e.code === 'TENANT_UNRESOLVED'
  )
})

test('usuário sem e-mail NEGA', async () => {
  await assert.rejects(() => resolveTenant({ id: 'u1' }, T), (e) => e.code === 'NO_EMAIL')
})

test('sem usuário NEGA com 401 (não 403)', async () => {
  await assert.rejects(() => resolveTenant(null, T), (e) => e.code === 'NO_USER')
  assert.equal(statusForError(new TenantResolutionError('x', 'NO_USER')), 401)
})

test('tenant suspenso NEGA mesmo com domínio válido (inadimplência/incidente)', async () => {
  await assert.rejects(
    () => resolveTenant({ email: 'a@x.com', tenantId: 't3' }, T),
    (e) => e.code === 'TENANT_SUSPENDED'
  )
})

test('tenantId apontando para tenant inexistente NEGA', async () => {
  await assert.rejects(
    () => resolveTenant({ email: 'a@porttus.com', tenantId: 'fantasma' }, T),
    (e) => e.code === 'TENANT_NOT_FOUND'
  )
})

// ── resolução correta ────────────────────────────────────────────────────────

test('resolve pelo domínio do e-mail (SSO)', async () => {
  assert.equal((await resolveTenant({ email: 'op@porttus.com' }, T)).slug, 'porttus')
  assert.equal((await resolveTenant({ email: 'op@trustsis.com' }, T)).slug, 'trustsis')
})

test('porttus e trustsis são tenants DISTINTOS (§7 do spec)', async () => {
  const a = await resolveTenant({ email: 'op@porttus.com' }, T)
  const b = await resolveTenant({ email: 'op@trustsis.com' }, T)
  assert.notEqual(String(a._id), String(b._id))
  assert.notEqual(tenantDbName(a), tenantDbName(b), 'bancos têm que ser diferentes')
})

test('tenantId explícito vence o domínio do e-mail (atribuição manual)', async () => {
  const t = await resolveTenant({ email: 'consultor@porttus.com', tenantId: 't2' }, T)
  assert.equal(t.slug, 'trustsis')
})

test('e-mail é case-insensitive e tolera espaço', async () => {
  assert.equal((await resolveTenant({ email: '  OP@Porttus.COM ' }, T)).slug, 'porttus')
})

test('emailDomain pega o ÚLTIMO @ (endereço com @ no local-part)', () => {
  assert.equal(emailDomain('"a@b"@porttus.com'), 'porttus.com')
  assert.equal(emailDomain('sem-arroba'), null)
})

// ── roteamento de banco ──────────────────────────────────────────────────────

test('cada tenant tem um banco próprio, derivado do slug', () => {
  assert.equal(tenantDbName(PORTTUS), 'rift_t_porttus')
  assert.equal(tenantDbName(TRUSTSIS), 'rift_t_trustsis')
})

test('dbName explícito no registro vence a convenção', () => {
  assert.equal(tenantDbName({ slug: 'acme', dbName: 'banco_legado_acme' }), 'banco_legado_acme')
})

test('dbUri no registro aponta para instância dedicada (upgrade de deploy, não de código)', () => {
  const uri = tenantUri({ slug: 'acme', dbUri: 'mongodb://cluster-do-acme:27017/acme' })
  assert.equal(uri, 'mongodb://cluster-do-acme:27017/acme')
})

test('sem dbUri, monta a URI do cluster compartilhado preservando a querystring', () => {
  const original = process.env.MONGO_URI
  process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rift?replicaSet=rs0&authSource=admin'
  try {
    const uri = tenantUri({ slug: 'porttus' })
    assert.match(uri, /\/rift_t_porttus\?/)
    assert.match(uri, /replicaSet=rs0/, 'perder a querystring quebraria replicaSet/authSource')
    assert.match(uri, /authSource=admin/)
  } finally { process.env.MONGO_URI = original }
})

test('baseClusterUri remove o nome do banco e mantém o resto', () => {
  const original = process.env.MONGO_URI
  process.env.MONGO_URI = 'mongodb://user:pw@host:27017/rift?authSource=admin'
  try {
    assert.equal(baseClusterUri(), 'mongodb://user:pw@host:27017/?authSource=admin')
  } finally { process.env.MONGO_URI = original }
})

// ── divisão control/tenant ───────────────────────────────────────────────────

test('User e Tenant NUNCA vão para o banco do tenant (login resolve antes)', () => {
  for (const name of CONTROL_MODEL_NAMES) {
    assert.equal(name in TENANT_MODEL_FILES, false, `${name} tem que ficar no control plane`)
  }
})

test('todo dado de cliente está mapeado para o tenant plane', () => {
  // Se um model novo com dado de cliente não entrar aqui, ele continua global —
  // ou seja, visível entre tenants. Este teste é o lembrete.
  for (const name of [
    'Engagement', 'Finding', 'Domain', 'DomainAsset', 'DomainScan',
    'InternalNetwork', 'InternalHost', 'InternalScan',
    'ChatSession', 'ChatMessage', 'LeakDomain', 'LeakedCredential',
    'ReportNarrative', 'Job', 'Usage',
  ]) {
    assert.ok(TENANT_MODEL_FILES[name], `${name} precisa viver no banco do tenant`)
  }
})

test('os schemas do tenant plane carregam e são schemas de verdade', () => {
  for (const [name, file] of Object.entries(TENANT_MODEL_FILES)) {
    const mod = require(`../src/${file.replace('./', '')}`)
    assert.ok(mod.schema && mod.schema.paths, `${name} precisa expor .schema para ligar por conexão`)
  }
})
