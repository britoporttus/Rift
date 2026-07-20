// P2-32 (auditoria 2026-07-20): $top=100 sem paginação no Graph API — admin
// legítimo membro de >100 grupos AAD com o grupo-admin além da primeira
// página não recebia a role (falha para o lado seguro, mas afeta
// disponibilidade). Ver docs/ROADMAP-AUDITORIA-2026-07-20.md.
const { test } = require('node:test')
const assert = require('node:assert')
const { EventEmitter } = require('events')
const https = require('https')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'
const { getUserGroups, MAX_GROUP_PAGES } = require('../src/api/auth-microsoft')

function mockHttps(responder) {
  const original = https.request
  let calls = 0
  https.request = (options, callback) => {
    calls++
    const res = new EventEmitter()
    callback(res)
    const body = JSON.stringify(responder(options, calls))
    process.nextTick(() => { res.emit('data', Buffer.from(body)); res.emit('end') })
    const req = new EventEmitter()
    req.end = () => {}
    return req
  }
  return { restore: () => { https.request = original }, getCalls: () => calls }
}

test('getUserGroups segue @odata.nextLink e agrega os ids de todas as páginas', async () => {
  const { restore, getCalls } = mockHttps((options, call) => {
    if (call === 1) {
      assert.match(options.path, /\$top=100/)
      return { value: [{ id: 'g1' }, { id: 'g2' }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/memberOf?$select=id&$top=100&$skiptoken=abc' }
    }
    return { value: [{ id: 'g3' }] } // última página, sem nextLink
  })
  try {
    const ids = await getUserGroups('fake-token')
    assert.deepEqual(ids.sort(), ['g1', 'g2', 'g3'])
    assert.equal(getCalls(), 2)
  } finally { restore() }
})

test('getUserGroups para na página 1 quando não há @odata.nextLink (caso comum, ≤100 grupos)', async () => {
  const { restore, getCalls } = mockHttps(() => ({ value: [{ id: 'g1' }] }))
  try {
    const ids = await getUserGroups('fake-token')
    assert.deepEqual(ids, ['g1'])
    assert.equal(getCalls(), 1)
  } finally { restore() }
})

test('getUserGroups respeita o teto MAX_GROUP_PAGES (nunca faz loop sem fim)', async () => {
  const { restore, getCalls } = mockHttps(() => ({
    value: [{ id: 'x' }],
    '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/memberOf?$skiptoken=sempre-tem-mais',
  }))
  try {
    await getUserGroups('fake-token')
    assert.equal(getCalls(), MAX_GROUP_PAGES)
  } finally { restore() }
})

test('getUserGroups: resposta malformada não lança erro (resolve vazio)', async () => {
  const original = https.request
  https.request = (options, callback) => {
    const res = new EventEmitter()
    callback(res)
    process.nextTick(() => { res.emit('data', Buffer.from('not json')); res.emit('end') })
    const req = new EventEmitter()
    req.end = () => {}
    return req
  }
  try {
    const ids = await getUserGroups('fake-token')
    assert.deepEqual(ids, [])
  } finally { https.request = original }
})
