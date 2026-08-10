'use strict'
// Lógica pura de navegação: qual item do menu está ativo e qual é a trilha de
// breadcrumb. Os dois eram inline nos componentes e os dois tinham bug:
//
//  1. ITEM ATIVO — a checagem era `path === href || path.startsWith(href)`. Em
//     `/admin/users` isso acendia DOIS itens ao mesmo tempo, porque
//     "/admin/users".startsWith("/admin") é verdadeiro. Também acendia
//     "/mapa" para uma rota hipotética "/mapamento". Agora só casa por
//     segmento de path e vence a rota mais específica.
//
//  2. BREADCRUMB — era `PAGE_NAMES[path]` com match EXATO, então toda rota de
//     detalhe (`/dominios/abc`, `/engagement/xyz`) caía no fallback vazio e o
//     breadcrumb sumia justamente nas telas mais profundas, que são as que
//     mais precisam de um caminho de volta.
//
// Plain JS (CommonJS) de propósito: o app TS importa via allowJs e o runner
// nativo `node --test` exerce a lógica pura sem toolchain extra.

/**
 * Um href casa a rota atual se for igual a ela ou for um prefixo de SEGMENTO
 * (`/dominios` casa `/dominios/abc`, mas `/mapa` não casa `/mapamento`).
 */
function matchesRoute(path, href) {
  if (typeof path !== 'string' || typeof href !== 'string' || !href) return false
  return path === href || path.startsWith(href + '/')
}

/**
 * `href` está ativo se casa a rota E é o candidato MAIS ESPECÍFICO entre todos
 * os hrefs do menu — assim `/admin/users` não acende também `/admin`.
 */
function isActive(path, href, allHrefs) {
  if (!matchesRoute(path, href)) return false
  const candidates = (allHrefs || []).filter((h) => matchesRoute(path, h))
  if (candidates.length === 0) return true
  let best = candidates[0]
  for (const c of candidates) if (c.length > best.length) best = c
  return best === href
}

/**
 * Trilha de breadcrumb: acumula os prefixos da rota e devolve os que têm
 * rótulo conhecido. Segmentos dinâmicos (ids) são ignorados de propósito — o
 * H1 da própria tela já mostra o nome do recurso.
 */
function crumbsFor(path, pageNames) {
  if (typeof path !== 'string') return []
  const names = pageNames || {}
  const segs = path.split('/').filter(Boolean)
  const out = []
  let acc = ''
  for (const seg of segs) {
    acc += '/' + seg
    if (names[acc]) out.push({ href: acc, label: names[acc] })
  }
  return out
}

module.exports = { matchesRoute, isActive, crumbsFor }
