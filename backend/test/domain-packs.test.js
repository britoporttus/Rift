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

test('isRunnableDomainPackId: só web roda hoje; azure/ad/sap são planned', () => {
  assert.equal(dp.isRunnableDomainPackId('web'), true)
  assert.equal(dp.isRunnableDomainPackId('azure'), false)
  assert.equal(dp.isRunnableDomainPackId('ad'), false)
  assert.equal(dp.isRunnableDomainPackId('sap'), false)
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

test('listDomainPacks: 4 packs, shape JSON-safe (sem systemPrompt/toolManifest cru)', () => {
  const list = dp.listDomainPacks()
  assert.equal(list.length, 4)
  const ids = list.map((p) => p.id)
  assert.deepEqual(ids, ['web', 'azure', 'ad', 'sap'])   // ordem = sequência do roadmap
  for (const p of list) {
    assert.ok(p.id && p.label && p.note)
    assert.equal(typeof p.available, 'boolean')
    assert.ok(['ready', 'planned'].includes(p.status))
    assert.equal(typeof p.systemPrompt, 'undefined')   // não vaza o prompt cru
    assert.equal(typeof p.toolManifest, 'undefined')
  }
  // exatamente um pack executável hoje (web)
  assert.equal(list.filter((p) => p.available).length, 1)
})

test('loadDomainPrompt aceita id ou objeto e nunca quebra', () => {
  assert.equal(dp.loadDomainPrompt('web'), '')
  assert.equal(dp.loadDomainPrompt({ id: 'web' }), '')
  assert.equal(dp.loadDomainPrompt(undefined), '')
  assert.equal(dp.loadDomainPrompt(null), '')
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
