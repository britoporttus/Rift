'use strict'
// Decide se uma resposta 401 deve provocar um hard-redirect para /login.
//
// BUG (loop de login): o handler global de 401 em lib/api.ts fazia
// `window.location.href = '/login'` em QUALQUER 401. Como useAuth dispara
// `api.auth.me()` no mount — inclusive na PRÓPRIA tela de login —, um usuário sem
// sessão recebia 401 do me(), era redirecionado para /login, a página remontava,
// o me() respondia 401 de novo… loop de reload (às vezes só quebrado voltando a
// página anterior). Estar deslogado na tela de login é o estado NORMAL, não um
// erro que justifique redirecionar.
//
// Regra: redireciona em qualquer rota protegida; NUNCA quando já se está na área
// de login. A navegação para /login em rota protegida é feita pelos guards de
// rota (router.replace no layout) + este redirect para expiração de sessão.
//
// Plain JS (CommonJS) de propósito: o app TS importa via allowJs e o runner
// nativo `node --test` consegue exercer a lógica pura sem toolchain extra.
function shouldRedirectOn401(pathname) {
  if (typeof pathname !== 'string' || !pathname) return true
  return !pathname.startsWith('/login')
}

module.exports = { shouldRedirectOn401 }
