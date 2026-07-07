'use client'
import { useState, useEffect } from 'react'
import { api, Finding, Engagement } from '@/lib/api'

const SEV_COLOR: Record<string, string> = {
  critical: '#EF4444',
  high:     '#F59E0B',
  medium:   '#EAB308',
  low:      '#22C55E',
  info:     '#3B82F6',
}
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info']

function SI({ s = 15, c = 'currentColor', sw = 1.75, children }: { s?: number; c?: string; sw?: number; children: React.ReactNode }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'block' }}>
      {children}
    </svg>
  )
}

const AlertIco  = (s?: number, c?: string) => <SI s={s || 11} c={c}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></SI>
const ChevDown  = (s?: number, c?: string) => <SI s={s || 12} c={c || '#94A3B8'} sw={2}><polyline points="6 9 12 15 18 9" /></SI>
const ChevRight = (s?: number, c?: string) => <SI s={s || 12} c={c || '#94A3B8'} sw={2}><polyline points="9 18 15 12 9 6" /></SI>
const DownloadIco = (s?: number, c?: string) => <SI s={s || 12} c={c || 'white'}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></SI>

const selectStyle: React.CSSProperties = {
  background: 'rgba(4,4,12,0.97)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 5,
  color: '#E2E8F0', fontSize: 11, padding: '0.35rem 0.6rem',
  outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
}

function exportCSV(findings: Finding[]) {
  const header = ['id', 'title', 'severity', 'cvss', 'engagement', 'description']
  const rows = findings.map((f) => [
    f.id, f.title, f.severity, f.cvss ?? '', f.engagement_name ?? '', (f.description ?? '').replace(/\n/g, ' '),
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
  const csv = [header.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'findings.csv'; a.click()
  URL.revokeObjectURL(url)
}

export default function FindingsPage() {
  const [findings, setFindings]       = useState<Finding[]>([])
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [loading, setLoading]         = useState(true)
  const [sevFilter, setSevFilter]     = useState('')
  const [engFilter, setEngFilter]     = useState('')
  const [expanded, setExpanded]       = useState<string | null>(null)

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

  return (
    <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeIn 0.2s ease' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select value={engFilter} onChange={(e) => setEngFilter(e.target.value)} style={selectStyle}>
            <option value="">Todos engagements</option>
            {engagements.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <button
          onClick={() => exportCSV(filtered)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0.42rem 0.9rem',
            background: '#7C3AED', border: 'none', borderRadius: 5,
            color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {DownloadIco()} Exportar CSV
        </button>
      </div>

      {/* Severity filter pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {SEVERITIES.map((sev) => {
          const count = findings.filter((f) => f.severity === sev).length
          if (!count) return null
          const color = SEV_COLOR[sev]
          const active = sevFilter === sev
          return (
            <button key={sev} onClick={() => setSevFilter(active ? '' : sev)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: active ? `${color}18` : 'rgba(4,4,12,0.97)',
              border: `1px solid ${active ? color + '44' : 'rgba(124,58,237,0.13)'}`,
              borderRadius: 99, padding: '0.25rem 0.75rem', cursor: 'pointer',
              color: active ? color : '#94A3B8', fontSize: 11, fontFamily: 'inherit',
              transition: 'all 0.12s',
            }}>
              {AlertIco(11, active ? color : '#94A3B8')}
              {count} {sev}
            </button>
          )
        })}
      </div>

      {/* Findings list */}
      {loading ? (
        <div style={{ color: '#3A3A58', textAlign: 'center', padding: '3rem', fontSize: 12, letterSpacing: '0.1em' }}>CARREGANDO...</div>
      ) : filtered.length === 0 ? (
        <div style={{
          background: '#0C0C1A', border: '1px solid rgba(124,58,237,0.13)', borderRadius: 8,
          padding: '3rem', textAlign: 'center', color: '#3A3A58', fontSize: 13,
        }}>
          Nenhum finding encontrado.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.map((f, i) => {
            const color = SEV_COLOR[f.severity] ?? '#94A3B8'
            const isExpanded = expanded === f.id
            return (
              <div key={`${f.engagement_id}-${f.id}`} style={{ animation: `rowIn 0.22s ease both`, animationDelay: `${i * 30}ms` }}>
                <div
                  onClick={() => setExpanded(isExpanded ? null : f.id)}
                  style={{
                    background: '#0C0C1A',
                    border: `1px solid rgba(124,58,237,0.13)`,
                    borderLeft: `3px solid ${color}`,
                    borderRadius: isExpanded ? '8px 8px 0 0' : 8,
                    padding: '0.7rem 1rem',
                    display: 'flex', alignItems: 'center', gap: '0.85rem',
                    cursor: 'pointer', transition: 'border-color 0.12s, background 0.12s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = color
                    e.currentTarget.style.background = 'rgba(12,12,26,0.97)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(124,58,237,0.13)'
                    e.currentTarget.style.background = '#0C0C1A'
                    e.currentTarget.style.borderLeftColor = color
                  }}
                >
                  {/* Severity badge */}
                  <span style={{
                    color, fontWeight: 700, fontSize: 9,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    minWidth: 56, flexShrink: 0,
                    background: `${color}14`,
                    border: `1px solid ${color}44`,
                    borderRadius: 4,
                    padding: '2px 6px',
                  }}>
                    {f.severity}
                  </span>

                  {/* Title */}
                  <span style={{ color: '#E2E8F0', fontSize: 13, flex: 1, lineHeight: 1.3 }}>{f.title}</span>

                  {/* CVSS */}
                  {f.cvss && (
                    <span style={{ color: '#94A3B8', fontSize: 11, flexShrink: 0 }}>CVSS {f.cvss}</span>
                  )}

                  {/* Engagement name */}
                  {f.engagement_name && (
                    <span style={{ color: '#3A3A58', fontSize: 11, flexShrink: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.engagement_name}
                    </span>
                  )}

                  {/* Expand chevron */}
                  <span style={{ flexShrink: 0 }}>
                    {f.description ? (isExpanded ? ChevDown() : ChevRight()) : null}
                  </span>
                </div>

                {/* Expanded content */}
                {isExpanded && f.description && (
                  <div style={{
                    background: 'rgba(2,2,8,0.97)', border: '1px solid rgba(124,58,237,0.13)', borderTop: 'none',
                    borderLeft: `3px solid ${color}`, borderRadius: '0 0 8px 8px',
                    padding: '0.85rem 1rem',
                    color: '#94A3B8', fontSize: 12, lineHeight: 1.8, whiteSpace: 'pre-wrap',
                  }}>
                    {f.description}
                    {f.evidence && (
                      <pre style={{
                        marginTop: 8, background: '#0C0C1A', borderRadius: 5,
                        padding: '0.5rem 0.75rem', fontSize: 11, color: '#94A3B8', overflowX: 'auto',
                        border: '1px solid rgba(124,58,237,0.1)',
                        fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        {f.evidence}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
