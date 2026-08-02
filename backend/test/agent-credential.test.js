// P0-8 (auditoria 2026-07-20): credencial do agente exfiltrável por prompt
// injection, sem chave dedicada nem controle de egress.
//
// A auditoria assumiu que ANTHROPIC_API_KEY/CLAUDE_CODE_OAUTH_TOKEN estavam no
// ambiente. Na verificação de 2026-08-01, nenhuma das duas está setada: o CLI
// autentica pelo arquivo ~/.claude/.credentials.json. O que dá para garantir em
// código é (a) suporte a uma credencial DEDICADA ao deployment e (b) que nunca
// entre mais de uma credencial no processo do agente.
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'

const { agentCredential, ENV_ALLOWLIST } = require('../src/agent-runner')

test('chave dedicada tem precedência sobre a compartilhada', () => {
  const c = agentCredential({
    RIFT_AGENT_ANTHROPIC_API_KEY: 'sk-dedicada',
    ANTHROPIC_API_KEY: 'sk-compartilhada',
    CLAUDE_CODE_OAUTH_TOKEN: 'oauth-pessoal',
  })
  assert.equal(c.kind, 'dedicated-api-key')
  assert.equal(c.vars.ANTHROPIC_API_KEY, 'sk-dedicada')
})

test('NUNCA passa duas credenciais para o mesmo processo (reduz o raio de exfiltração)', () => {
  const c = agentCredential({ ANTHROPIC_API_KEY: 'sk-x', CLAUDE_CODE_OAUTH_TOKEN: 'oauth-y' })
  assert.equal(Object.keys(c.vars).length, 1, 'só uma credencial no env do agente')
  assert.equal(c.vars.CLAUDE_CODE_OAUTH_TOKEN, undefined, 'token pessoal não acompanha a chave de API')
})

test('sem chave de API, cai no token OAuth', () => {
  const c = agentCredential({ CLAUDE_CODE_OAUTH_TOKEN: 'oauth-y' })
  assert.equal(c.kind, 'shared-oauth-token')
  assert.equal(c.vars.CLAUDE_CODE_OAUTH_TOKEN, 'oauth-y')
})

test('sem nada no env, o CLI resolve pelo arquivo de credencial (estado atual do deployment)', () => {
  const c = agentCredential({})
  assert.equal(c.kind, 'subscription-file')
  assert.deepEqual(c.vars, {})
})

// ── SEC-1: a allowlist não pode voltar a vazar segredo do backend ────────────

test('segredos do backend seguem fora da allowlist de env do agente', () => {
  for (const secret of ['JWT_SECRET', 'MONGO_URI', 'ADMIN_PASSWORD', 'AZURE_CLIENT_SECRET']) {
    assert.equal(ENV_ALLOWLIST.includes(secret), false, `${secret} não pode ir para o agente`)
  }
})

test('credencial saiu da allowlist estática — só entra via agentCredential()', () => {
  // Se voltarem para a lista, as duas seriam passadas juntas de novo.
  assert.equal(ENV_ALLOWLIST.includes('ANTHROPIC_API_KEY'), false)
  assert.equal(ENV_ALLOWLIST.includes('CLAUDE_CODE_OAUTH_TOKEN'), false)
})
