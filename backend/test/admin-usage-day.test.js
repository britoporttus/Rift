// Regressão de `/api/admin/usage`: o agrupamento por dia fazia
// `(entry.ts || entry.date || '').slice(0,10)`. `Usage.ts` é `Date` no schema,
// então a rota estourava com "slice is not a function" — 500 no painel admin.
// Bug pré-existente que só ficou visível com o fan-out por tenant da Frente 0,
// que garante que a rota realmente lê registros.
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'
const adminRouter = require('../src/api/admin')

function handlerFor(path) {
  const layer = adminRouter.stack.find((l) => l.route && l.route.path === path && l.route.methods.get)
  return layer.route.stack[layer.route.stack.length - 1].handle
}
function fakeRes() {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

// Substitui o fan-out por um conjunto controlado, cobrindo os dois formatos que
// existem em disco (Date novo e string legado) + lixo.
function withUsage(rows, fn) {
  const tenancy = require('../src/tenancy')
  const original = tenancy.forEachTenant
  tenancy.forEachTenant = async (cb) => [{ slug: 't', ok: true, value: await cb({ tenant: { slug: 't' }, db: {
    Usage: { find: () => ({ sort: () => ({ lean: async () => rows }) }) },
  } }) }]
  return Promise.resolve(fn()).finally(() => { tenancy.forEachTenant = original })
}

test('agrupa por dia com ts como Date (o caso que dava 500)', async () => {
  await withUsage([{ ts: new Date('2026-08-01T10:00:00Z'), usd: 1.5, tokens: 100, userId: 'u1' }], async () => {
    const res = fakeRes()
    await handlerFor('/usage')({}, res, (e) => { throw e })
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, [{ date: '2026-08-01', usd: 1.5, tokens: 100 }])
  })
})

test('ainda aceita ts como string ISO (registros legados)', async () => {
  await withUsage([{ ts: '2026-07-15T09:00:00.000Z', usd: 2, tokens: 50 }], async () => {
    const res = fakeRes()
    await handlerFor('/usage')({}, res, (e) => { throw e })
    assert.equal(res.body[0].date, '2026-07-15')
  })
})

test('registro sem data não derruba a rota — é ignorado', async () => {
  await withUsage([{ usd: 1 }, { ts: null, usd: 2 }, { ts: new Date('2026-08-01'), usd: 3, tokens: 1 }], async () => {
    const res = fakeRes()
    await handlerFor('/usage')({}, res, (e) => { throw e })
    assert.equal(res.body.length, 1, 'só o registro com data válida entra')
    assert.equal(res.body[0].usd, 3)
  })
})

test('/usage/by-user também sobrevive a ts como Date', async () => {
  await withUsage([{ ts: new Date('2026-08-01T10:00:00Z'), usd: 1, tokens: 10, userId: 'u1', userName: 'A', engagementId: 'e1' }], async () => {
    const res = fakeRes()
    await handlerFor('/usage/by-user')({}, res, (e) => { throw e })
    assert.equal(res.body[0].days[0].date, '2026-08-01')
  })
})
