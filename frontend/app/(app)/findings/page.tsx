'use client'
import { useState, useEffect } from 'react'
import { api, Finding, Engagement, RemediationStatus } from '@/lib/api'
import { SI } from '@/components/ui/SI'
// P1-27 (auditoria 2026-07-20): cor local divergia da fonte única (high
// #F59E0B aqui vs #F97316 em lib/severity.ts) — um finding "high" aparecia com
// cor diferente aqui do que em Dashboard/Domínios/Vazamentos/Mapa/FindingsReport.
import { SEV_COLOR, SEV_ORDER as SEVERITIES } from '@/lib/severity'
import { clickableDivProps } from '@/lib/a11y'
import { findingType } from '@/lib/findingClassify'
import { Donut } from '@/components/ui/charts/Donut'

const TYPE_LABEL: Record<string, string> = { vulnerability: 'Vulnerabilidade', weakness: 'Fraqueza', observation: 'Observação' }
const TYPE_COLOR: Record<string, string> = { vulnerability: 'var(--critical)', weakness: 'var(--high)', observation: 'var(--info)' }
const TYPES = ['vulnerability', 'weakness', 'observation'] as const

const REM_LABEL: Record<string, string> = { open: 'Aberto', fixed: 'Corrigido', accepted_risk: 'Risco aceito', regressed: 'Regrediu' }
const REM_COLOR: Record<string, string> = { open: 'var(--high)', fixed: 'var(--low)', accepted_risk: 'var(--muted)', regressed: 'var(--critical)' }
const REM_STATUSES = ['open', 'fixed', 'accepted_risk', 'regressed'] as const

const ChevDown  = (s?: number, c?: string) => <SI s={s || 12} c={c || 'var(--text-mute)'} sw={2}><polyline points="6 9 12 15 18 9" /></SI>
const ChevRight = (s?: number, c?: string) => <SI s={s || 12} c={c || 'var(--text-mute)'} sw={2}><polyline points="9 18 15 12 9 6" /></SI>
const DownloadIco = (s?: number, c?: string) => <SI s={s || 12} c={c || 'white'} sw={2.5}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></SI>

const selectStyle: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 99,
  color: 'var(--muted)', fontSize: 11, padding: '0.3rem 0.8rem',
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
  const [typeFilter, setTypeFilter]   = useState('')
  const [remFilter, setRemFilter]     = useState('')
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
    if (typeFilter && findingType(f) !== typeFilter) return false
    if (remFilter && (f.remediationStatus ?? 'open') !== remFilter) return false
    return true
  })

  const engCount = new Set(findings.map((f) => f.engagement_id)).size
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length]))
  const typeCounts = Object.fromEntries(TYPES.map((t) => [t, findings.filter((f) => findingType(f) === t).length]))
  const remCounts = Object.fromEntries(REM_STATUSES.map((s) => [s, findings.filter((f) => (f.remediationStatus ?? 'open') === s).length]))

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: 20, animation: 'fadeIn 0.2s ease' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>Findings</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-mute)', marginTop: 2 }}>
            {findings.length} findings detectados · {engCount} {engCount === 1 ? 'engagement' : 'engagements'}
          </div>
        </div>
        <button
          onClick={() => exportCSV(filtered)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '0.42rem 0.9rem',
            background: 'var(--purple)', border: 'none', borderRadius: 5,
            color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit', boxShadow: '0 0 16px var(--purple-glow-strong)',
          }}
        >
          {DownloadIco()} Exportar CSV
        </button>
      </div>

      {/* Panorama — mesma linguagem visual da aba Findings de um engagement
          (donut + cards), agora agregado globalmente. */}
      {!loading && findings.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 20, flexShrink: 0 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)' }}>Distribuição</div>
            <Donut
              data={SEVERITIES.map((s) => ({ key: s, label: s, value: counts[s], color: SEV_COLOR[s] }))}
              total={findings.length} caption="findings" size={128} thickness={16}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {SEVERITIES.filter((s) => counts[s] > 0).map((s) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLOR[s], flexShrink: 0 }} />
                  <span style={{ color: SEV_COLOR[s], textTransform: 'capitalize', minWidth: 55 }}>{s}</span>
                  <span style={{ color: 'var(--muted)' }}>{counts[s]}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {TYPES.map((t) => {
              const c = TYPE_COLOR[t]
              const active = typeFilter === t
              return (
                <div key={t}
                  {...clickableDivProps(() => setTypeFilter(active ? '' : t))}
                  style={{
                    background: 'var(--surface)', border: `1px solid ${active ? c : `${c}33`}`,
                    borderLeft: `4px solid ${c}`, borderRadius: 12, padding: '14px 16px',
                    display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
                  }}>
                  <div style={{ fontSize: 32, fontWeight: 700, color: c, lineHeight: 1, flexShrink: 0 }}>{typeCounts[t]}</div>
                  <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text)' }}>{TYPE_LABEL[t]}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filters row: severity chips + engagement select */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        {/* Todos */}
        <button onClick={() => setSevFilter('')} style={{
          padding: '0.3rem 0.8rem', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
          fontWeight: sevFilter === '' ? 700 : 400,
          background: sevFilter === '' ? 'var(--purple-dim)' : 'var(--surface)',
          border: `1px solid ${sevFilter === '' ? 'var(--border-mid)' : 'var(--border)'}`,
          color: sevFilter === '' ? 'var(--purple-light)' : 'var(--muted)',
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
              background: active ? `${c}14` : 'var(--surface)',
              border: `1px solid ${active ? c : 'var(--border)'}`,
              color: active ? c : 'var(--muted)', transition: 'all 0.12s',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: 2, background: active ? c : 'var(--text-mute)' }} />
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

      {/* Tipo — mesma classificação que já existe por-engagement (FindingsReport), agora global */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 2 }}>Tipo</span>
        {TYPES.map((t) => {
          const active = typeFilter === t
          const c = TYPE_COLOR[t]
          return (
            <button key={t} onClick={() => setTypeFilter(active ? '' : t)} style={{
              padding: '0.3rem 0.8rem', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
              display: 'flex', alignItems: 'center', gap: 5, fontWeight: active ? 700 : 400,
              background: active ? `color-mix(in srgb, ${c} 14%, transparent)` : 'var(--surface)',
              border: `1px solid ${active ? c : 'var(--border)'}`,
              color: active ? c : 'var(--muted)', transition: 'all 0.12s',
            }}>
              <span style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>{typeCounts[t]}</span>
              <span>{TYPE_LABEL[t]}</span>
            </button>
          )
        })}
      </div>

      {/* Remediação — status já rastreado por finding, sem visão global até agora */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 2 }}>Remediação</span>
        {REM_STATUSES.map((s) => {
          const active = remFilter === s
          const c = REM_COLOR[s]
          return (
            <button key={s} onClick={() => setRemFilter(active ? '' : s)} style={{
              padding: '0.3rem 0.8rem', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
              display: 'flex', alignItems: 'center', gap: 5, fontWeight: active ? 700 : 400,
              background: active ? `color-mix(in srgb, ${c} 14%, transparent)` : 'var(--surface)',
              border: `1px solid ${active ? c : 'var(--border)'}`,
              color: active ? c : 'var(--muted)', transition: 'all 0.12s',
            }}>
              <span style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>{remCounts[s]}</span>
              <span>{REM_LABEL[s]}</span>
            </button>
          )
        })}
      </div>

      {/* Findings list */}
      {loading ? (
        <div style={{ color: 'var(--text-mute)', textAlign: 'center', padding: '3rem', fontSize: 12, letterSpacing: '0.1em' }}>CARREGANDO...</div>
      ) : filtered.length === 0 ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '3rem', textAlign: 'center', color: 'var(--text-mute)', fontSize: 13,
        }}>
          Nenhum finding encontrado.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((f, i) => {
            const color = SEV_COLOR[f.severity] ?? '#A6ACC0'
            const isExpanded = expanded === f.id
            return (
              <div key={`${f.engagement_id}-${f.id}`}
                {...clickableDivProps(() => setExpanded(isExpanded ? null : f.id))}
                style={{
                  background: 'var(--surface)',
                  border: `1px solid ${isExpanded ? 'var(--border-mid)' : 'var(--border)'}`,
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
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.title}
                  </span>

                  {(() => {
                    const rs: RemediationStatus = f.remediationStatus ?? 'open'
                    return (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, flexShrink: 0, whiteSpace: 'nowrap',
                        background: `color-mix(in srgb, ${REM_COLOR[rs]} 14%, transparent)`, color: REM_COLOR[rs],
                      }}>
                        {REM_LABEL[rs]}
                      </span>
                    )
                  })()}

                  {f.cvss && (
                    <span style={{ fontSize: 10, color: 'var(--text-mute)', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace" }}>CVSS {f.cvss}</span>
                  )}
                  {f.engagement_name && (
                    <span style={{ fontSize: 10.5, color: 'var(--text-mute)', whiteSpace: 'nowrap', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {f.engagement_name}
                    </span>
                  )}
                  {f.description ? (isExpanded ? ChevDown() : ChevRight()) : null}
                </div>

                {isExpanded && f.description && (
                  <div style={{ padding: '0 1rem 0.9rem', borderTop: '1px solid var(--border)' }}>
                    {f.discoveredBy && (
                      <div style={{ fontSize: 10.5, color: 'var(--purple-light)', fontFamily: 'var(--mono)', paddingTop: '0.6rem' }}>
                        via {f.discoveredBy}
                      </div>
                    )}
                    <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.8, paddingTop: '0.6rem', whiteSpace: 'pre-wrap' }}>
                      {f.description}
                    </p>
                    {f.evidence && (
                      <pre style={{
                        marginTop: 8, background: 'var(--bg)', borderRadius: 5,
                        padding: '0.5rem 0.75rem', fontSize: 11, color: 'var(--muted)', overflowX: 'auto',
                        border: '1px solid var(--border)', fontFamily: "'JetBrains Mono', monospace",
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
