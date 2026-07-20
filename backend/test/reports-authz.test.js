// P0-5 (auditoria 2026-07-20): GET /:engagementId/narrative devolvia o
// resumo executivo (C-level) completo a QUALQUER usuário autenticado — o
// POST irmão já checava role admin, o GET não. Ver docs/ROADMAP-AUDITORIA-2026-07-20.md.
//
// Sem supertest/DB no projeto: inspeciona o Router do Express diretamente e
// invoca o handler da rota com req/res falsos — suficiente pra travar que o
// gate de admin é a PRIMEIRA coisa que a rota faz (nunca chega ao banco pra
// um usuário não-admin).
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'
const router = require('../src/api/reports')
const { isExecutiveReport } = router

function findHandler(method, path) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path && layer.route.methods[method]) {
      return layer.route.stack[layer.route.stack.length - 1].handle
    }
  }
  throw new Error(`rota não encontrada: ${method.toUpperCase()} ${path}`)
}

function fakeRes() {
  const res = { statusCode: null, body: null }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

test('GET /:engagementId/narrative NEGA a usuário não-admin antes de tocar o banco', async () => {
  const handle = findHandler('get', '/:engagementId/narrative')
  const req = { params: { engagementId: 'qualquer-id' }, user: { role: 'user' } }
  const res = fakeRes()
  // Se o gate não for a primeira linha, isto chegaria em getEngagement() sem
  // Mongo conectado e rejeitaria com um erro de conexão em vez de 403 —
  // qualquer um dos dois cenários falha o assert abaixo, mas só o 403 passa.
  await handle(req, res, (err) => { throw err || new Error('next() chamado inesperadamente') })
  assert.equal(res.statusCode, 403)
  assert.match(res.body.error, /administrador/i)
})

test('GET /:engagementId/narrative e POST irmão exigem o MESMO gate (regressão de simetria)', async () => {
  const getHandle = findHandler('get', '/:engagementId/narrative')
  const postHandle = findHandler('post', '/:engagementId/narrative')
  const req = { params: { engagementId: 'x' }, user: { role: 'user' } }

  const resGet = fakeRes()
  await getHandle(req, resGet, (err) => { throw err || new Error('next() inesperado') })
  const resPost = fakeRes()
  await postHandle(req, resPost, (err) => { throw err || new Error('next() inesperado') })

  assert.equal(resGet.statusCode, 403)
  assert.equal(resPost.statusCode, 403)
})

// P0-6: nomes REAIS já existentes em disco (ver find em Agentes-Pentest/*/clients/)
test('isExecutiveReport reconhece a convenção real "clevel-*" das versões v2/v2-next (bug já ativo hoje)', () => {
  assert.equal(isExecutiveReport('clevel-surface-2026-07-08.md'), true)
  assert.equal(isExecutiveReport('clevel-2026-07-14.md'), true)
  assert.equal(isExecutiveReport('clevel-20260526.md'), true)
  assert.equal(isExecutiveReport('CLEVEL-surface-2026-07-15.md'), true) // case-insensitive
})

test('isExecutiveReport mantém compat com o nome legado "*executivo*" (framework v1)', () => {
  assert.equal(isExecutiveReport('relatorio-executivo.md'), true)
})

test('isExecutiveReport NÃO marca relatórios técnicos reais como executivo (sem falso positivo)', () => {
  assert.equal(isExecutiveReport('technical-surface-2026-07-08.md'), false)
  assert.equal(isExecutiveReport('technical-20260526.md'), false)
  assert.equal(isExecutiveReport('report-surface-2026-07-08.html'), false)
  assert.equal(isExecutiveReport('pentest-report-porttus-20260417.html'), false)
  assert.equal(isExecutiveReport('engagement-summary.md'), false)
})
