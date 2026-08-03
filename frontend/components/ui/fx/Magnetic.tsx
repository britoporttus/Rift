'use client'
import { useRef } from 'react'
import { usePrefersReducedMotion } from '@/lib/motion'

/**
 * "Puxa" o filho na direção do cursor quando ele passa por perto (botão
 * magnético). Ideal para CTAs primários. Respeita prefers-reduced-motion.
 */
export function Magnetic({ children, strength = 0.3, style }: {
  children: React.ReactNode; strength?: number; style?: React.CSSProperties
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduced = usePrefersReducedMotion()

  function move(e: React.PointerEvent) {
    const el = ref.current
    if (reduced || !el) return
    const r = el.getBoundingClientRect()
    const x = e.clientX - r.left - r.width / 2
    const y = e.clientY - r.top - r.height / 2
    el.style.transform = `translate(${x * strength}px, ${y * strength}px)`
  }
  function leave() { if (ref.current) ref.current.style.transform = 'translate(0,0)' }

  return (
    <span ref={ref} onPointerMove={move} onPointerLeave={leave}
      style={{ display: 'inline-flex', transition: 'transform .18s cubic-bezier(.2,.7,.2,1)', ...style }}>
      {children}
    </span>
  )
}
