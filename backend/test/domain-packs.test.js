// Domain packs (ETAPA 0 do roadmap multi-domínio). Garante: resolução por id com
// fallback seguro para 'web', distinção válido-vs-executável (planned não roda),
// pack #0 'web' é no-op (systemPrompt vazio), e shape público JSON-safe p/ o seletor.
const { test } = require('node:test')
const assert = require('node:assert')
const dp = require('../src/domain-packs')

test('getDomainPack: id válido resolve; inválido/ausente cai no default web', () => {
  assert.equal(dp.getDomainPack('web').id, 'web')
  assert.equal(dp.getDomainPack('azure').id, 'azure')
  assert.equal(dp.getDomainPack('inexistente').id, dp.DEFAULT_DOMAIN_PACK_ID)
  assert.equal(dp.getDomainPack(undefined).id, dp.DEFAULT_DOMAIN_PACK_ID)
  assert.equal(dp.getDomainPack(null).id, dp.DEFAULT_DOMAIN_PACK_ID)
  assert.equal(dp.DEFAULT_DOMAIN_PACK_ID, 'web')
})

test('isValidDomainPackId reconhece só ids do registro (inclui planned)', () => {
  assert.equal(dp.isValidDomainPackId('web'), true)
  assert.equal(dp.isValidDomainPackId('azure'), true)   // existe, mas planned
  assert.equal(dp.isValidDomainPackId('ad'), true)
  assert.equal(dp.isValidDomainPackId('sap'), true)
  assert.equal(dp.isValidDomainPackId('nope'), false)
  assert.equal(dp.isValidDomainPackId(123), false)
})

test('isRunnableDomainPackId: web e azure rodam; ad/sap/aws/gcp são planned', () => {
  assert.equal(dp.isRunnableDomainPackId('web'), true)
  assert.equal(dp.isRunnableDomainPackId('azure'), true)   // ETAPA 1: azure ficou ready
  assert.equal(dp.isRunnableDomainPackId('ad'), false)     // exige runner
  assert.equal(dp.isRunnableDomainPackId('sap'), false)    // exige runner
  assert.equal(dp.isRunnableDomainPackId('aws'), false)    // futuro
  assert.equal(dp.isRunnableDomainPackId('gcp'), false)    // futuro
  assert.equal(dp.isRunnableDomainPackId('nope'), false)
})

test('pack #0 web é NO-OP: systemPrompt vazio, available, external, per-phase, sem cred', () => {
  const web = dp.getDomainPack('web')
  assert.equal(dp.loadDomainPrompt(web), '')   // nada é injetado → comportamento atual intacto
  assert.equal(web.available, true)
  assert.equal(web.status, 'ready')
  assert.equal(web.position, 'external')
  assert.equal(web.checkpointPolicy, 'per-phase')
  assert.equal(web.credentialHandling, 'none')
})

test('packs internos (ad/sap) exigem posição de rede e checkpoint por-ação', () => {
  for (const id of ['ad', 'sap']) {
    const p = dp.getDomainPack(id)
    assert.equal(p.available, false)
    assert.equal(p.position, 'network')          // exige runner dentro da rede
    assert.equal(p.checkpointPolicy, 'per-action') // destrutivo → gate por ação
    assert.equal(p.credentialHandling, 'vault')
  }
  // azure é autenticado mas ainda roda da VPS (external) — valida o eixo do Conselho.
  assert.equal(dp.getDomainPack('azure').position, 'external')
})

test('listDomainPacks: 7 packs, shape JSON-safe (sem systemPrompt/toolManifest cru)', () => {
  const list = dp.listDomainPacks()
  assert.equal(list.length, 7)
  const ids = list.map((p) => p.id)
  assert.deepEqual(ids, ['web', 'web-auth', 'azure', 'ad', 'sap', 'aws', 'gcp'])   // ordem = sequência do roadmap
  for (const p of list) {
    assert.ok(p.id && p.label && p.note)
    assert.equal(typeof p.available, 'boolean')
    assert.ok(['ready', 'planned'].includes(p.status))
    assert.equal(typeof p.systemPrompt, 'undefined')   // não vaza o prompt cru
    assert.equal(typeof p.toolManifest, 'undefined')
    assert.equal(typeof p.credentialSpec, 'undefined') // spec cru não vaza (só credentialFields)
    assert.equal(typeof p.requiresRunner, 'boolean')
    assert.ok(Array.isArray(p.credentialFields))
  }
  // executáveis hoje: web + web-auth + azure
  assert.equal(list.filter((p) => p.available).length, 3)
})

test('web-auth: autenticado de escopo web (vault + authStyle web), disponível', () => {
  const wa = dp.listDomainPacks().find((p) => p.id === 'web-auth')
  assert.ok(wa)
  assert.equal(wa.available, true)
  assert.equal(wa.credentialHandling, 'vault')
  assert.equal(wa.authStyle, 'web')
  assert.equal(dp.needsCredentials('web-auth'), true)
  assert.equal(dp.requiresRunner('web-auth'), false)
  // instrui o agente a usar as credenciais (não é no-op como o 'web' black-box)
  assert.match(dp.loadDomainPrompt('web-auth'), /AUTENTICADO/)
})

test('loadDomainPrompt aceita id ou objeto e nunca quebra', () => {
  assert.equal(dp.loadDomainPrompt('web'), '')
  assert.equal(dp.loadDomainPrompt({ id: 'web' }), '')
  assert.equal(dp.loadDomainPrompt(undefined), '')
  assert.equal(dp.loadDomainPrompt(null), '')
})

test('azure: metodologia carrega do promptFile (src/packs/azure.md)', () => {
  const prompt = dp.loadDomainPrompt('azure')
  assert.ok(prompt.length > 500, 'metodologia azure deve ter conteúdo')
  assert.match(prompt, /Entra ID/)
  assert.match(prompt, /read-only/i)
  assert.match(prompt, /aprovação/i)           // checkpoint por-ação embutido na metodologia
  assert.match(prompt, /management\.azure\.com/) // alcance cloud (external)
  // web continua sem prompt (no-op) mesmo com o mecanismo de promptFile ativo
  assert.equal(dp.loadDomainPrompt('web'), '')
})

test('loadCheckpointDirective: per-action injeta gate destrutivo; web (per-phase) é no-op', () => {
  // web = per-phase → vazio (comportamento atual intacto)
  assert.equal(dp.loadCheckpointDirective('web'), '')
  assert.equal(dp.loadCheckpointDirective(dp.getDomainPack('web')), '')
  // azure/ad/sap = per-action → bloco de checkpoint por ação presente
  for (const id of ['azure', 'ad', 'sap']) {
    const block = dp.loadCheckpointDirective(id)
    assert.match(block, /CHECKPOINT POR AÇÃO/)
    assert.match(block, /aprovação/i)
    assert.match(block, /blast/i)   // "blast radius" (raio de impacto)
  }
  // resolve por id ou por objeto, e nunca quebra
  assert.equal(dp.loadCheckpointDirective(undefined), '')  // default web
  assert.equal(dp.loadCheckpointDirective(null), '')
})

test('needsCredentials / requiresRunner: web livre; azure cred+VPS; ad/sap cred+runner', () => {
  assert.equal(dp.needsCredentials('web'), false)
  assert.equal(dp.requiresRunner('web'), false)
  // azure: autenticado, mas roda da VPS (sem runner)
  assert.equal(dp.needsCredentials('azure'), true)
  assert.equal(dp.requiresRunner('azure'), false)
  // ad/sap: autenticado E exige runner interno (posição de rede)
  for (const id of ['ad', 'sap']) {
    assert.equal(dp.needsCredentials(id), true)
    assert.equal(dp.requiresRunner(id), true)
  }
  // aws/gcp: cloud autenticado, da VPS (futuro)
  assert.equal(dp.requiresRunner('aws'), false)
  assert.equal(dp.requiresRunner('gcp'), false)
})

test('buildCredentialEnv: mapeia campos → env vars via credentialSpec (só presentes)', () => {
  const env = dp.buildCredentialEnv('azure', {
    tenantId: 'T', clientId: 'C', clientSecret: 'S', subscriptionId: 'SUB',
  })
  assert.deepEqual(env, {
    AZURE_TENANT_ID: 'T', AZURE_CLIENT_ID: 'C', AZURE_CLIENT_SECRET: 'S', AZURE_SUBSCRIPTION_ID: 'SUB',
  })
  // campos opcionais ausentes não entram no env
  const env2 = dp.buildCredentialEnv('azure', { tenantId: 'T', clientId: 'C', clientSecret: 'S' })
  assert.equal(env2.AZURE_SUBSCRIPTION_ID, undefined)
  assert.equal(env2.AZURE_TENANT_ID, 'T')
  // web não tem spec → {}
  assert.deepEqual(dp.buildCredentialEnv('web', { x: 1 }), {})
})

test('validateCredentials: exige campos obrigatórios; ignora opcionais', () => {
  assert.deepEqual(dp.validateCredentials('azure', { tenantId: 'T', clientId: 'C', clientSecret: 'S' }), { ok: true, missing: [] })
  const r = dp.validateCredentials('azure', { tenantId: 'T' })
  assert.equal(r.ok, false)
  assert.deepEqual(r.missing.sort(), ['clientId', 'clientSecret'])
  // subscriptionId é opcional → não entra em missing
  assert.equal(dp.validateCredentials('azure', { tenantId: 'T', clientId: 'C', clientSecret: 'S' }).missing.includes('subscriptionId'), false)
})

test('credentialFields expõe metadados (labels/secret), requiredTools lista o manifest', () => {
  const fields = dp.credentialFields('azure')
  assert.ok(fields.find((f) => f.name === 'clientSecret' && f.secret === true))
  assert.equal(dp.credentialFields('web').length, 0)
  assert.ok(dp.requiredTools('azure').includes('az'))
})
