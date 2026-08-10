'use client'
import { LazyMotion, MotionConfig, domAnimation, m, AnimatePresence, type Variants } from 'motion/react'

/**
 * Camada de movimento do app, sobre Motion (prev Framer Motion).
 *
 * Por que uma lib entrou depois de o repo ter decidido o contrário: o CSS dá
 * conta da ENTRADA, mas não da SAÍDA — elemento removido do DOM some seco,
 * porque não existe nada para animar depois do unmount. `AnimatePresence`
 * resolve exatamente isso (filtro de lista, modal fechando, item removido).
 * Ver [[lib/motion]], que continua dono de `useCountUp`/`useDrawProgress`:
 * ali rAF já resolve e Motion não acrescentaria nada.
 *
 * Sempre importar `m` daqui, nunca `motion` de 'motion/react' — `strict` no
 * LazyMotion quebra em build se alguém importar o componente cheio, que traria
 * todas as features para o bundle em vez de carregá-las sob demanda.
 *
 * CUSTO MEDIDO: +43 kB no First Load de /findings (116 → 159 kB). Tentei
 * separar `domAnimation` num módulo com `import()` dinâmico e deu EXATAMENTE o
 * mesmo número — o peso é o core de 'motion/react', que já entra por
 * `m`/`AnimatePresence`/`MotionConfig`. Não vale reinventar esse split.
 */

export { AnimatePresence, m }
export type { Variants }

/** Mesma curva do EASE de `lib/motion` — desacelera no fim, sensação de assentar. */
export const CURVA = [0.2, 0.7, 0.2, 1] as const

/**
 * `reducedMotion="user"` faz TODA animação abaixo respeitar
 * `prefers-reduced-motion` sem cada componente ter que lembrar disso.
 * O caminho do PDF não passa por aqui: `backend/src/report-pdf.js` renderiza
 * um HTML standalone via `file://`, não as páginas do Next.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}

/**
 * Entrada/saída de item de lista. O índice escalona a entrada e é limitado a 12
 * para uma lista de 200 findings não levar 6 segundos para aparecer.
 */
export const itemLista: Variants = {
  oculto: { opacity: 0, y: 6 },
  visivel: (i: number = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: Math.min(i, 12) * 0.03, duration: 0.22, ease: CURVA },
  }),
  saindo: { opacity: 0, y: -6, transition: { duration: 0.14, ease: 'easeIn' } },
}
