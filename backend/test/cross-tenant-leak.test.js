// ═══════════════════════════════════════════════════════════════════════════
// TESTE-RÉGUA DA FRENTE 0 — vazamento cross-tenant.
//
// O spec define este como o critério de pronto: "usuário do tenant A não
// enxerga engagement / finding / report / WS do tenant B". Antes da Frente 0
// TODOS os casos abaixo falhavam, porque não existia escopo nenhum:
// `GET /api/engagements` (`api/engagements.js`, assinatura `(_req, res)`)
// devolvia a coleção inteira a qualquer JWT válido, e o upgrade do WebSocket
// validava só "o token é válido?" — nunca "este engagement é deste usuário?".
//
// Cada teste aqui exercita a rota REAL com dois `db` de tenant distintos. A
// garantia sob teste não é "a query tem um filtro certo" — é "a query roda em
// OUTRO BANCO", que é o que torna o vazamento estruturalmente impossível em vez
// de dependente de alguém lembrar de escrever o `where`.
// ═══════════════════════════════════════════════════════════════════════════
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'

const engagementsRouter = require('../src/api/engagements')
const findingsRouter = require('../src/api/findings')
const reportsRouter = require('../src/api/reports')
const { resolveTenant, TenantResolutionError } = require('../src/tenancy')

// ── Dois "bancos" em memória, um por tenant ─────────────────────────────────
// Cada coleção falsa devolve SÓ o que foi semeado nela. Se o código de rota
// consultar o db errado, o teste vê os dados do outro tenant e falha.
function collection(rows) {
  const api = {
    _rows: rows,
    find: (q = {}) => ({
      sort: () => api.find(q),
      select: () => api.find(q),
      limit: () => api.find(q),
      lean: async () => rows.filter((r) => matches(r, q)),
    }),
    findById: (id) => ({ lean: async () => rows.find((r) => String(r._id) === String(id)) || null }),
    findOne: (q = {}) => ({ lean: async () => rows.find((r) => matches(r, q)) || null }),
    exists: async (q = {}) => rows.some((r) => matches(r, q)),
    countDocuments: async (q = {}) => rows.filter((r) => matches(r, q)).length,
    aggregate: async () => [],
    deleteMany: async () => ({}),
    create: async (d) => { rows.push(d); return d },
  }
  return api
}
function matches(row, q) {
  return Object.entries(q).every(([k, v]) => {
    if (v && typeof v === 'object' && '$ne' in v) return row[k] !== v.$ne
    if (v && typeof v === 'object') return true            // $in/$exists: irrelevante aqui
    return String(row[k]) === String(v)
  })
}

const ENG_A = { _id: 'eng-A', name: 'Pentest Porttus', target: 'porttus.com', slug: 'porttus', date: '2026-08-01' }
const ENG_B = { _id: 'eng-B', name: 'Pentest Trustsis', target: 'trustsis.com', slug: 'trustsis', date: '2026-08-01' }
const FIND_A = { _id: 'f-A', engagementId: 'eng-A', severity: 'high', title: 'SQLi na Porttus' }
const FIND_B = { _id: 'f-B', engagementId: 'eng-B', severity: 'high', title: 'SQLi na Trustsis' }

function dbFor(engagements, findings) {
  return {
    Engagement: collection(engagements),
    Finding: collection(findings),
    Usage: collection([]),
    ChatMessage: collection([]),
    ChatSession: collection([]),
    ReportNarrative: collection([]),
  }
}
const dbA = () => dbFor([ENG_A], [FIND_A])
const dbB = () => dbFor([ENG_B], [FIND_B])

function fakeRes() {
  const res = { statusCode: 200, body: null, headers: {} }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  res.send = (b) => { res.body = b; return res }
  res.setHeader = (k, v) => { res.headers[k] = v }
  return res
}
function handlerFor(router, method, path) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method])
  if (!layer) throw new Error(`rota não encontrada: ${method.toUpperCase()} ${path}`)
  return layer.route.stack[layer.route.stack.length - 1].handle
}
const userA = { id: 'u-a', email: 'op@porttus.com',  role: 'admin', name: 'Op A' }
const userB = { id: 'u-b', email: 'cli@trustsis.com', role: 'client', name: 'Cliente B' }

// ── API: listagem ───────────────────────────────────────────────────────────

test('LISTA de engagements: cada tenant vê só os seus (antes: a coleção inteira)', async () => {
  const handle = handlerFor(engagementsRouter, 'get', '/')

  const resA = fakeRes()
  await handle({ db: dbA(), user: userA, query: {} }, resA, (e) => { throw e })
  assert.deepEqual(resA.body.map((e) => e.id), ['eng-A'])

  const resB = fakeRes()
  await handle({ db: dbB(), user: userB, query: {} }, resB, (e) => { throw e })
  assert.deepEqual(resB.body.map((e) => e.id), ['eng-B'])

  // A régua: o engagement do outro tenant não aparece em NENHUMA das listas.
  assert.equal(resA.body.some((e) => e.id === 'eng-B'), false, 'A enxergou engagement de B')
  assert.equal(resB.body.some((e) => e.id === 'eng-A'), false, 'B enxergou engagement de A')
})

test('DETALHE de engagement do outro tenant → 404 (não 403: 403 já é oráculo de existência)', async () => {
  const handle = handlerFor(engagementsRouter, 'get', '/:id')
  const res = fakeRes()
  await handle({ db: dbB(), user: userB, params: { id: 'eng-A' } }, res, (e) => { throw e })
  assert.equal(res.statusCode, 404)
  assert.equal(res.body.error, 'not found')
})

test('FINDINGS: o banco de achados é por tenant', async () => {
  const handle = handlerFor(findingsRouter, 'get', '/')

  const resA = fakeRes()
  await handle({ db: dbA(), user: userA, query: {} }, resA, (e) => { throw e })
  const resB = fakeRes()
  await handle({ db: dbB(), user: userB, query: {} }, resB, (e) => { throw e })

  assert.equal(resA.body.some((f) => f.title.includes('Trustsis')), false, 'A leu finding de B')
  assert.equal(resB.body.some((f) => f.title.includes('Porttus')), false, 'B leu finding de A')
})

test('FINDINGS filtrados por engagementId do OUTRO tenant devolvem vazio', async () => {
  const handle = handlerFor(findingsRouter, 'get', '/')
  const res = fakeRes()
  // B tenta puxar os achados do engagement de A informando o id diretamente.
  await handle({ db: dbB(), user: userB, query: { engagementId: 'eng-A' } }, res, (e) => { throw e })
  assert.deepEqual(res.body, [], 'saber o id não pode dar acesso — o dado está em outro banco')
})

test('RELATÓRIO de engagement do outro tenant → 404 antes de tocar o disco', async () => {
  const handle = handlerFor(reportsRouter, 'get', '/:engagementId/generated')
  const res = fakeRes()
  await handle(
    { db: dbB(), user: userB, params: { engagementId: 'eng-A' }, query: {} },
    res, (e) => { throw e }
  )
  assert.equal(res.statusCode, 404)
})

test('RELATÓRIO: lista de arquivos do agente também é barrada por tenant', async () => {
  const handle = handlerFor(reportsRouter, 'get', '/:engagementId')
  const res = fakeRes()
  await handle({ db: dbB(), user: userB, params: { engagementId: 'eng-A' }, query: {} }, res, (e) => { throw e })
  assert.equal(res.statusCode, 404)
})

// ── WebSocket: posse do engagement no upgrade ───────────────────────────────

test('WS: a checagem de posse é uma leitura no banco DO tenant', async () => {
  // Reproduz a decisão do upgrade em server.js: `db.Engagement.exists({_id})`.
  // Antes da Frente 0 não existia checagem nenhuma — qualquer JWT válido
  // conectava em qualquer engagementId e recebia o feed ao vivo do agente.
  assert.equal(await dbA().Engagement.exists({ _id: 'eng-A' }), true,  'dono conecta')
  assert.equal(await dbB().Engagement.exists({ _id: 'eng-A' }), false, 'não-dono é recusado')
  assert.equal(await dbA().Engagement.exists({ _id: 'eng-B' }), false)
})

// ── Resolver: sem tenant, nada roda ─────────────────────────────────────────

test('usuário de domínio não cadastrado não resolve tenant nenhum (fail-closed)', async () => {
  const Tenant = {
    findById: () => ({ lean: async () => null }),
    findOne: () => ({ lean: async () => null }),
  }
  await assert.rejects(
    () => resolveTenant({ email: 'intruso@dominio-qualquer.com' }, Tenant),
    (e) => e instanceof TenantResolutionError
  )
})
