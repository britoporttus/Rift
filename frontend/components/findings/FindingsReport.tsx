'use client'
import { useState, useEffect } from 'react'
import { api, Finding } from '@/lib/api'

const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e', info: '#3b82f6',
}
const TYPE_LABEL: Record<string, string> = {
  vulnerability: 'Vulnerabilidade', weakness: 'Fraqueza', observation: 'Observação',
}
const TYPE_COLOR: Record<string, string> = {
  vulnerability: '#ef4444', weakness: '#f97316', observation: '#3b82f6',
}
const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info']

// ── SVG donut chart ──────────────────────────────────────────────
function Donut({ segments, total }: { segments: { value: number; color: string }[]; total: number }) {
  const r = 52, cx = 64, cy = 64, stroke = 16
  const circ = 2 * Math.PI * r
  let offset = 0
  return (
    <svg width={128} height={128} viewBox="0 0 128 128">
      <circle r={r} cx={cx} cy={cy} fill="none" stroke="#2D2D4E" strokeWidth={stroke} />
      {segments.filter(s => s.value > 0).map((s, i) => {
        const pct = s.value / (total || 1)
        const dash = pct * circ
        const el = (
          <circle key={i} r={r} cx={cx} cy={cy} fill="none"
            stroke={s.color} strokeWidth={stroke}
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={circ * 0.25 - offset}
            style={{ transition: 'stroke-dashoffset 0.4s' }}
          />
        )
        offset += dash
        return el
      })}
      <text x={cx} y={cy - 6} textAnchor="middle" fill="#E2E8F0" fontSize={22} fontWeight={700}>{total}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="#94A3B8" fontSize={9}>findings</text>
    </svg>
  )
}

// ── expandable finding card ──────────────────────────────────────
interface ExtFinding extends Finding {
  finding_type?: string
  cwe?: string
  owasp?: string
  solution?: string
  instances?: { method: string; uri: string; evidence?: string }[]
}

function FindingCard({ f }: { f: ExtFinding }) {
  const [open, setOpen] = useState(false)
  const sev = f.severity
  const type = f.finding_type || 'weakness'
  const instances = f.instances || []

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 10, overflow: 'hidden',
      border: '1px solid var(--border)', transition: 'border-color .15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#3e4166')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      {/* header */}
      <div onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', cursor: 'pointer',
      }}>
        {/* severity bar */}
        <div style={{ width: 4, height: 36, borderRadius: 2, background: SEV_COLOR[sev] ?? '#94A3B8', flexShrink: 0 }} />

        {/* title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5, color: '#E2E8F0', marginBottom: 2 }}>{f.title}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {f.cwe && (
              <span style={{ fontSize: 10, color: '#60a5fa' }}>{f.cwe}</span>
            )}
            {f.owasp && (
              <span style={{ fontSize: 10, color: '#f97316' }}>{f.owasp}</span>
            )}
          </div>
        </div>

        {/* meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* type badge */}
          <span style={{
            background: `${TYPE_COLOR[type]}22`, color: TYPE_COLOR[type],
            border: `1px solid ${TYPE_COLOR[type]}55`,
            borderRadius: 999, padding: '1px 8px', fontSize: 10, fontWeight: 700,
          }}>
            {TYPE_LABEL[type]}
          </span>
          {/* severity badge */}
          <span style={{
            background: `${SEV_COLOR[sev]}22`, color: SEV_COLOR[sev],
            border: `1px solid ${SEV_COLOR[sev]}55`,
            borderRadius: 999, padding: '1px 8px', fontSize: 10, fontWeight: 700,
            textTransform: 'uppercase',
          }}>
            {sev}
          </span>
          {/* instance count */}
          {instances.length > 0 && (
            <span style={{
              background: '#1a1d27', border: '1px solid var(--border)',
              borderRadius: 6, padding: '2px 8px', fontSize: 11, color: '#94A3B8',
            }}>
              {instances.length} {instances.length === 1 ? 'instância' : 'instâncias'}
            </span>
          )}
          {f.cvss && (
            <span style={{ fontSize: 11, color: '#94A3B8' }}>CVSS {f.cvss}</span>
          )}
          <span style={{ color: '#94A3B8', fontSize: 12, transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </div>
      </div>

      {/* body */}
      {open && (
        <div style={{ padding: '0 16px 16px 32px' }}>
          {f.description && (
            <p style={{ color: '#94A3B8', fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>{f.description}</p>
          )}

          {f.solution && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: '#7C3AED', margin: '10px 0 6px' }}>
                Solução recomendada
              </div>
              <div style={{
                background: '#1a1d27', borderRadius: 8, padding: '10px 12px',
                fontSize: 12, color: '#94A3B8', borderLeft: '3px solid #22c55e',
              }}>
                {f.solution}
              </div>
            </>
          )}

          {instances.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: '#7C3AED', margin: '12px 0 6px' }}>
                Instâncias afetadas
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Método', 'URL', 'Evidência'].map(h => (
                        <th key={h} style={{ textAlign: 'left', color: '#94A3B8', fontWeight: 600, padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {instances.map((inst, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(46,49,73,.5)' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <span style={{ background: 'rgba(124,58,237,.2)', color: '#A78BFA', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                            {inst.method}
                          </span>
                        </td>
                        <td style={{ padding: '6px 8px', wordBreak: 'break-all' }}>
                          <a href={inst.uri} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'none' }}>
                            {inst.uri}
                          </a>
                        </td>
                        <td style={{ padding: '6px 8px', color: '#94A3B8', wordBreak: 'break-all' }}>
                          {inst.evidence || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── main component ───────────────────────────────────────────────
type FilterType = 'all' | 'vulnerability' | 'weakness' | 'observation'

export function FindingsReport({ engagementId }: { engagementId: string }) {
  const [findings, setFindings] = useState<ExtFinding[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')

  useEffect(() => {
    api.findings.list({ engagementId })
      .then(data => setFindings(data as ExtFinding[]))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [engagementId])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#94A3B8', fontSize: 13 }}>
      Carregando findings...
    </div>
  )

  const sorted = [...findings].sort((a, b) => {
    const tOrder = { vulnerability: 0, weakness: 1, observation: 2 }
    const td = (tOrder[a.finding_type as keyof typeof tOrder] ?? 1) - (tOrder[b.finding_type as keyof typeof tOrder] ?? 1)
    if (td !== 0) return td
    return SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity)
  })

  const byType = (t: string) => sorted.filter(f => (f.finding_type || 'weakness') === t)
  const vulns = byType('vulnerability')
  const weaknesses = byType('weakness')
  const observations = byType('observation')

  const bySev = (s: string) => sorted.filter(f => f.severity === s)
  const displayed = filter === 'all' ? sorted : sorted.filter(f => (f.finding_type || 'weakness') === filter)

  const donutSegs = SEV_ORDER.map(s => ({ value: bySev(s).length, color: SEV_COLOR[s] }))
  const total = sorted.length

  if (total === 0) return (
    <div style={{ padding: '3rem', textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>
      Nenhum finding ainda neste engagement.
    </div>
  )

  const filterBtn = (t: FilterType, label: string, count: number) => (
    <button key={t} onClick={() => setFilter(t)} style={{
      padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
      border: '1px solid', transition: 'all .15s',
      borderColor: filter === t ? '#7C3AED' : 'var(--border)',
      background: filter === t ? 'rgba(124,58,237,.12)' : '#222535',
      color: filter === t ? '#E2E8F0' : '#94A3B8',
    }}>
      {label} ({count})
    </button>
  )

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>

      {/* ── top stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 20, marginBottom: 20 }}>
        {/* donut */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: '#94A3B8', marginBottom: 4 }}>Distribuição</div>
          <Donut segments={donutSegs} total={total} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {SEV_ORDER.filter(s => bySev(s).length > 0).map(s => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLOR[s], flexShrink: 0 }} />
                <span style={{ color: SEV_COLOR[s], textTransform: 'capitalize', minWidth: 55 }}>{s}</span>
                <span style={{ color: '#94A3B8' }}>{bySev(s).length}</span>
              </div>
            ))}
          </div>
        </div>

        {/* stat cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {SEV_ORDER.slice(0, 4).map(s => (
              <div key={s} style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
                padding: '16px 16px 12px', position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: SEV_COLOR[s] }} />
                <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.08em' }}>{s}</div>
                <div style={{ fontSize: 34, fontWeight: 700, color: SEV_COLOR[s], margin: '4px 0 2px' }}>{bySev(s).length}</div>
              </div>
            ))}
          </div>

          {/* type breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { type: 'vulnerability', items: vulns, color: '#ef4444', label: 'Vulnerabilidades confirmadas', sub: 'Exploração ativa verificada' },
              { type: 'weakness', items: weaknesses, color: '#f97316', label: 'Fraquezas de configuração', sub: 'Aumentam a superfície de ataque' },
              { type: 'observation', items: observations, color: '#3b82f6', label: 'Observações informacionais', sub: 'Sem impacto direto neste contexto' },
            ].map(({ type, items, color, label, sub }) => (
              <div key={type} style={{
                background: 'var(--surface)', border: `1px solid ${color}33`,
                borderLeft: `4px solid ${color}`, borderRadius: 12, padding: '14px 16px',
                display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
              }} onClick={() => setFilter(filter === type as FilterType ? 'all' : type as FilterType)}>
                <div style={{ fontSize: 32, fontWeight: 700, color, lineHeight: 1, flexShrink: 0 }}>{items.length}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12, color: '#E2E8F0', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── filter bar ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {filterBtn('all', 'Todos', total)}
        {filterBtn('vulnerability', '● Vulnerabilidade', vulns.length)}
        {filterBtn('weakness', '● Fraqueza', weaknesses.length)}
        {filterBtn('observation', '● Observação', observations.length)}
      </div>

      {/* ── finding list ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {displayed.map(f => <FindingCard key={f.id} f={f} />)}
      </div>
    </div>
  )
}
