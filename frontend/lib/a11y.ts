import type { KeyboardEvent } from 'react'

// P2-38 (auditoria 2026-07-20): `<div onClick>` sem role/tabIndex/teclado era
// o padrão dominante nos cards clicáveis (dashboard, domínios, vazamentos,
// findings) — inoperável via teclado (Tab não alcança, Enter/Space não
// ativam) e sem semântica pra leitor de tela. Spread isto no mesmo <div> que
// já tem onClick, sem precisar reestruturar o JSX.
export function clickableDivProps(onClick: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onClick()
      }
    },
  }
}
