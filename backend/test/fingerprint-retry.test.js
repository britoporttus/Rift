// P1-17: com fingerprint agora `unique`, um upsert que perde a corrida
// concorrente (E11000) precisa cair pra um update puro em vez de engolir o
// erro silenciosamente (perdendo a atualização daquele asset/credencial).
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'

const { upsertAsset } = require('../src/asm/scanner')
const { persistResults } = require('../src/leaks/search')
const DomainAsset = require('../src/models/DomainAsset')
const LeakedCredential = require('../src/models/LeakedCredential')
const LeakDomain = require('../src/models/LeakDomain')

// Frente 0: os módulos recebem o `db` do tenant como 1º argumento. Este db falso
// aponta para os MESMOS objetos de model que o teste monkeypatcha abaixo, então
// os stubs continuam interceptando as chamadas.
const db = { DomainAsset, LeakedCredential, LeakDomain }

function dupKeyError() {
  const err = new Error('E11000 duplicate key error')
  err.code = 11000
  return err
}

test('upsertAsset: E11000 no upsert cai pra update puro (não perde a escrita)', async () => {
  const original = DomainAsset.findOneAndUpdate
  let calls = []
  DomainAsset.findOneAndUpdate = async (filter, update, opts) => {
    calls.push({ filter, update, opts })
    if (calls.length === 1) throw dupKeyError()
    return {}
  }
  try {
    await upsertAsset(db, 'dom1', 'fp-x', { type: 'web', value: 'a.com' })
    assert.equal(calls.length, 2, 'deveria tentar o upsert e depois o retry como update')
    assert.equal(calls[0].opts.upsert, true)
    assert.equal(calls[1].opts, undefined, 'retry deveria ser update puro, sem upsert')
    assert.deepEqual(calls[1].filter, { fingerprint: 'fp-x' })
  } finally { DomainAsset.findOneAndUpdate = original }
})

test('upsertAsset: erro que NÃO é duplicate key não tenta retry (comportamento antigo preservado)', async () => {
  const original = DomainAsset.findOneAndUpdate
  let calls = 0
  DomainAsset.findOneAndUpdate = async () => { calls++; throw new Error('erro genérico de conexão') }
  try {
    await upsertAsset(db, 'dom1', 'fp-y', { type: 'web', value: 'b.com' })
    assert.equal(calls, 1, 'erro não-11000 não deveria disparar retry')
  } finally { DomainAsset.findOneAndUpdate = original }
})

test('persistResults: E11000 no upsert de LeakedCredential cai pra update puro', async () => {
  const originalCred = LeakedCredential.findOneAndUpdate
  const originalFind = LeakedCredential.find
  const originalLD = LeakDomain.findOneAndUpdate
  const originalLDFind = LeakDomain.findOne

  let calls = []
  LeakedCredential.findOneAndUpdate = async (filter, update, opts) => {
    calls.push({ filter, update, opts })
    if (calls.length === 1) throw dupKeyError()
    return {}
  }
  LeakedCredential.find = () => ({ lean: async () => [] })
  LeakDomain.findOneAndUpdate = async () => ({})
  LeakDomain.findOne = () => ({ lean: async () => null })

  try {
    await persistResults(db, 'acme.com', {
      breaches: [{ provider: 'dehashed', category: 'breach', account: 'a@acme.com' }],
      providerIds: ['dehashed'],
    })
    assert.equal(calls.length, 2, 'deveria tentar o upsert e depois o retry como update')
    assert.equal(calls[0].opts.upsert, true)
    assert.equal(calls[1].opts, undefined)
  } finally {
    LeakedCredential.findOneAndUpdate = originalCred
    LeakedCredential.find = originalFind
    LeakDomain.findOneAndUpdate = originalLD
    LeakDomain.findOne = originalLDFind
  }
})
