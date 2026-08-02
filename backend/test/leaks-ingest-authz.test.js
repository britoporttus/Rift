// P0-3 (auditoria 2026-07-20): o gate de autorização legal era contornável.
//
// `runSearch` checa `Domain.authorized` antes de consultar provider pago, mas a
// rota de ingestão manual — pensada para o operador colar dado coletado no
// próprio navegador (Hudson Rock bloqueia IP de datacenter) — NUNCA checava
// nada, e o corpo `raw` é 100% controlado pelo cliente. Qualquer usuário
// autenticado podia fabricar "vazamentos" para um domínio de terceiro não
// autorizado e persistir dado pessoal sem base legal.
//
// Frente 0: `ingest` passou a receber o `db` do tenant como 1º argumento.
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'

const leaksRouter = require('../src/api/leaks')
const { ingest } = require('../src/leaks/search')

function fakeRes() {
  const res = { statusCode: null, body: null, headers: {} }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  res.setHeader = (k, v) => { res.headers[k] = v }
  return res
}

function findLayer(router, method, path) {
  return router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method])
}

// `db` de tenant falso: só precisa dos models que ingest() toca.
function fakeDb(domainReg) {
  return {
    Domain: { findOne: () => ({ lean: async () => domainReg }) },
    LeakedCredential: { findOneAndUpdate: async () => ({}), find: () => ({ lean: async () => [] }) },
    LeakDomain: { findOne: () => ({ lean: async () => null }), findOneAndUpdate: async () => ({}) },
  }
}

const PAYLOAD = {
  breaches: [{ provider: 'hudsonrock', category: 'stealer', account: 'a@alvo.com' }],
  aggregate: {}, extra: {}, providerIds: ['hudsonrock'], userName: 'operador',
}

// ── o núcleo: ingest() nega sem autorização ──────────────────────────────────

test('ingest() recusa domínio NÃO autorizado (o buraco: antes persistia)', async () => {
  const db = fakeDb({ _id: 'd1', domain: 'alvo.com', authorized: false })
  await assert.rejects(
    () => ingest(db, 'alvo.com', PAYLOAD),
    (err) => err.code === 'DOMAIN_NOT_AUTHORIZED',
    'domínio registrado mas não autorizado tem que ser recusado'
  )
})

test('ingest() recusa domínio nem sequer registrado', async () => {
  await assert.rejects(
    () => ingest(fakeDb(null), 'nunca-vi-esse.com', PAYLOAD),
    (err) => err.code === 'DOMAIN_NOT_AUTHORIZED'
  )
})

test('ingest() recusa `authorized` truthy-mas-não-true (ex.: string vinda de form)', async () => {
  const db = fakeDb({ _id: 'd1', domain: 'alvo.com', authorized: 'sim' })
  await assert.rejects(() => ingest(db, 'alvo.com', PAYLOAD), (err) => err.code === 'DOMAIN_NOT_AUTHORIZED')
})

test('ingest() valida o domínio antes de qualquer coisa', async () => {
  await assert.rejects(() => ingest(fakeDb(null), 'não é um domínio', PAYLOAD), /Domínio inválido/)
})

test('ingest() SEGUE quando o domínio está autorizado (não virou bloqueio geral)', async () => {
  const db = fakeDb({ _id: 'd1', domain: 'alvo.com', authorized: true })
  const out = await ingest(db, 'alvo.com', PAYLOAD)
  assert.ok(out, 'domínio autorizado tem que passar — senão o fix quebrou a feature')
})

// ── a rota: 403 + admin-only ─────────────────────────────────────────────────

test('POST /api/leaks/ingest devolve 403 (não 500) para domínio não autorizado', async () => {
  const layer = findLayer(leaksRouter, 'post', '/ingest')
  const handle = layer.route.stack[layer.route.stack.length - 1].handle
  const req = {
    body: { domain: 'alvo.com', source: 'hudsonrock', raw: { stealerFamilies: {} } },
    user: { role: 'admin', name: 'op' },
    db: fakeDb({ _id: 'd1', domain: 'alvo.com', authorized: false }),
  }
  const res = fakeRes()
  await handle(req, res, (err) => { throw err })
  assert.equal(res.statusCode, 403)
  assert.match(res.body.error, /não está autorizado/)
})

test('POST /api/leaks/ingest exige admin (grava dado de terceiro sem proveniência)', () => {
  const layer = findLayer(leaksRouter, 'post', '/ingest')
  // O handler final é precedido por um middleware de autorização próprio da
  // rota — o `requireAuth()` global do router não restringe role.
  assert.ok(layer.route.stack.length >= 2, 'rota /ingest precisa de um gate de role próprio')
})
