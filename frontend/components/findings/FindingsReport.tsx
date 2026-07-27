'use client'
import { useState, useEffect } from 'react'
import { api, Finding, RemediationStatus } from '@/lib/api'
import { SEV_COLOR, SEV_ORDER, safeHref } from '@/lib/severity'
import { clickableDivProps } from '@/lib/a11y'
import { findingType, findingConfirmation, findingExploitation, cvssKind } from '@/lib/findingClassify'
import { Donut } from '@/components/ui/charts/Donut'

// Status de remediação — fecha o ciclo "achei → corrigi → confirmei"
const REMEDIATION: Record<RemediationStatus, { label: string; color: string; icon: string }> = {
  open:          { label: 'Aberto',       color: '#F5892E', icon: '○' },
  fixed:         { label: 'Corrigido',    color: '#22c55e', icon: '✓' },
  regressed:     { label: 'Regrediu',     color: '#F04452', icon: '⚠' },
  accepted_risk: { label: 'Risco aceito', color: '#A6ACC0', icon: '◆' },
}

function fmtDate(d?: string | null) {
  if (!d) return null
  const t = new Date(d)
  if (isNaN(t.getTime())) return null
  return t.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
// Dimensões independentes (ETAPA 5.2) com PALETAS DISTINTAS entre si — Tipo NÃO
// reusa o vermelho/laranja da severidade (senão "tipo" e "severidade" se confundem).
// Tipo → família violeta/fúcsia/ardósia. Severidade → rampa SEV_COLOR. Status →
// verde/vermelho/cinza. Confirmação/Exploração → dot + rótulo neutros.
const TYPE_META: Record<string, { label: string; color: string }> = {
  vulnerability: { label: 'Vulnerabilidade', color: '#c026d3' },
  weakness:      { label: 'Fraqueza',        color: '#8b5cf6' },
  observation:   { label: 'Observação',      color: '#64748b' },
}
const CONF_META: Record<string, { label: string; color: string }> = {
  confirmed:      { label: 'Confirmado',     color: '#22c55e' },
  probable:       { label: 'Provável',       color: '#eab308' },
  unvalidated:    { label: 'Não validado',   color: '#A6ACC0' },
  false_positive: { label: 'Falso positivo', color: '#64748b' },
}
const EXPL_META: Record<string, { label: string; color: string }> = {
  confirmed:       { label: 'Exploração confirmada',      color: '#F04452' },
  potential:       { label: 'Potencialmente explorável', color: '#F5892E' },
  not_exploitable: { label: 'Não explorável',            color: '#64748b' },
  untested:        { label: 'Não testada',               color: '#A6ACC0' },
}

// ── expandable finding card ──────────────────────────────────────
interface ExtFinding extends Finding {
  finding_type?: string
  cwe?: string
  owasp?: string
  solution?: string
  instances?: { method: string; uri: string; evidence?: string }[]
}

function FindingCard({ f, onStatusChange }: { f: ExtFinding; onStatusChange: (id: string, s: RemediationStatus) => void }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const sev = f.severity
  const type = findingType(f)          // Tipo real (state/severity), não o finding_type inexistente
  const conf = findingConfirmation(f)  // Confirmação (state)
  const expl = findingExploitation(f)  // Exploração (reproducible)
  const ck   = cvssKind(f)             // CVSS calculado vs estimado
  const instances = f.instances || []
  const rem = REMEDIATION[f.remediationStatus ?? 'open']
  const firstSeen = fmtDate(f.firstSeen)
  const lastSeen  = fmtDate(f.lastSeen)

  async function changeStatus(s: RemediationStatus, e: React.MouseEvent) {
    e.stopPropagation()
    if (s === (f.remediationStatus ?? 'open') || saving) return
    setSaving(true)
    try { await api.findings.setStatus(f.id, s); onStatusChange(f.id, s) }
    finally { setSaving(false) }
  }

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 10, overflow: 'hidden',
      border: '1px solid var(--border)', transition: 'border-color .15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-hi)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      {/* header */}
      <div {...clickableDivProps(() => setOpen(o => !o))} style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', cursor: 'pointer',
      }}>
        {/* severity bar */}
        <div style={{ width: 4, height: 36, borderRadius: 2, background: SEV_COLOR[sev] ?? 'var(--muted)', flexShrink: 0 }} />

        {/* title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)', marginBottom: 2 }}>{f.title}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {f.cwe && (
              <span style={{ fontSize: 10, color: 'var(--info)' }}>{f.cwe}</span>
            )}
            {f.owasp && (
              <span style={{ fontSize: 10, color: 'var(--high)' }}>{f.owasp}</span>
            )}
          </div>
        </div>

        {/* meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* remediation status badge */}
          <span style={{
            background: `${rem.color}22`, color: rem.color,
            border: `1px solid ${rem.color}55`,
            borderRadius: 999, padding: '1px 8px', fontSize: 10, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <span>{rem.icon}</span>{rem.label}
          </span>
          {/* TIPO (paleta própria, distinta da severidade) */}
          <span style={{
            background: `${TYPE_META[type].color}22`, color: TYPE_META[type].color,
            border: `1px solid ${TYPE_META[type].color}55`,
            borderRadius: 999, padding: '1px 8px', fontSize: 10, fontWeight: 700,
          }}>
            {TYPE_META[type].label}
          </span>
          {/* CONFIRMAÇÃO (dot + rótulo neutro) */}
          <span title="Confirmação" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 10, fontWeight: 600, color: 'var(--muted)',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: CONF_META[conf].color, flexShrink: 0 }} />
            {CONF_META[conf].label}
          </span>
          {/* SEVERIDADE (rampa canônica) */}
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
              background: 'var(--raised)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '2px 8px', fontSize: 11, color: 'var(--muted)',
            }}>
              {instances.length} {instances.length === 1 ? 'instância' : 'instâncias'}
            </span>
          )}
          {ck && (
            <span title={ck === 'calculated' ? 'CVSS calculado (com vetor)' : 'CVSS estimado (sem vetor)'} style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
              CVSS {f.cvss} <span style={{ color: 'var(--text-mute)', fontSize: 9.5 }}>{ck === 'calculated' ? 'calc.' : 'est.'}</span>
            </span>
          )}
          <span style={{ color: 'var(--muted)', fontSize: 12, transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </div>
      </div>

      {/* body */}
      {open && (
        <div style={{ padding: '0 16px 16px 32px' }}>
          {/* Exploração (dimensão 5) — dot + rótulo, separada da severidade/tipo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0 0' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Exploração:</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: EXPL_META[expl].color }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: EXPL_META[expl].color, flexShrink: 0 }} />
              {EXPL_META[expl].label}
            </span>
          </div>
          {/* remediation control + temporal tracking */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            padding: '10px 0 12px', borderBottom: '1px solid rgba(46,49,73,.5)', marginBottom: 12,
          }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Status:</span>
            {(['open', 'fixed', 'accepted_risk'] as RemediationStatus[]).map(s => {
              const active = (f.remediationStatus ?? 'open') === s
              const cfg = REMEDIATION[s]
              return (
                <button key={s} onClick={(e) => changeStatus(s, e)} disabled={saving}
                  style={{
                    padding: '3px 10px', borderRadius: 6, fontSize: 11, fontFamily: 'inherit',
                    cursor: saving ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                    border: `1px solid ${active ? cfg.color : 'var(--border)'}`,
                    background: active ? `${cfg.color}22` : 'transparent',
                    color: active ? cfg.color : 'var(--muted)',
                  }}>
                  <span>{cfg.icon}</span>{cfg.label}
                </button>
              )
            })}
            {(firstSeen || lastSeen) && (
              <span style={{ fontSize: 11, color: 'var(--text-mute)', marginLeft: 'auto' }}>
                {firstSeen && `1ª detecção: ${firstSeen}`}
                {firstSeen && lastSeen && '  ·  '}
                {lastSeen && `última: ${lastSeen}`}
              </span>
            )}
          </div>
          {f.discoveredBy && (
            <div style={{ fontSize: 11, color: 'var(--purple-light)', fontFamily: 'var(--mono)', marginBottom: 8 }}>via {f.discoveredBy}</div>
          )}
          {f.description && (
            <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>{f.description}</p>
          )}

          {f.solution && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--purple)', margin: '10px 0 6px' }}>
                Solução recomendada
              </div>
              <div style={{
                background: 'var(--raised)', borderRadius: 8, padding: '10px 12px',
                fontSize: 12, color: 'var(--muted)', borderLeft: '3px solid var(--low)',
              }}>
                {f.solution}
              </div>
            </>
          )}

          {instances.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--purple)', margin: '12px 0 6px' }}>
                Instâncias afetadas
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Método', 'URL', 'Evidência'].map(h => (
                        <th key={h} style={{ textAlign: 'left', color: 'var(--muted)', fontWeight: 600, padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {instances.map((inst, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(46,49,73,.5)' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <span style={{ background: 'rgba(124,58,237,.2)', color: 'var(--purple-light)', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                            {inst.method}
                          </span>
                        </td>
                        <td style={{ padding: '6px 8px', wordBreak: 'break-all' }}>
                          {safeHref(inst.uri)
                            ? <a href={safeHref(inst.uri)!} target="_blank" rel="noreferrer" style={{ color: 'var(--info)', textDecoration: 'none' }}>{inst.uri}</a>
                            : <span style={{ color: 'var(--muted)' }} title="URL não-http bloqueada por segurança">{inst.uri}</span>}
                        </td>
                        <td style={{ padding: '6px 8px', color: 'var(--muted)', wordBreak: 'break-all' }}>
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
  const [statusFilter, setStatusFilter] = useState<RemediationStatus | 'all'>('all')

  useEffect(() => {
    api.findings.list({ engagementId })
      .then(data => setFindings(data as ExtFinding[]))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [engagementId])

  function handleStatusChange(id: string, s: RemediationStatus) {
    setFindings(prev => prev.map(f => f.id === id ? { ...f, remediationStatus: s } : f))
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--muted)', fontSize: 13 }}>
      Carregando findings...
    </div>
  )

  const tOrder = { vulnerability: 0, weakness: 1, observation: 2 } as const
  const sorted = [...findings].sort((a, b) => {
    const td = tOrder[findingType(a) as keyof typeof tOrder] - tOrder[findingType(b) as keyof typeof tOrder]
    if (td !== 0) return td
    return SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity)
  })

  const byType = (t: string) => sorted.filter(f => findingType(f) === t)
  const vulns = byType('vulnerability')
  const weaknesses = byType('weakness')
  const observations = byType('observation')

  const bySev = (s: string) => sorted.filter(f => f.severity === s)
  const remCount = (s: RemediationStatus) => sorted.filter(f => (f.remediationStatus ?? 'open') === s).length
  const byTypeFiltered = filter === 'all' ? sorted : sorted.filter(f => findingType(f) === filter)
  const displayed = statusFilter === 'all'
    ? byTypeFiltered
    : byTypeFiltered.filter(f => (f.remediationStatus ?? 'open') === statusFilter)

  const donutData = SEV_ORDER.map(s => ({ key: s, label: s, value: bySev(s).length, color: SEV_COLOR[s] }))
  const total = sorted.length

  if (total === 0) return (
    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
      Nenhum finding ainda neste engagement.
    </div>
  )

  const filterBtn = (t: FilterType, label: string, count: number) => (
    <button key={t} onClick={() => setFilter(t)} style={{
      padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
      border: '1px solid', transition: 'all .15s',
      borderColor: filter === t ? 'var(--purple)' : 'var(--border)',
      background: filter === t ? 'rgba(124,58,237,.12)' : 'var(--surface2)',
      color: filter === t ? 'var(--text)' : 'var(--muted)',
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
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 4 }}>Distribuição</div>
          <Donut data={donutData} total={total} caption="findings" size={128} thickness={16} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {SEV_ORDER.filter(s => bySev(s).length > 0).map(s => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLOR[s], flexShrink: 0 }} />
                <span style={{ color: SEV_COLOR[s], textTransform: 'capitalize', minWidth: 55 }}>{s}</span>
                <span style={{ color: 'var(--muted)' }}>{bySev(s).length}</span>
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
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{s}</div>
                <div style={{ fontSize: 34, fontWeight: 700, color: SEV_COLOR[s], margin: '4px 0 2px' }}>{bySev(s).length}</div>
              </div>
            ))}
          </div>

          {/* type breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { type: 'vulnerability', items: vulns, color: TYPE_META.vulnerability.color, label: 'Vulnerabilidades confirmadas', sub: 'Confirmadas na taxonomia (state=confirmed)' },
              { type: 'weakness', items: weaknesses, color: TYPE_META.weakness.color, label: 'Fraquezas', sub: 'Prováveis/indícios — aumentam a superfície' },
              { type: 'observation', items: observations, color: TYPE_META.observation.color, label: 'Observações informativas', sub: 'Info/ruled-out — sem impacto direto' },
            ].map(({ type, items, color, label, sub }) => (
              <div key={type} style={{
                background: 'var(--surface)', border: `1px solid ${color}33`,
                borderLeft: `4px solid ${color}`, borderRadius: 12, padding: '14px 16px',
                display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
              }} onClick={() => setFilter(filter === type as FilterType ? 'all' : type as FilterType)}>
                <div style={{ fontSize: 32, fontWeight: 700, color, lineHeight: 1, flexShrink: 0 }}>{items.length}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── remediation status bar ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '.06em', marginRight: 2 }}>
          Remediação
        </span>
        <button onClick={() => setStatusFilter('all')} style={{
          padding: '5px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
          border: '1px solid', borderColor: statusFilter === 'all' ? 'var(--purple)' : 'var(--border)',
          background: statusFilter === 'all' ? 'rgba(124,58,237,.12)' : 'var(--surface2)',
          color: statusFilter === 'all' ? 'var(--text)' : 'var(--muted)',
        }}>
          Todos ({total})
        </button>
        {(['open', 'fixed', 'accepted_risk', 'regressed'] as RemediationStatus[]).map(s => {
          const cfg = REMEDIATION[s]
          const count = remCount(s)
          const active = statusFilter === s
          return (
            <button key={s} onClick={() => setStatusFilter(active ? 'all' : s)} style={{
              padding: '5px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
              border: '1px solid', display: 'inline-flex', alignItems: 'center', gap: 5,
              borderColor: active ? cfg.color : 'var(--border)',
              background: active ? `${cfg.color}1f` : 'var(--surface2)',
              color: active ? cfg.color : 'var(--muted)',
            }}>
              <span>{cfg.icon}</span>{cfg.label} ({count})
            </button>
          )
        })}
      </div>

      {/* ── filter bar (by type) ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {filterBtn('all', 'Todos', total)}
        {filterBtn('vulnerability', '● Vulnerabilidade', vulns.length)}
        {filterBtn('weakness', '● Fraqueza', weaknesses.length)}
        {filterBtn('observation', '● Observação', observations.length)}
      </div>

      {/* ── finding list ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {displayed.length === 0
          ? <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-mute)', fontSize: 13 }}>Nenhum finding com esse filtro.</div>
          : displayed.map(f => <FindingCard key={f.id} f={f} onStatusChange={handleStatusChange} />)}
      </div>
    </div>
  )
}
