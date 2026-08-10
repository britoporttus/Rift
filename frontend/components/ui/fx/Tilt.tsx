'use client'
import { useRef } from 'react'
import { usePrefersReducedMotion } from '@/lib/motion'

/**
 * Inclina o filho em 3D na direção do cursor (efeito "tilt"). Sutil por padrão
 * (max ~9°). Respeita prefers-reduced-motion (não inclina) e preserva a altura
 * do filho (`height:100%`) para não quebrar grids de cards.
 */
export function Tilt({ children, max = 9, style }: {
  children: React.ReactNode; max?: number; style?: React.CSSProperties
}) {
  const inner = useRef<HTMLDivElement>(null)
  const reduced = usePrefersReducedMotion()

  function move(e: React.PointerEvent) {
    const el = inner.current
    if (reduced || !el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    el.style.transform = `rotateY(${px * max}deg) rotateX(${-py * max}deg)`
  }
  function leave() {
    if (inner.current) inner.current.style.transform = 'rotateY(0deg) rotateX(0deg)'
  }

  return (
    <div onPointerMove={move} onPointerLeave={leave} style={{ perspective: 800, height: '100%', ...style }}>
      <div ref={inner} style={{ height: '100%', transition: 'transform .14s ease', transformStyle: 'preserve-3d' }}>
        {children}
      </div>
    </div>
  )
}
