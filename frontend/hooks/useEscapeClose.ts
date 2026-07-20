import { useEffect, useRef } from 'react'

// P2-39 (auditoria 2026-07-20): os modais/dropdowns do app fechavam só por
// clique no overlay — sem Escape, sem role="dialog"/aria-modal, sem foco
// movido pra dentro ao abrir. Usuário de teclado ficava preso ou perdia o
// contexto. Hook leve: fecha em Escape + move o foco pro container do modal
// ao abrir (não é um focus-trap cíclico completo, mas cobre o caso mais
// importante — entrar no modal já anunciado por leitor de tela e sair com Esc).
export function useEscapeClose(active: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    containerRef.current?.focus()
    return () => document.removeEventListener('keydown', handler)
  }, [active, onClose])

  return containerRef
}
