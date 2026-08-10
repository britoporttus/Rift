'use client'
import { usePrefersReducedMotion } from '@/lib/motion'

/**
 * Fundo "aurora": blobs coloridos borrados que flutuam devagar. Preenche o
 * container pai (position:relative). pointer-events:none. Respeita
 * prefers-reduced-motion (fica estático).
 */
export function Aurora({ opacity = 0.5 }: { opacity?: number }) {
  const reduced = usePrefersReducedMotion()
  const blob = (bg: string, pos: React.CSSProperties, anim: string, dur: string): React.CSSProperties => ({
    position: 'absolute', width: 220, height: 220, borderRadius: '50%', filter: 'blur(48px)', background: bg,
    animation: reduced ? undefined : `${anim} ${dur} ease-in-out infinite`, ...pos,
  })
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', opacity }}>
      <span style={blob('var(--purple)', { left: -40, top: -50 }, 'auroraA', '9s')} />
      <span style={blob('var(--info)', { right: -40, top: 20 }, 'auroraB', '11s')} />
      <span style={blob('var(--purple-light)', { left: '40%', bottom: -60 }, 'auroraC', '10s')} />
    </div>
  )
}
