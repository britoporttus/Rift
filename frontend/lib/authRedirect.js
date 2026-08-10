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
// Regra: redireciona em qualquer rota protegida; NUNCA quando já se está numa
// rota PÚBLICA. A navegação para /login em rota protegida é feita pelos guards
// de rota (router.replace no layout) + este redirect para expiração de sessão.
//
// O site público (home + páginas de apresentação, grupo de rota `app/(site)`)
// também é montado dentro do AuthProvider, que dispara `api.auth.me()` no
// mount. Sem esta lista, todo visitante deslogado era chutado para /login e a
// página de vendas nunca era vista por quem ela existe para convencer.
//
// AO CRIAR UMA PÁGINA NOVA EM `app/(site)`, acrescente a rota aqui — senão ela
// nasce invisível para quem não tem sessão, que é justamente o público dela.
const PUBLIC_PREFIXES = ['/login', '/metodo', '/entrega', '/seguranca', '/modulos']
//
// Plain JS (CommonJS) de propósito: o app TS importa via allowJs e o runner
// nativo `node --test` consegue exercer a lógica pura sem toolchain extra.
function shouldRedirectOn401(pathname) {
  if (typeof pathname !== 'string' || !pathname) return true
  if (pathname === '/') return false
  return !PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

module.exports = { shouldRedirectOn401 }
