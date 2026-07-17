// Registro central das versões do agente (seletor A/B/C). Garante resolução por id,
// fallback seguro para o default, dirs de findings escopados por engagement, e o
// shape público consumido pela API/seletor.
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('path')
const fw = require('../src/frameworks')

test('getFramework: id válido resolve; inválido/ausente cai no default v2', () => {
  assert.equal(fw.getFramework('v2').id, 'v2')
  assert.equal(fw.getFramework('legacy').id, 'legacy')
  assert.equal(fw.getFramework('v3').id, 'v3')
  assert.equal(fw.getFramework('inexistente').id, fw.DEFAULT_FRAMEWORK_ID)
  assert.equal(fw.getFramework(undefined).id, fw.DEFAULT_FRAMEWORK_ID)
  assert.equal(fw.getFramework(null).id, fw.DEFAULT_FRAMEWORK_ID)
})

test('isValidFrameworkId reconhece só ids do registro', () => {
  assert.equal(fw.isValidFrameworkId('v2'), true)
  assert.equal(fw.isValidFrameworkId('legacy'), true)
  assert.equal(fw.isValidFrameworkId('nope'), false)
  assert.equal(fw.isValidFrameworkId(123), false)
})

test('listFrameworks: 4 versões (v2/v2c/legacy/v3), shape JSON-safe (sem função findingsDirs)', () => {
  const list = fw.listFrameworks()
  assert.equal(list.length, 4)   // v2c entrou na consolidação (977c916) — tronco padrão
  for (const f of list) {
    assert.ok(f.id && f.label)
    assert.equal(typeof f.available, 'boolean')
    assert.equal(typeof f.slashCommands, 'boolean')
    assert.equal(typeof f.findingsDirs, 'undefined')   // não vaza a função
  }
})

test('resolveFindingsDirs: escopado por engagement (nunca a raiz de clients/)', () => {
  const v2 = fw.resolveFindingsDirs(fw.getFramework('v2'), 'acme', '2026-07-14', 'acme.com')
  assert.equal(v2.length, 1)
  assert.ok(v2[0].endsWith(path.join('clients', 'acme', '2026-07-14', 'findings')))

  const legacy = fw.resolveFindingsDirs(fw.getFramework('legacy'), 'acme', '2026-07-14', 'acme.com')
  assert.equal(legacy.length, 2)
  assert.ok(legacy.some((d) => d.includes(path.join('clients', 'acme'))))
  assert.ok(legacy.some((d) => d.includes(path.join('results', 'acme_com_20260714'))))

  const v3 = fw.resolveFindingsDirs(fw.getFramework('v3'), 'acme', '2026-07-14', 'acme.com')
  assert.ok(v3.some((d) => d.endsWith('findings')))
  assert.ok(v3.some((d) => d.endsWith('evidence')))
})

test('resolveFindingsDirs nunca retorna vazio (fallback duro)', () => {
  // framework sem findingsDirs → cai no clients/{slug}/{date}/findings
  const dirs = fw.resolveFindingsDirs({ id: 'x', path: '/tmp/x' }, 'acme', '2026-07-14', 'acme.com')
  assert.ok(dirs.length >= 1)
})

test('port cursor→claude: legacy/v3 têm hasClaudeMd e o arquivo CLAUDE.md existe', () => {
  const fs = require('fs')
  for (const id of ['legacy', 'v3', 'v2']) {
    const f = fw.getFramework(id)
    assert.equal(f.hasClaudeMd, true, `${id} deve ter hasClaudeMd`)
    assert.ok(fs.existsSync(path.join(f.path, 'CLAUDE.md')), `${id} deve ter CLAUDE.md em disco`)
  }
})

test('sanitizeTarget normaliza alvo para o dir de results/ do legacy', () => {
  assert.equal(fw.sanitizeTarget('localhost:3000'), 'localhost_3000')
  assert.equal(fw.sanitizeTarget('https://acme.com/'), 'https_acme_com')
})
