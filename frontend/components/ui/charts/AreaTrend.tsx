'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useDrawProgress } from '@/lib/motion'

export interface AreaPoint {
  label: string
  value: number
}

interface AreaTrendProps {
  data: AreaPoint[]
  /** cor da linha/gradiente (padrão: roxo claro do Rift) */
  color?: string
  /** altura em px (padrão 130) */
  height?: number
  /** sufixo mostrado no tooltip (ex.: ' findings') */
  valueSuffix?: string
  /** desenho de entrada esq→dir. Padrão: ligado. */
  animate?: boolean
}

/**
 * Área de tendência de série única — segue a receita do skill dataviz:
 * preenchimento com gradiente, grade recessiva, ponto final destacado e
 * tooltip com crosshair no hover. Sem legenda (série única; o título da seção
 * já a nomeia). Largura é medida do container para manter traço e ponto nítidos.
 */
export function AreaTrend({ data, color = 'var(--purple-light)', height = 130, valueSuffix = '', animate = true }: AreaTrendProps) {
  const uid = useId().replace(/[:]/g, '')
  const wrapRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(320)
  const [hover, setHover] = useState<number | null>(null)
  const p = useDrawProgress({ duration: 1100, enabled: animate })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width
      if (cw) setW(cw)
    })
    ro.observe(el)
    setW(el.clientWidth || 320)
    return () => ro.disconnect()
  }, [])

  const H = height
  const padT = 10, padB = 6
  const plotH = H - padT - padB
  const n = data.length
  const max = Math.max(...data.map((d) => d.value), 1)
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * w : w / 2)
  const y = (v: number) => padT + (1 - v / max) * plotH

  const linePts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ')
  const fillPath = `M0,${H} L${data.map((d, i) => `${x(i)},${y(d.value)}`).join(' L')} L${w},${H} Z`
  const clipW = w * p
  const lastIdx = n - 1
  // ponto final entra no fim do desenho
  const dotOpacity = Math.max(0, (p - 0.85) / 0.15)

  if (n < 2) {
    return <div ref={wrapRef} style={{ height: H }} />
  }

  const onMove = (e: React.PointerEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect()
    const rel = (e.clientX - rect.left) / rect.width
    setHover(Math.max(0, Math.min(lastIdx, Math.round(rel * lastIdx))))
  }

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', width: '100%', height: H, touchAction: 'none' }}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
      role="img"
      aria-label={`Tendência: ${data[0].label} a ${data[lastIdx].label}, de ${data[0].value} a ${data[lastIdx].value}${valueSuffix}`}
    >
      <svg width={w} height={H} style={{ display: 'block' }}>
        <defs>
          <linearGradient id={`ag-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={0.32} />
            <stop offset="1" stopColor={color} stopOpacity={0} />
          </linearGradient>
          <clipPath id={`clip-${uid}`}>
            <rect x="0" y="0" width={clipW} height={H} />
          </clipPath>
        </defs>
        {/* grade recessiva */}
        {[0, 1, 2, 3].map((g) => {
          const gy = padT + (g / 3) * plotH
          return <line key={g} x1={0} x2={w} y1={gy} y2={gy} stroke="var(--border)" strokeWidth={1} />
        })}
        <g clipPath={`url(#clip-${uid})`}>
          <path d={fillPath} fill={`url(#ag-${uid})`} />
          <polyline points={linePts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </g>
        {/* ponto final destacado */}
        <circle
          cx={x(lastIdx)} cy={y(data[lastIdx].value)} r={3.5} fill={color}
          opacity={dotOpacity}
          style={{ filter: `drop-shadow(0 0 5px color-mix(in srgb, ${color} 90%, transparent))` }}
        />
        {/* crosshair + marcador no hover */}
        {hover != null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--border-hi)" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(data[hover].value)} r={4} fill={color} stroke="var(--bg)" strokeWidth={2} />
          </>
        )}
      </svg>
      {hover != null && (
        <div
          style={{
            position: 'absolute', left: x(hover), top: y(data[hover].value) - 10,
            transform: 'translate(-50%,-100%)', pointerEvents: 'none', zIndex: 3,
            background: 'var(--raised)', border: '1px solid var(--border-mid)', borderRadius: 8,
            padding: '6px 10px', whiteSpace: 'nowrap', boxShadow: '0 8px 22px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ fontSize: 10, color: 'var(--text-mute)', marginBottom: 2 }}>{data[hover].label}</div>
          <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)', color }}>
            {data[hover].value}{valueSuffix}
          </div>
        </div>
      )}
    </div>
  )
}
