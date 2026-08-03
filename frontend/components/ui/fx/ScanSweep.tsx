'use client'
import { useEffect, useRef } from 'react'
import { usePrefersReducedMotion } from '@/lib/motion'

/**
 * Radar girando — indicador de "scan rodando". Canvas puro, sem lib. Amarrar ao
 * estado real (só renderizar quando scanState === 'scanning'). Degrada para
 * anéis estáticos em prefers-reduced-motion ou navegador sem conic-gradient.
 */
export function ScanSweep({ size = 64 }: { size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const g = cv.getContext('2d')
    if (!g) return
    const DPR = Math.min(2, window.devicePixelRatio || 1)
    cv.width = size * DPR; cv.height = size * DPR
    g.setTransform(DPR, 0, 0, DPR, 0, 0)
    const cx = size / 2, cy = size / 2, R = size / 2 - 3
    const hasConic = typeof (g as CanvasRenderingContext2D & { createConicGradient?: unknown }).createConicGradient === 'function'
    let ang = 0, raf = 0

    function rings() {
      g!.strokeStyle = 'rgba(140,120,225,.25)'; g!.lineWidth = 1
      for (let k = 1; k <= 2; k++) { g!.beginPath(); g!.arc(cx, cy, (R * k) / 2, 0, 7); g!.stroke() }
    }
    function draw() {
      g!.clearRect(0, 0, size, size)
      rings()
      if (hasConic) {
        const grad = g!.createConicGradient(ang, cx, cy)
        grad.addColorStop(0, 'rgba(124,58,237,.5)')
        grad.addColorStop(0.14, 'rgba(124,58,237,0)')
        grad.addColorStop(1, 'rgba(124,58,237,0)')
        g!.fillStyle = grad
        g!.beginPath(); g!.moveTo(cx, cy); g!.arc(cx, cy, R, 0, 7); g!.closePath(); g!.fill()
      }
      g!.strokeStyle = 'rgba(167,139,250,.9)'; g!.lineWidth = 1.4
      g!.beginPath(); g!.moveTo(cx, cy); g!.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R); g!.stroke()
      ang += 0.045
      raf = requestAnimationFrame(draw)
    }

    if (reduced) rings()
    else draw()
    return () => cancelAnimationFrame(raf)
  }, [size, reduced])

  return <canvas ref={ref} style={{ width: size, height: size, display: 'block' }} aria-hidden="true" />
}
