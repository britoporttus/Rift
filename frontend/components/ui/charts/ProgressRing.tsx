'use client'
import { useDrawProgress } from '@/lib/motion'

/**
 * Anel de progresso animado (preenche na entrada). Usa a mesma curva de desenho
 * dos outros gráficos. `showNum` mostra o valor no centro (esconda em tamanhos
 * pequenos). Bom para score / progresso de fase.
 */
export function ProgressRing({
  value, max = 100, size = 104, stroke = 7, color = 'var(--purple-light)', showNum = true, animate = true,
}: {
  value: number; max?: number; size?: number; stroke?: number; color?: string; showNum?: boolean; animate?: boolean
}) {
  const p = useDrawProgress({ duration: 1200, enabled: animate })
  const r = (size - stroke) / 2
  const C = 2 * Math.PI * r
  const cx = size / 2
  const frac = Math.min(1, value / max) * p

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--border-mid)" strokeWidth={stroke} />
        <circle
          cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - frac)}
          style={{ filter: `drop-shadow(0 0 5px color-mix(in srgb, ${color} 55%, transparent))` }}
        />
      </svg>
      {showNum && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--mono)', fontWeight: 700, fontSize: size * 0.26, color: 'var(--text)',
        }}>
          {Math.round(frac * max)}
        </div>
      )}
    </div>
  )
}
