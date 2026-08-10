'use client'
import { usePrefersReducedMotion } from '@/lib/motion'

/**
 * Ponto pulsante ("farol") — comunica estado AO VIVO (monitoramento contínuo,
 * scan ativo). Anel expande e some; respeita prefers-reduced-motion (fica só o
 * ponto sólido).
 */
export function Beacon({ color = 'var(--low)', size = 10 }: { color?: string; size?: number }) {
  const reduced = usePrefersReducedMotion()
  return (
    <span style={{ position: 'relative', width: size, height: size, display: 'inline-block', flexShrink: 0 }}>
      {!reduced && (
        <span style={{
          position: 'absolute', inset: 0, borderRadius: '50%', background: color,
          animation: 'beaconPing 1.7s cubic-bezier(0,0,.2,1) infinite',
        }} />
      )}
      <span style={{
        position: 'absolute', inset: 0, borderRadius: '50%', background: color,
        boxShadow: `0 0 8px ${color}`,
      }} />
    </span>
  )
}
