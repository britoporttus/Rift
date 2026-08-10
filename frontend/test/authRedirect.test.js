// Regressão do LOOP DE LOGIN (ETAPA 1.1).
// Antes do fix, o handler de 401 em lib/api.ts redirecionava para /login em
// QUALQUER 401 — inclusive o probe me() da própria tela de login → loop de reload.
// shouldRedirectOn401 encapsula a decisão; este teste trava o contrato.
const { test } = require('node:test')
const assert = require('node:assert')
const { shouldRedirectOn401 } = require('../lib/authRedirect')

test('401 na tela de login NÃO redireciona (senão vira loop de reload)', () => {
  assert.equal(shouldRedirectOn401('/login'), false)
})

test('401 no site público NÃO redireciona (essas páginas são para deslogado)', () => {
  // O site vive dentro do AuthProvider, que faz me() no mount. Sem esta exceção
  // o visitante era chutado para /login antes de ler a apresentação do produto.
  assert.equal(shouldRedirectOn401('/'), false)
  assert.equal(shouldRedirectOn401('/metodo'), false)
  assert.equal(shouldRedirectOn401('/entrega'), false)
  assert.equal(shouldRedirectOn401('/seguranca'), false)
  assert.equal(shouldRedirectOn401('/modulos'), false)
  assert.equal(shouldRedirectOn401('/modulos/web'), false)
})

test('prefixo público não vaza para rota parecida mas protegida', () => {
  // `/modulos` é público; `/modulosecreto` não deve herdar isso.
  assert.equal(shouldRedirectOn401('/modulosecreto'), true)
  assert.equal(shouldRedirectOn401('/loginfalso'), true)
})

test('401 em rota protegida redireciona para /login (sessão expirada)', () => {
  assert.equal(shouldRedirectOn401('/dashboard'), true)
  assert.equal(shouldRedirectOn401('/findings'), true)
  assert.equal(shouldRedirectOn401('/engagement/abc-123'), true)
})

test('pathname ausente/inesperado: fallback seguro redireciona', () => {
  assert.equal(shouldRedirectOn401(''), true)
  assert.equal(shouldRedirectOn401(undefined), true)
  assert.equal(shouldRedirectOn401(null), true)
})
