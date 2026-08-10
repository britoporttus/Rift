// computeAssetDiff (asm/diff.js) — mesmo espírito de asm-score-aggregate.test.js:
// função pura, testada isolada, sem tocar o Mongo.
const { test } = require('node:test')
const assert = require('node:assert')
const { computeAssetDiff } = require('../src/asm/diff')

test('primeiro scan (sem baseline): tudo é novo, nada pode ter "sumido"', () => {
  const current = [
    { type: 'subdomain', value: 'api.x.com', fingerprint: 'fp1', severity: 'info' },
    { type: 'subdomain', value: 'www.x.com', fingerprint: 'fp2', severity: 'info' },
  ]
  const r = computeAssetDiff({ previousAssets: [], currentAssets: current, scopedTypes: ['subdomain'] })
  assert.equal(r.newCount, 2)
  assert.equal(r.missingCount, 0)
  assert.deepEqual(r.missingAssets, [])
})

test('contagem por categoria: host vs porta/IP separados no diff (Bug 4)', () => {
  const previous = [{ type: 'subdomain', value: 'api.x.com', fingerprint: 'fp1' }]
  const current = [
    { type: 'subdomain', value: 'api.x.com', fingerprint: 'fp1' },
    { type: 'subdomain', value: 'novo.x.com', fingerprint: 'fp-host' },      // 1 host novo
    { type: 'port', value: '1.2.3.4:80', fingerprint: 'fp-p1' },             // 3 portas novas
    { type: 'port', value: '1.2.3.4:443', fingerprint: 'fp-p2' },
    { type: 'port', value: '1.2.3.4:8080', fingerprint: 'fp-p3' },
  ]
  const r = computeAssetDiff({ previousAssets: previous, currentAssets: current, scopedTypes: ['subdomain'] })
  assert.equal(r.newCount, 4, 'total de novos')
  assert.equal(r.newHostCount, 1, 'só 1 subdomínio novo — o headline não pode dizer +4')
  assert.equal(r.newOtherCount, 3, 'as 3 portas vão na linha "outros ativos"')
})

test('subdomínio novo (fingerprint que não existia antes) entra em newAssets', () => {
  const previous = [{ type: 'subdomain', value: 'api.x.com', fingerprint: 'fp1' }]
  const current = [
    { type: 'subdomain', value: 'api.x.com', fingerprint: 'fp1' },
    { type: 'subdomain', value: 'novo.x.com', fingerprint: 'fp-novo', severity: 'info' },
  ]
  const r = computeAssetDiff({ previousAssets: previous, currentAssets: current, scopedTypes: ['subdomain'] })
  assert.equal(r.newCount, 1)
  assert.equal(r.newAssets[0].value, 'novo.x.com')
})

test('asset "web" sumido conta como missing SÓ quando web está em scopedTypes (scan autorizado)', () => {
  const previous = [
    { type: 'subdomain', value: 'api.x.com', fingerprint: 'fp1' },
    { type: 'web', value: 'api.x.com', fingerprint: 'fp-web' },
  ]
  const current = [{ type: 'subdomain', value: 'api.x.com', fingerprint: 'fp1' }] // web não voltou

  const semWeb = computeAssetDiff({ previousAssets: previous, currentAssets: current, scopedTypes: ['subdomain'] })
  assert.equal(semWeb.missingCount, 0, 'domínio ficou não-autorizado: web fora de escopo, não conta como sumido')

  const comWeb = computeAssetDiff({ previousAssets: previous, currentAssets: current, scopedTypes: ['subdomain', 'web'] })
  assert.equal(comWeb.missingCount, 1, 'scan autorizado re-verificou web e não achou mais → sumiu de verdade')
  assert.equal(comWeb.missingAssets[0].value, 'api.x.com')
})

test('exposure não conta como sumido quando nuclei não rodou desta vez (fora de escopo)', () => {
  const previous = [{ type: 'exposure', value: 'api.x.com/.git', fingerprint: 'fp-exp' }]
  const current = []
  const r = computeAssetDiff({ previousAssets: previous, currentAssets: current, scopedTypes: ['subdomain', 'web'] })
  assert.equal(r.missingCount, 0)
})

test('trunca exemplos em 20 mas mantém a contagem total', () => {
  const previous = Array.from({ length: 30 }, (_, i) => ({ type: 'subdomain', value: `s${i}.x.com`, fingerprint: `old-${i}` }))
  const current = Array.from({ length: 30 }, (_, i) => ({ type: 'subdomain', value: `n${i}.x.com`, fingerprint: `new-${i}` }))
  const r = computeAssetDiff({ previousAssets: previous, currentAssets: current, scopedTypes: ['subdomain'] })
  assert.equal(r.newCount, 30)
  assert.equal(r.newAssets.length, 20)
  assert.equal(r.missingCount, 30)
  assert.equal(r.missingAssets.length, 20)
})

test('assets sem fingerprint são ignorados na comparação (nunca contam nem como novo nem sumido)', () => {
  const previous = [{ type: 'subdomain', value: 'x.com', fingerprint: null }]
  const current = [{ type: 'subdomain', value: 'y.com', fingerprint: undefined }]
  const r = computeAssetDiff({ previousAssets: previous, currentAssets: current, scopedTypes: ['subdomain'] })
  assert.equal(r.newCount, 0)
  assert.equal(r.missingCount, 0)
})
