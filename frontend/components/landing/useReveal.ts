'use client'
import { useEffect } from 'react'

/**
 * Revelação dos blocos ao entrar na viewport.
 *
 * A direção vem do atributo `data-rv` no próprio elemento — `up`, `down`,
 * `left`, `right` ou `scale`. Variar a direção é o que impede a página de
 * parecer uma única esteira subindo: o que é sequência sobe, o que são dois
 * lados de um argumento entra de fora para dentro, o que é destaque cresce.
 *
 * Elementos sem `data-rv` caem no padrão do grupo abaixo, para as páginas
 * internas não precisarem anotar cada bloco.
 */

/** [seletor, direção padrão, escalonamento em ms] */
const GROUPS: Array<[string, string, number]> = [
  ['.blk-head', 'up', 0],
  ['.cx.bad', 'left', 0],
  ['.cx.good', 'right', 120],
  ['.step', 'up', 70],
  ['.dl', 'down', 90],
  ['.rule', 'left', 55],
  ['.navcard', 'up', 90],
  ['.modcard', 'scale', 70],
  ['.howrow', 'left', 45],
  ['.col', 'up', 110],
  ['.cta .wrap', 'scale', 0],
]

export function useReveal(root: React.RefObject<HTMLElement>, key?: string) {
  useEffect(() => {
    const el = root.current
    if (!el) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

    for (const [sel, dir, stagger] of GROUPS) {
      el.querySelectorAll<HTMLElement>(sel).forEach((node, i) => {
        if (node.classList.contains('rv')) return          // já anotado à mão
        node.classList.add('rv')
        if (!node.dataset.rv) node.dataset.rv = dir
        if (stagger) node.style.transitionDelay = `${i * stagger}ms`
      })
    }
    // blocos que declararam a própria direção no JSX
    el.querySelectorAll<HTMLElement>('[data-rv]').forEach((n) => n.classList.add('rv'))

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        const target = e.target as HTMLElement
        target.dataset.in = '1'
        target.querySelectorAll<HTMLElement>('[data-w]').forEach((bar, i) => {
          setTimeout(() => { bar.style.width = bar.dataset.w || '0' }, 180 + i * 110)
        })
        io.unobserve(target)
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 })

    el.querySelectorAll('.rv').forEach((n) => io.observe(n))
    return () => io.disconnect()
    // `key` (a rota) reexecuta o efeito ao navegar: o layout NÃO remonta entre
    // páginas do grupo, então sem isto o conteúdo novo nunca seria observado —
    // ficaria marcado com .rv e invisível para sempre.
  }, [root, key])
}
