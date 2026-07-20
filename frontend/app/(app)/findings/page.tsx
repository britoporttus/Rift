'use client'
import { useState, useEffect } from 'react'
import { api, Finding, Engagement } from '@/lib/api'
import { SI } from '@/components/ui/SI'
// P1-27 (auditoria 2026-07-20): cor local divergia da fonte única (high
// #F59E0B aqui vs #F97316 em lib/severity.ts) — um finding "high" aparecia com
// cor diferente aqui do que em Dashboard/Domínios/Vazamentos/Mapa/FindingsReport.
import { SEV_COLOR, SEV_ORDER as SEVERITIES } from '@/lib/severity'
import { clickableDivProps } from '@/lib/a11y'

const ChevDown  = (s?: number, c?: string) => <SI s={s || 12} c={c || '#3A3A58'} sw={2}><polyline points="6 9 12 15 18 9" /></SI>
const ChevRight = (s?: number, c?: string) => <SI s={s || 12} c={c || '#3A3A58'} sw={2}><polyline points="9 18 15 12 9 6" /></SI>
const DownloadIco = (s?: number, c?: string) => <SI s={s || 12} c={c || 'white'} sw={2.5}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></SI>

const selectStyle: React.CSSProperties = {
  background: 'rgba(4,4,12,0.97)', border: '1px solid rgba(124,58,237,0.13)', borderRadius: 99,
  color: '#94A3B8', fontSize: 11, padding: '0.3rem 0.8rem',
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

  const engCount = new Set(findings.map((f) => f.engagement_id)).size
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length]))

  return (
    <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeIn 0.2s ease' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#E2E8F0', letterSpacing: '-0.01em' }}>Findings</div>
          <div style={{ fontSize: 11.5, color: '#3A3A58', marginTop: 2 }}>
            {findings.length} findings detectados · {engCount} {engCount === 1 ? 'engagement' : 'engagements'}
          </div>
        </div>
        <button
          onClick={() => exportCSV(filtered)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '0.42rem 0.9rem',
            background: '#7C3AED', border: 'none', borderRadius: 5,
            color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit', boxShadow: '0 0 16px rgba(124,58,237,0.28)',
          }}
        >
          {DownloadIco()} Exportar CSV
        </button>
      </div>

      {/* Filters row: severity chips + engagement select */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        {/* Todos */}
        <button onClick={() => setSevFilter('')} style={{
          padding: '0.3rem 0.8rem', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
          fontWeight: sevFilter === '' ? 700 : 400,
          background: sevFilter === '' ? 'rgba(124,58,237,0.12)' : 'rgba(4,4,12,0.97)',
          border: `1px solid ${sevFilter === '' ? 'rgba(124,58,237,0.28)' : 'rgba(124,58,237,0.13)'}`,
          color: sevFilter === '' ? '#A78BFA' : '#94A3B8',
        }}>
          Todos · {findings.length}
        </button>

        {SEVERITIES.map((sev) => {
          const active = sevFilter === sev
          const c = SEV_COLOR[sev]
          return (
            <button key={sev} onClick={() => setSevFilter(active ? '' : sev)} style={{
              padding: '0.3rem 0.8rem', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
              display: 'flex', alignItems: 'center', gap: 5, fontWeight: active ? 700 : 400,
              background: active ? `${c}14` : 'rgba(4,4,12,0.97)',
              border: `1px solid ${active ? c : 'rgba(124,58,237,0.13)'}`,
              color: active ? c : '#94A3B8', transition: 'all 0.12s',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: 2, background: active ? c : '#3A3A58' }} />
              <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{counts[sev]}</span>
              <span style={{ opacity: 0.75 }}>{sev}</span>
            </button>
          )
        })}

        {/* Engagement filter (mantido do app real; estilizado como chip) */}
        <select value={engFilter} onChange={(e) => setEngFilter(e.target.value)} style={{ ...selectStyle, marginLeft: 'auto' }}>
          <option value="">Todos engagements</option>
          {engagements.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {/* Findings list */}
      {loading ? (
        <div style={{ color: '#3A3A58', textAlign: 'center', padding: '3rem', fontSize: 12, letterSpacing: '0.1em' }}>CARREGANDO...</div>
      ) : filtered.length === 0 ? (
        <div style={{
          background: 'rgba(4,4,12,0.97)', border: '1px solid rgba(124,58,237,0.13)', borderRadius: 8,
          padding: '3rem', textAlign: 'center', color: '#3A3A58', fontSize: 13,
        }}>
          Nenhum finding encontrado.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {filtered.map((f, i) => {
            const color = SEV_COLOR[f.severity] ?? '#94A3B8'
            const isExpanded = expanded === f.id
            return (
              <div key={`${f.engagement_id}-${f.id}`}
                {...clickableDivProps(() => setExpanded(isExpanded ? null : f.id))}
                style={{
                  background: 'rgba(4,4,12,0.97)',
                  border: `1px solid ${isExpanded ? 'rgba(124,58,237,0.28)' : 'rgba(124,58,237,0.13)'}`,
                  borderLeft: `3px solid ${color}`,
                  borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                  transition: 'border-color 0.12s', animation: `fadeIn 0.18s ease ${i * 0.03}s both`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', padding: '0.8rem 1rem', gap: 10 }}>
                  {/* Severity badge */}
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', padding: '2px 7px', borderRadius: 3, flexShrink: 0,
                    textTransform: 'uppercase',
                    background: `${color}14`, border: `1px solid ${color}44`, color,
                  }}>
                    {f.severity}
                  </span>

                  {/* Title */}
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.title}
                  </span>

                  {f.cvss && (
                    <span style={{ fontSize: 10, color: '#3A3A58', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace" }}>CVSS {f.cvss}</span>
                  )}
                  {f.engagement_name && (
                    <span style={{ fontSize: 10.5, color: '#3A3A58', whiteSpace: 'nowrap', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {f.engagement_name}
                    </span>
                  )}
                  {f.description ? (isExpanded ? ChevDown() : ChevRight()) : null}
                </div>

                {isExpanded && f.description && (
                  <div style={{ padding: '0 1rem 0.9rem', borderTop: '1px solid rgba(14,14,28,0.9)' }}>
                    <p style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.8, paddingTop: '0.6rem', whiteSpace: 'pre-wrap' }}>
                      {f.description}
                    </p>
                    {f.evidence && (
                      <pre style={{
                        marginTop: 8, background: '#0C0C1A', borderRadius: 5,
                        padding: '0.5rem 0.75rem', fontSize: 11, color: '#94A3B8', overflowX: 'auto',
                        border: '1px solid rgba(124,58,237,0.1)', fontFamily: "'JetBrains Mono', monospace",
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
