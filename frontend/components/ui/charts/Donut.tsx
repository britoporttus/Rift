'use client'

import { useDrawProgress } from '@/lib/motion'

export interface DonutSlice {
  key: string
  label: string
  value: number
  color: string
}

interface DonutProps {
  data: DonutSlice[]
  size?: number
  thickness?: number
  total?: number
  caption?: string
  activeKey?: string | null
  onHover?: (key: string | null) => void
  /** Desenho de entrada (fatias crescem com stagger). Desligue em PDF/relatório
   *  para o Chromium capturar o gráfico já completo. Padrão: ligado. */
  animate?: boolean
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

export function Donut({
  data, size = 176, thickness = 20, total, caption, activeKey, onHover, animate = true,
}: DonutProps) {
  const p = useDrawProgress({ duration: 950, enabled: animate })
  const sum = data.reduce((a, d) => a + d.value, 0) || 1
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const cx = size / 2
  const n = data.length
  // Janela de stagger: cada fatia desenha no seu próprio trecho do tempo total.
  const span = n > 1 ? Math.min(1, 1.7 / n) : 1
  let acc = 0

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--border)" strokeWidth={thickness} />
        {data.map((d, i) => {
          const frac = d.value / sum
          const fullLen = frac * c
          // 2px de folga entre fatias (legibilidade da paleta de status)
          const drawn = Math.max(0, fullLen - 2)
          const startAt = n > 1 ? (i * (1 - span)) / (n - 1) : 0
          const localP = Math.max(0, Math.min(1, (p - startAt) / span))
          const len = drawn * easeOut(localP)
          const dim = activeKey != null && activeKey !== d.key
          const active = activeKey === d.key
          const seg = (
            <circle
              key={d.key}
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={active ? thickness + 3 : thickness}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-acc}
              strokeLinecap="butt"
              onMouseEnter={() => onHover?.(d.key)}
              onMouseLeave={() => onHover?.(null)}
              style={{
                opacity: dim ? 0.28 : 1,
                transition: 'opacity .18s, stroke-width .18s, filter .18s',
                filter: active ? `drop-shadow(0 0 6px color-mix(in srgb, ${d.color} 65%, transparent))` : 'none',
                cursor: onHover ? 'pointer' : 'default',
              }}
            />
          )
          acc += fullLen
          return seg
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ fontSize: size * 0.24, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)', lineHeight: 1 }}>
          {total != null ? total : sum}
        </div>
        {caption && (
          <div style={{ fontSize: 10.5, color: 'var(--text-mute)', marginTop: 5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {caption}
          </div>
        )}
      </div>
    </div>
  )
}
