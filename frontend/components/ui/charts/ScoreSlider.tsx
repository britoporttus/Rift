'use client'

interface ScoreSliderProps {
  value: number
  max?: number
  label?: string
  color: string
}

export function ScoreSlider({ value, max = 100, label, color }: ScoreSliderProps) {
  const frac = Math.min(1, value / max)
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{ fontSize: 40, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)', lineHeight: 1 }}>
          {value}
        </span>
        {label && (
          <span
            style={{
              fontSize: 11.5, fontWeight: 700, color, padding: '4px 10px', borderRadius: 99,
              background: `color-mix(in srgb, ${color} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
            }}
          >
            {label}
          </span>
        )}
      </div>
      <div
        style={{
          position: 'relative', height: 8, borderRadius: 99,
          background: 'linear-gradient(90deg,#F04452 0%,#F5892E 30%,#EAB308 55%,#22C55E 100%)',
        }}
      >
        <div
          style={{
            position: 'absolute', top: '50%', left: `${frac * 100}%`, transform: 'translate(-50%,-50%)',
            width: 16, height: 16, borderRadius: '50%', background: '#fff', border: `3px solid ${color}`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        />
      </div>
    </div>
  )
}
