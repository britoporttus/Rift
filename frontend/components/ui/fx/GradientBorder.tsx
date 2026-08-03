'use client'
import { usePrefersReducedMotion } from '@/lib/motion'

/**
 * Borda com gradiente cônico girando — destaca um elemento "ativo/ao vivo".
 * Amarrar a estado real (ex.: scan rodando). Sem @property o gradiente fica
 * estático (fallback ok); reduced-motion também para a rotação.
 */
export function GradientBorder({ children, radius = 10, style }: {
  children: React.ReactNode; radius?: number; style?: React.CSSProperties
}) {
  const reduced = usePrefersReducedMotion()
  return (
    <div style={{
      position: 'relative', borderRadius: radius + 1.5, padding: 1.5,
      background: 'conic-gradient(from var(--gb,0deg), var(--purple), var(--info), var(--purple-light), var(--purple))',
      animation: reduced ? undefined : 'gbRot 4s linear infinite', ...style,
    }}>
      <div style={{ borderRadius: radius, background: 'var(--surface)', height: '100%' }}>{children}</div>
    </div>
  )
}
