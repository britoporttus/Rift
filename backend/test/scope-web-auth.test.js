// scope.js — o pack web-auth é AUTENTICADO mas de escopo WEB. Garante que não vira
// um "tenant de nuvem" por engano (senão o scope.yaml de autorização contradiz a
// realidade: web-auth é pentest web com login, não assessment de tenant).
const { test } = require('node:test')
const assert = require('node:assert')
const { buildScopeDoc, buildStateDoc } = require('../src/scope')

const engFor = (pack) => ({
  target: 'app.exemplo.com',
  domainPackId: pack,
  scope: { environment: 'production', appType: 'web+api', intensity: 'medium' },
  createdAt: new Date('2026-01-01T00:00:00Z'),
})

test('web-auth: agent_role authenticated, escopo web (wildcard), SEM bloco cloud', () => {
  const doc = buildScopeDoc(engFor('web-auth'), 'web-auth')
  assert.equal(doc.agent_role, 'authenticated')
  assert.deepEqual(doc.scope.domains, ['app.exemplo.com', '*.app.exemplo.com'])
  assert.equal(doc.scope.app_type, 'web+api')          // intake web, não o id do pack
  assert.equal(doc.cloud, undefined)                    // NÃO é tenant de nuvem
  assert.equal(doc.authorization, undefined)
})

test('web-auth: credential_state user_level (login), não service_principal', () => {
  const st = buildStateDoc(engFor('web-auth'), 'web-auth')
  assert.equal(st.credential_state, 'user_level')
  assert.equal(st.agent_role, 'authenticated')
})

test('azure (contraste): tenant de nuvem — domínio único + bloco cloud + service_principal', () => {
  const doc = buildScopeDoc(engFor('azure'), 'azure')
  assert.deepEqual(doc.scope.domains, ['app.exemplo.com'])   // sem wildcard
  assert.ok(doc.cloud && doc.authorization)                  // bloco de tenant presente
  const st = buildStateDoc(engFor('azure'), 'azure')
  assert.equal(st.credential_state, 'service_principal')
})

test('web (contraste black-box): blackbox, sem credencial', () => {
  const doc = buildScopeDoc(engFor('web'), 'web')
  assert.equal(doc.agent_role, 'blackbox')
  assert.equal(doc.cloud, undefined)
  const st = buildStateDoc(engFor('web'), 'web')
  assert.equal(st.credential_state, 'none')
})
