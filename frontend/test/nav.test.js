// Regressão da COESÃO DE NAVEGAÇÃO (ciclo 2026-08-01).
//
// Dois bugs reais que estes testes travam:
//  (a) em /admin/users, DOIS itens do menu acendiam como ativos ao mesmo tempo;
//  (b) o breadcrumb usava match exato de rota e sumia em toda tela de detalhe.
const { test } = require('node:test')
const assert = require('node:assert')
const { matchesRoute, isActive, crumbsFor } = require('../lib/nav')

const MENU = ['/dominios', '/rede-interna', '/mapa', '/findings', '/reports', '/admin/users', '/admin']

const NAMES = {
  '/dominios': 'Domínios',
  '/novo-pentest': 'Novo Pentest',
  '/novo-pentest/web': 'Web / API',
  '/rede-interna': 'Rede Interna',
  '/engagement': 'Pentests',
  '/admin': 'Admin',
  '/admin/users': 'Usuários',
}

// ── item ativo ───────────────────────────────────────────────────────────────

test('em /admin/users só "Usuários" acende — não também "Admin"', () => {
  assert.equal(isActive('/admin/users', '/admin/users', MENU), true)
  assert.equal(isActive('/admin/users', '/admin', MENU), false)
})

test('em /admin só "Admin" acende', () => {
  assert.equal(isActive('/admin', '/admin', MENU), true)
  assert.equal(isActive('/admin', '/admin/users', MENU), false)
})

test('rota de detalhe acende o item pai (/dominios/abc → Domínios)', () => {
  assert.equal(isActive('/dominios/abc123', '/dominios', MENU), true)
})

test('prefixo de STRING não é prefixo de ROTA (/mapa não acende em /mapamento)', () => {
  assert.equal(matchesRoute('/mapamento', '/mapa'), false)
  assert.equal(isActive('/mapamento', '/mapa', MENU), false)
})

test('rota fora do menu não acende nada', () => {
  for (const href of MENU) assert.equal(isActive('/novo-pentest', href, MENU), false)
})

// ── breadcrumb ───────────────────────────────────────────────────────────────

test('breadcrumb aparece em tela de detalhe (o bug: sumia)', () => {
  assert.deepEqual(crumbsFor('/dominios/abc123', NAMES), [{ href: '/dominios', label: 'Domínios' }])
  assert.deepEqual(crumbsFor('/engagement/xyz', NAMES), [{ href: '/engagement', label: 'Pentests' }])
})

test('breadcrumb aninhado devolve a trilha inteira, do mais raso ao mais fundo', () => {
  assert.deepEqual(crumbsFor('/novo-pentest/web', NAMES), [
    { href: '/novo-pentest', label: 'Novo Pentest' },
    { href: '/novo-pentest/web', label: 'Web / API' },
  ])
})

test('segmento dinâmico não vira crumb (o H1 da tela já nomeia o recurso)', () => {
  const crumbs = crumbsFor('/rede-interna/64f0a1', NAMES)
  assert.equal(crumbs.length, 1)
  assert.equal(crumbs[0].label, 'Rede Interna')
})

test('rota desconhecida devolve trilha vazia em vez de quebrar', () => {
  assert.deepEqual(crumbsFor('/rota-que-nao-existe', NAMES), [])
  assert.deepEqual(crumbsFor('/', NAMES), [])
})
