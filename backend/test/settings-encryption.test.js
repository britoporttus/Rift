// P2-35 (auditoria 2026-07-20): chaves de API dos leak providers (HIBP/DeHashed/
// LeakCheck) viviam em texto claro em backend/data/settings.json — qualquer
// processo/usuário com acesso de leitura ao filesystem da VPS as lia direto.
// Testa só as funções PURAS de cripto (sem tocar o settings.json real — o
// módulo grava num arquivo de produção, não injetável). Ver
// docs/ROADMAP-AUDITORIA-2026-07-20.md.
const { test } = require('node:test')
const assert = require('node:assert')

test('encryptLeakProviders + decryptLeakProviders: roundtrip com SETTINGS_ENCRYPTION_KEY definida', () => {
  const original = process.env.SETTINGS_ENCRYPTION_KEY
  process.env.SETTINGS_ENCRYPTION_KEY = 'chave-de-teste-qualquer-string-serve-aqui'
  delete require.cache[require.resolve('../src/settings')]
  const settings = require('../src/settings')
  try {
    const data = { dehashed: { apiKey: 'sk-abc123', apiUser: 'user@x.com' }, hibp: { apiKey: 'hibp-key' } }
    const enc = settings.encryptLeakProviders(data)
    assert.ok(enc.iv && enc.tag && enc.data, 'deveria produzir iv/tag/data')
    // Nada do texto claro deveria aparecer no blob cifrado.
    assert.equal(JSON.stringify(enc).includes('sk-abc123'), false)
    const dec = settings.decryptLeakProviders(enc)
    assert.deepEqual(dec, data)
  } finally {
    if (original === undefined) delete process.env.SETTINGS_ENCRYPTION_KEY
    else process.env.SETTINGS_ENCRYPTION_KEY = original
  }
})

test('encryptLeakProviders: sem SETTINGS_ENCRYPTION_KEY, devolve null (chamador cai pro texto claro)', () => {
  const original = process.env.SETTINGS_ENCRYPTION_KEY
  delete process.env.SETTINGS_ENCRYPTION_KEY
  delete require.cache[require.resolve('../src/settings')]
  const settings = require('../src/settings')
  try {
    assert.equal(settings.encryptLeakProviders({ hibp: { apiKey: 'x' } }), null)
  } finally {
    if (original !== undefined) process.env.SETTINGS_ENCRYPTION_KEY = original
  }
})

test('decryptLeakProviders: chave errada ou dado corrompido não lança erro (devolve null)', () => {
  const original = process.env.SETTINGS_ENCRYPTION_KEY
  process.env.SETTINGS_ENCRYPTION_KEY = 'chave-A'
  delete require.cache[require.resolve('../src/settings')]
  const settings = require('../src/settings')
  try {
    const enc = settings.encryptLeakProviders({ hibp: { apiKey: 'segredo' } })

    process.env.SETTINGS_ENCRYPTION_KEY = 'chave-B-diferente'
    delete require.cache[require.resolve('../src/settings')]
    const settingsWithOtherKey = require('../src/settings')
    assert.equal(settingsWithOtherKey.decryptLeakProviders(enc), null)

    assert.equal(settingsWithOtherKey.decryptLeakProviders({ iv: 'não-hex-válido', tag: 'x', data: 'y' }), null)
    assert.equal(settingsWithOtherKey.decryptLeakProviders(null), null)
  } finally {
    if (original === undefined) delete process.env.SETTINGS_ENCRYPTION_KEY
    else process.env.SETTINGS_ENCRYPTION_KEY = original
  }
})

test('readLeakProvidersStore: lê o legado em texto claro quando não há leakProvidersEnc', () => {
  delete require.cache[require.resolve('../src/settings')]
  const settings = require('../src/settings')
  const legacy = { leakProviders: { hibp: { apiKey: 'chave-antiga-em-texto-claro' } } }
  assert.deepEqual(settings.readLeakProvidersStore(legacy), legacy.leakProviders)
})

test('readLeakProvidersStore: sem nada configurado, devolve objeto vazio', () => {
  delete require.cache[require.resolve('../src/settings')]
  const settings = require('../src/settings')
  assert.deepEqual(settings.readLeakProvidersStore({}), {})
})
