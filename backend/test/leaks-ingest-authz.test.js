// P0-3 (auditoria 2026-07-20): o gate de autorização legal era contornável.
//
// `runSearch` checa `Domain.authorized` antes de consultar provider pago, mas a
// rota de ingestão manual — pensada para o operador colar dado coletado no
// próprio navegador (Hudson Rock bloqueia IP de datacenter) — NUNCA checava
// nada, e o corpo `raw` é 100% controlado pelo cliente. Qualquer usuário
// autenticado podia fabricar "vazamentos" para um domínio de terceiro não
// autorizado e persistir dado pessoal sem base legal.
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'

const leaksRouter = require('../src/api/leaks')
const { ingest } = require('../src/leaks/search')
const Domain = require('../src/models/Domain')

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

// Stub de Domain.findOne(...).lean() com o registro desejado (ou null).
function withDomain(reg, fn) {
  const original = Domain.findOne
  Domain.findOne = () => ({ lean: async () => reg })
  return Promise.resolve(fn()).finally(() => { Domain.findOne = original })
}

const PAYLOAD = {
  breaches: [{ provider: 'hudsonrock', category: 'stealer', account: 'a@alvo.com' }],
  aggregate: {}, extra: {}, providerIds: ['hudsonrock'], userName: 'operador',
}

// ── o núcleo: ingest() nega sem autorização ──────────────────────────────────

test('ingest() recusa domínio NÃO autorizado (o buraco: antes persistia)', async () => {
  await withDomain({ _id: 'd1', domain: 'alvo.com', authorized: false }, async () => {
    await assert.rejects(
      () => ingest('alvo.com', PAYLOAD),
      (err) => err.code === 'DOMAIN_NOT_AUTHORIZED',
      'domínio registrado mas não autorizado tem que ser recusado'
    )
  })
})

test('ingest() recusa domínio nem sequer registrado', async () => {
  await withDomain(null, async () => {
    await assert.rejects(
      () => ingest('nunca-vi-esse.com', PAYLOAD),
      (err) => err.code === 'DOMAIN_NOT_AUTHORIZED'
    )
  })
})

test('ingest() recusa `authorized` truthy-mas-não-true (ex.: string vinda de form)', async () => {
  await withDomain({ _id: 'd1', domain: 'alvo.com', authorized: 'sim' }, async () => {
    await assert.rejects(() => ingest('alvo.com', PAYLOAD), (err) => err.code === 'DOMAIN_NOT_AUTHORIZED')
  })
})

test('ingest() valida o domínio antes de qualquer coisa', async () => {
  await assert.rejects(() => ingest('não é um domínio', PAYLOAD), /Domínio inválido/)
})

// ── a rota: 403 + admin-only ─────────────────────────────────────────────────

test('POST /api/leaks/ingest devolve 403 (não 500) para domínio não autorizado', async () => {
  const layer = findLayer(leaksRouter, 'post', '/ingest')
  const handle = layer.route.stack[layer.route.stack.length - 1].handle
  await withDomain({ _id: 'd1', domain: 'alvo.com', authorized: false }, async () => {
    const req = {
      body: { domain: 'alvo.com', source: 'hudsonrock', raw: { stealerFamilies: {} } },
      user: { role: 'admin', name: 'op' },
    }
    const res = fakeRes()
    await handle(req, res, (err) => { throw err })
    assert.equal(res.statusCode, 403)
    assert.match(res.body.error, /não está autorizado/)
  })
})

test('POST /api/leaks/ingest exige admin (grava dado de terceiro sem proveniência)', () => {
  const layer = findLayer(leaksRouter, 'post', '/ingest')
  // O handler final é precedido por um middleware de autorização próprio da
  // rota — o `requireAuth()` global do router não restringe role.
  assert.ok(layer.route.stack.length >= 2, 'rota /ingest precisa de um gate de role próprio')
})
