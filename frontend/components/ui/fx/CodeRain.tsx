'use client'
import { useEffect, useRef } from 'react'
import { usePrefersReducedMotion } from '@/lib/motion'

/**
 * "Chuva de dados" estilo matrix — fundo para o clima de "agente trabalhando".
 * Preenche o container pai (position:relative), pointer-events:none. Amarrar a
 * estado real (só quando o agente está rodando). Estático em reduced-motion.
 */
export function CodeRain({ opacity = 0.4 }: { opacity?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const g = cv.getContext('2d')
    if (!g) return
    const canvas = cv, ctx = g
    const DPR = Math.min(2, window.devicePixelRatio || 1)
    const step = 14
    const glyphs = 'アカサタ0123456789<>/{}$#'.split('')
    let W = 0, H = 0, cols: number[] = [], raf = 0

    function resize() {
      const r = canvas.getBoundingClientRect()
      W = Math.max(1, r.width); H = Math.max(1, r.height)
      canvas.width = W * DPR; canvas.height = H * DPR
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
      const n = Math.max(1, Math.floor(W / step))
      cols = Array.from({ length: n }, () => Math.random() * -20)
    }
    function frame() {
      ctx.fillStyle = 'rgba(7,7,13,0.10)'; ctx.fillRect(0, 0, W, H)
      ctx.font = '12px var(--mono, monospace)'
      for (let i = 0; i < cols.length; i++) {
        const x = i * step, y = cols[i] * step
        ctx.fillStyle = 'rgba(167,139,250,.9)'
        ctx.fillText(glyphs[(Math.abs(y | 0) + i) % glyphs.length], x, y)
        if (y > H && Math.random() > 0.975) cols[i] = Math.random() * -16
        else cols[i] += 0.5
      }
      raf = requestAnimationFrame(frame)
    }

    resize()
    if (!reduced) frame()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [reduced])

  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', opacity }}>
      <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  )
}
