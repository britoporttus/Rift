// Testes das correções de hardening (ver docs/ROADMAP-HARDENING.md).
// Runner nativo do Node (node --test) — sem dependências extras.
const { test } = require('node:test')
const assert = require('node:assert')

const { isAdminOnlyCommand, ADMIN_ONLY_COMMANDS, isLastAdmin } = require('../src/rbac')
const { deriveState, computeFingerprint } = require('../src/findings-watcher')
const { buildAgentEnv, ENV_ALLOWLIST } = require('../src/agent-runner')

// ── SEC-3: RBAC de fases agressivas ────────────────────────────────────────────
test('RBAC: /pentest-exploit e /pentest-post são admin-only', () => {
  assert.equal(isAdminOnlyCommand('/pentest-exploit'), true)
  assert.equal(isAdminOnlyCommand('  /pentest-post agora'), true)
  assert.equal(isAdminOnlyCommand('/pentest-recon'), false)
  assert.equal(isAdminOnlyCommand('rode recon por favor'), false)
  assert.equal(isAdminOnlyCommand(''), false)
})

test('RBAC: lista de comandos agressivos é exatamente exploit/post', () => {
  assert.deepEqual([...ADMIN_ONLY_COMMANDS].sort(), ['pentest-exploit', 'pentest-post'])
})

test('BUG-2: isLastAdmin bloqueia rebaixar/excluir o último admin', () => {
  assert.equal(isLastAdmin('admin', 1), true)   // é o último admin → bloqueia
  assert.equal(isLastAdmin('admin', 2), false)  // há outro admin → permite
  assert.equal(isLastAdmin('user', 1), false)   // alvo não é admin → não se aplica
  assert.equal(isLastAdmin('admin', 0), true)   // defensivo
})

// ── Taxonomia de findings (anti-FP) ─────────────────────────────────────────────
test('deriveState: respeita taxonomia + retrocompat com esquema antigo', () => {
  assert.equal(deriveState({ state: 'confirmed' }), 'confirmed')
  assert.equal(deriveState({ state: 'PROBABLE' }), 'probable')          // case-insensitive
  assert.equal(deriveState({ confirmed: true }), 'confirmed')           // esquema antigo (bool)
  assert.equal(deriveState({ severity: 'info' }), 'informational')
  assert.equal(deriveState({ severity: 'high' }), 'probable')           // não-confirmado c/ severidade
  assert.equal(deriveState({ state: 'lixo', severity: 'low' }), 'probable') // state inválido → infere
})

test('computeFingerprint: estável entre scans e normaliza IDs numéricos', () => {
  const a = computeFingerprint({ type: 'xss', location: '/users/123/profile?x=1', parameter: 'q' })
  const b = computeFingerprint({ type: 'xss', location: '/users/456/profile?x=2', parameter: 'q' })
  assert.equal(a, b)                       // /123 e /456 → /{id}; query descartada
  assert.equal(typeof a, 'string')
  assert.equal(a.length, 16)
  assert.equal(computeFingerprint({ fingerprint: 'fixo' }), 'fixo') // respeita valor explícito
})

// ── SEC-1: allowlist de env no spawn do agente ──────────────────────────────────
test('buildAgentEnv NÃO vaza segredos do backend para o agente', () => {
  process.env.JWT_SECRET = 'super-secreto-de-teste'
  process.env.MONGO_URI = 'mongodb+srv://user:pass@host/db'
  process.env.AZURE_CLIENT_SECRET = 'azure-secreto'
  process.env.ADMIN_PASSWORD = 'senha-admin'

  const env = buildAgentEnv({ ENGAGEMENT_ID: 'x', AGENT_ROLE: 'blackbox', RIFT_ALLOW_AGGRESSIVE: 'false' })

  // Segredos do backend NÃO podem chegar ao processo do claude.
  assert.equal(env.JWT_SECRET, undefined)
  assert.equal(env.MONGO_URI, undefined)
  assert.equal(env.AZURE_CLIENT_SECRET, undefined)
  assert.equal(env.ADMIN_PASSWORD, undefined)

  // Os extras explícitos passam.
  assert.equal(env.ENGAGEMENT_ID, 'x')
  assert.equal(env.AGENT_ROLE, 'blackbox')
  assert.equal(env.RIFT_ALLOW_AGGRESSIVE, 'false')

  // A allowlist mínima passa (PATH existe em qualquer ambiente de execução).
  if (process.env.PATH) assert.equal(env.PATH, process.env.PATH)
})

test('ENV_ALLOWLIST não contém nenhum segredo conhecido', () => {
  const forbidden = ['JWT_SECRET', 'MONGO_URI', 'AZURE_CLIENT_SECRET', 'AZURE_CLIENT_ID',
    'AZURE_TENANT_ID', 'ADMIN_PASSWORD', 'ADMIN_PASSWORD_HASH', 'ALLOWED_ORIGINS']
  for (const f of forbidden) {
    assert.equal(ENV_ALLOWLIST.includes(f), false, `${f} não deveria estar na allowlist`)
  }
})
