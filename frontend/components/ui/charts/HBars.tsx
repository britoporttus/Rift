'use client'

export interface HBarDatum {
  label: string
  value: number
  color?: string
}

interface HBarsProps {
  data: HBarDatum[]
  max?: number
  unit?: string
  showVal?: boolean
}

export function HBars({ data, max, unit = '', showVal = true }: HBarsProps) {
  const m = max || Math.max(...data.map((d) => d.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      {data.map((d, i) => {
        const color = d.color || 'var(--purple)'
        return (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{d.label}</span>
              {showVal && (
                <span style={{ fontSize: 12.5, fontWeight: 700, color, fontFamily: 'var(--mono)' }}>
                  {d.value}{unit}
                </span>
              )}
            </div>
            <div style={{ height: 7, borderRadius: 99, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.max(2, (d.value / m) * 100)}%`, height: '100%', background: color, borderRadius: 99,
                  boxShadow: `0 0 8px color-mix(in srgb, ${color} 50%, transparent)`,
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
