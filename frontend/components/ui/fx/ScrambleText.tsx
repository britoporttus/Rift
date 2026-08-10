'use client'
import { useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from '@/lib/motion'

const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&/0123456789'

/**
 * Texto "decrypt": embaralha os caracteres e resolve para o alvo, da esquerda
 * para a direita. Roda ao montar e (opcional) no hover. Em reduced-motion,
 * mostra o texto direto.
 */
export function ScrambleText({ text, style, replayOnHover = true, duration = 26, playOnVisible = false }: {
  text: string; style?: React.CSSProperties; replayOnHover?: boolean; duration?: number
  /** adia o decrypt até o texto entrar na viewport — sem isto, um título que
   *  está no meio da página resolve sozinho antes de alguém ver */
  playOnVisible?: boolean
}) {
  const reduced = usePrefersReducedMotion()
  const [out, setOut] = useState(text)
  const raf = useRef<number | undefined>(undefined)
  const host = useRef<HTMLSpanElement>(null)

  function play() {
    if (reduced) { setOut(text); return }
    if (raf.current) cancelAnimationFrame(raf.current)
    let frame = 0
    const step = () => {
      const settled = Math.floor((frame / duration) * text.length)
      let s = ''
      for (let i = 0; i < text.length; i++)
        s += (i < settled || text[i] === ' ') ? text[i] : CH[Math.floor(Math.random() * CH.length)]
      setOut(s); frame++
      if (frame <= duration) raf.current = requestAnimationFrame(step)
      else setOut(text)
    }
    step()
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!playOnVisible) {
      play()
    } else if (host.current) {
      const io = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return
        io.disconnect()
        play()
      }, { threshold: 0.4 })
      io.observe(host.current)
      return () => { io.disconnect(); if (raf.current) cancelAnimationFrame(raf.current) }
    }
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [])

  return <span ref={host} style={style} onPointerEnter={replayOnHover ? play : undefined}>{out}</span>
}
