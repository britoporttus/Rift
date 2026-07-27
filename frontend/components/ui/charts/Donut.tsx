'use client'

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
}

export function Donut({ data, size = 176, thickness = 20, total, caption, activeKey, onHover }: DonutProps) {
  const sum = data.reduce((a, d) => a + d.value, 0) || 1
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const cx = size / 2
  let acc = 0

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--border)" strokeWidth={thickness} />
        {data.map((d) => {
          const frac = d.value / sum
          const len = frac * c
          const dim = activeKey != null && activeKey !== d.key
          const seg = (
            <circle
              key={d.key}
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={activeKey === d.key ? thickness + 3 : thickness}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-acc}
              strokeLinecap="butt"
              onMouseEnter={() => onHover?.(d.key)}
              onMouseLeave={() => onHover?.(null)}
              style={{ opacity: dim ? 0.28 : 1, transition: 'opacity .18s, stroke-width .18s', cursor: onHover ? 'pointer' : 'default' }}
            />
          )
          acc += len
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
