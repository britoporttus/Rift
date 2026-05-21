'use client'
import { useState, useEffect } from 'react'
import { api, Finding, Engagement } from '@/lib/api'
import { AlertTriangle, Filter } from 'lucide-react'

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--critical)',
  high: 'var(--high)',
  medium: 'var(--medium)',
  low: 'var(--low)',
  info: 'var(--info)',
}
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info']

export default function FindingsPage() {
  const [findings, setFindings] = useState<Finding[]>([])
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [loading, setLoading] = useState(true)
  const [sevFilter, setSevFilter] = useState('')
  const [engFilter, setEngFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.findings.list(), api.engagements.list()])
      .then(([f, e]) => { setFindings(f); setEngagements(e) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = findings.filter((f) => {
    if (sevFilter && f.severity !== sevFilter) return false
    if (engFilter && f.engagement_id !== engFilter) return false
    return true
  })

  const selectStyle: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
    color: 'var(--text)', fontSize: 13, padding: '0.4rem 0.7rem',
    outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>Findings</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Filter size={13} color="var(--muted)" />
          <select value={sevFilter} onChange={(e) => setSevFilter(e.target.value)} style={selectStyle}>
            <option value="">Todas severidades</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={engFilter} onChange={(e) => setEngFilter(e.target.value)} style={selectStyle}>
            <option value="">Todos engagements</option>
            {engagements.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      </div>

      {/* Summary chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {SEVERITIES.map((sev) => {
          const count = findings.filter((f) => f.severity === sev).length
          if (!count) return null
          return (
            <button key={sev} onClick={() => setSevFilter(sevFilter === sev ? '' : sev)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: sevFilter === sev ? `${SEV_COLOR[sev]}22` : 'var(--surface)',
              border: `1px solid ${sevFilter === sev ? SEV_COLOR[sev] : 'var(--border)'}`,
              borderRadius: 20, padding: '0.25rem 0.7rem', cursor: 'pointer',
              color: SEV_COLOR[sev], fontSize: 12, fontFamily: 'inherit',
            }}>
              <AlertTriangle size={11} />
              {count} {sev}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '3rem', fontSize: 13 }}>Carregando...</div>
      ) : filtered.length === 0 ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontSize: 14,
        }}>
          Nenhum finding encontrado.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map((f) => (
            <div key={`${f.engagement_id}-${f.id}`}>
              <div
                onClick={() => setExpanded(expanded === f.id ? null : f.id)}
                style={{
                  background: 'var(--surface)', border: `1px solid var(--border)`,
                  borderLeft: `3px solid ${SEV_COLOR[f.severity] ?? 'var(--border)'}`,
                  borderRadius: 6, padding: '0.75rem 1rem',
                  display: 'flex', alignItems: 'center', gap: '1rem',
                  cursor: 'pointer', transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = SEV_COLOR[f.severity])}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <span style={{
                  color: SEV_COLOR[f.severity], fontWeight: 700, fontSize: 10,
                  textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 52, flexShrink: 0,
                }}>
                  {f.severity}
                </span>
                <span style={{ color: 'var(--text)', fontSize: 14, flex: 1 }}>{f.title}</span>
                {f.cvss && <span style={{ color: 'var(--muted)', fontSize: 12 }}>CVSS {f.cvss}</span>}
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>{f.engagement_name ?? ''}</span>
              </div>

              {expanded === f.id && f.description && (
                <div style={{
                  background: 'var(--bg)', border: '1px solid var(--border)', borderTop: 'none',
                  borderRadius: '0 0 6px 6px', padding: '0.75rem 1rem',
                  color: 'var(--muted)', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                }}>
                  {f.description}
                  {f.evidence && (
                    <pre style={{
                      marginTop: 8, background: 'var(--surface)', borderRadius: 4,
                      padding: '0.5rem', fontSize: 12, color: 'var(--text)', overflowX: 'auto',
                    }}>
                      {f.evidence}
                    </pre>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
