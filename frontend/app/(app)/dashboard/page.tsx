'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api, Engagement, Finding } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

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

const PlusIco  = (s?: number, c?: string) => <SI s={s || 13} c={c || 'white'} sw={2}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></SI>
const TrashIco = (s?: number, c?: string) => <SI s={s || 13} c={c}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" /></SI>
const TargetIco = (s?: number, c?: string) => <SI s={s || 32} c={c || '#3A3A58'}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></SI>

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.75rem',
  background: 'rgba(2,2,8,0.9)', border: '1px solid rgba(124,58,237,0.2)',
  borderRadius: 3, color: '#E2E8F0', fontSize: 12,
  outline: 'none', fontFamily: 'inherit',
}

function alertColor(count: number) {
  if (count >= 20) return '#EF4444'
  if (count >= 8)  return '#F59E0B'
  if (count >= 4)  return '#EAB308'
  return '#22C55E'
}

function KpiCard({ label, value, color, sub }: { label: string; value: number; color: string; sub: string }) {
  return (
    <div style={{
      background: '#0C0C1A', border: '1px solid rgba(124,58,237,0.13)',
      borderRadius: 8, padding: '0.9rem 1rem',
    }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: '#3A3A58', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 10.5, color: '#3A3A58', marginTop: 6 }}>{sub}</div>
    </div>
  )
}

function SeverityBar({ findings }: { findings: Finding[] }) {
  const total = findings.length
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length]))

  return (
    <div style={{
      background: '#0C0C1A', border: '1px solid rgba(124,58,237,0.13)',
      borderRadius: 8, padding: '0.9rem 1rem',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', marginBottom: 8, letterSpacing: '0.04em' }}>
        Distribuição de Findings
      </div>
      {/* Bar */}
      <div style={{ height: 8, borderRadius: 99, overflow: 'hidden', display: 'flex', marginBottom: 10, background: 'rgba(12,12,26,0.8)' }}>
        {total === 0 ? (
          <div style={{ flex: 1, background: '#3A3A58', opacity: 0.3 }} />
        ) : SEVERITIES.map((sev) => {
          const pct = total > 0 ? (counts[sev] / total) * 100 : 0
          if (pct === 0) return null
          return (
            <div key={sev} style={{ width: `${pct}%`, background: SEV_COLOR[sev], transition: 'width 0.3s ease' }} />
          )
        })}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {SEVERITIES.map((sev) => (
          <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: SEV_COLOR[sev], flexShrink: 0 }} />
            <span style={{ fontSize: 10.5, color: '#3A3A58', textTransform: 'capitalize' }}>{sev}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#E2E8F0', fontFamily: "'JetBrains Mono', monospace" }}>{counts[sev]}</span>
            {total > 0 && <span style={{ fontSize: 9.5, color: '#3A3A58' }}>{Math.round((counts[sev] / total) * 100)}%</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [findings, setFindings]       = useState<Finding[]>([])
  const [loading, setLoading]         = useState(true)
  const [showForm, setShowForm]       = useState(false)
  const [name, setName]               = useState('')
  const [target, setTarget]           = useState('')
  const [creating, setCreating]       = useState(false)
  const [hovered, setHovered]         = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting]       = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<string>('all')

  // Carrega engagements + findings. showSpinner só no 1º load (o refresh vivo é silencioso).
  const load = useCallback((showSpinner = false) => {
    if (showSpinner) setLoading(true)
    return Promise.all([api.engagements.list(), api.findings.list()])
      .then(([engs, finds]) => { setEngagements(engs); setFindings(finds) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load(true)
    // Atualização VIVA: refaz o fetch a cada 10s e ao focar a aba, para os números
    // (engagements, findings, findingsCount por card) refletirem mudanças feitas em
    // qualquer lugar e conforme os scans rodam — sem depender de reload manual.
    const interval = setInterval(() => { if (!document.hidden) load() }, 10000)
    const onFocus = () => { if (!document.hidden) load() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      const eng = await api.engagements.create({ name, target })
      setEngagements((prev) => [eng, ...prev])
      setShowForm(false); setName(''); setTarget('')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await api.engagements.delete(id)
      setEngagements((prev) => prev.filter((e) => e.id !== id))
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir')
    } finally {
      setDeleting(null)
      setConfirmDelete(null)
    }
  }

  const totalFindings = findings.length
  const criticalCount = findings.filter((f) => f.severity === 'critical').length
  const highCount     = findings.filter((f) => f.severity === 'high').length

  const filteredEngagements = activeFilter === 'all'
    ? engagements
    : engagements.filter((e) => e.id === activeFilter)

  return (
    <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* KPI Cards */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <KpiCard label="Engagements" value={engagements.length} color="#A78BFA" sub="total criados" />
          <KpiCard label="Critical" value={criticalCount} color="#EF4444" sub="findings críticos" />
          <KpiCard label="High" value={highCount} color="#F59E0B" sub="findings altos" />
          <KpiCard label="Total Findings" value={totalFindings} color="#3B82F6" sub="em todos os escopos" />
        </div>
      )}

      {/* Severity Bar */}
      {!loading && findings.length > 0 && (
        <SeverityBar findings={findings} />
      )}

      {/* Engagements section */}
      <div>
        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Engagements <span style={{ color: '#3A3A58', fontWeight: 400 }}>({engagements.length})</span>
          </span>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0.45rem 1rem',
              background: '#7C3AED', border: 'none', borderRadius: 5,
              color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: '0 0 18px rgba(124,58,237,0.35)',
            }}
          >
            {PlusIco()} Novo Escopo
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <form onSubmit={handleCreate} style={{
            background: '#0C0C1A', border: '1px solid rgba(124,58,237,0.28)',
            borderRadius: 8, padding: '1.25rem', marginBottom: 12,
            display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={{ color: '#94A3B8', fontSize: 10, display: 'block', marginBottom: 5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Nome</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cliente XYZ" required style={inputStyle} />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={{ color: '#94A3B8', fontSize: 10, display: 'block', marginBottom: 5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Alvo</label>
              <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="target.com" required style={inputStyle} />
            </div>
            <button type="submit" disabled={creating} style={{
              background: '#7C3AED', border: 'none', borderRadius: 5,
              color: 'white', fontWeight: 600, fontSize: 12, padding: '0.55rem 1rem',
              cursor: creating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', height: 34,
            }}>
              {creating ? '...' : 'Criar'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={{
              background: 'none', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 5,
              color: '#94A3B8', fontSize: 12, padding: '0.55rem 0.75rem',
              cursor: 'pointer', fontFamily: 'inherit', height: 34,
            }}>
              Cancelar
            </button>
          </form>
        )}

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12, paddingBottom: 2 }}>
          <button
            onClick={() => setActiveFilter('all')}
            style={{
              padding: '0.28rem 0.75rem', borderRadius: 99,
              background: activeFilter === 'all' ? 'rgba(124,58,237,0.10)' : 'transparent',
              border: `1px solid ${activeFilter === 'all' ? 'rgba(124,58,237,0.28)' : 'rgba(124,58,237,0.13)'}`,
              color: activeFilter === 'all' ? '#A78BFA' : '#3A3A58',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              whiteSpace: 'nowrap', transition: 'all 0.12s',
            }}
          >
            Todos
          </button>
          {engagements.map((e) => {
            const eFinds = findings.filter((f) => f.engagement_id === e.id)
            const topSev = SEVERITIES.find((s) => eFinds.some((f) => f.severity === s))
            const chipColor = topSev ? SEV_COLOR[topSev] : '#3A3A58'
            const isActive = activeFilter === e.id
            return (
              <button
                key={e.id}
                onClick={() => setActiveFilter(isActive ? 'all' : e.id)}
                style={{
                  padding: '0.28rem 0.75rem', borderRadius: 99,
                  background: isActive ? `${chipColor}18` : 'transparent',
                  border: `1px solid ${isActive ? chipColor : 'rgba(124,58,237,0.13)'}`,
                  color: isActive ? chipColor : '#3A3A58',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  whiteSpace: 'nowrap', transition: 'all 0.12s',
                }}
              >
                {e.name}
              </button>
            )
          })}
        </div>

        {/* Cards grid */}
        {loading ? (
          <div style={{ color: '#3A3A58', textAlign: 'center', padding: '3rem', fontSize: 12, letterSpacing: '0.1em' }}>CARREGANDO...</div>
        ) : filteredEngagements.length === 0 ? (
          <div style={{
            background: '#0C0C1A', border: '1px solid rgba(124,58,237,0.13)', borderRadius: 8,
            padding: '3rem', textAlign: 'center', color: '#3A3A58',
          }}>
            <div style={{ margin: '0 auto 1rem', display: 'flex', justifyContent: 'center' }}>{TargetIco()}</div>
            <p style={{ fontSize: 13 }}>Nenhum engagement ainda.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {filteredEngagements.map((e) => {
              const isH = hovered === e.id && confirmDelete !== e.id
              const eFinds = findings.filter((f) => f.engagement_id === e.id)
              const findCount = e.findingsCount ?? eFinds.length
              const ac = alertColor(findCount)
              const isDone = e.status === 'completed'
              const isPaused = e.status === 'idle'
              const phase = e.phase ?? 'idle'

              return (
                <div
                  key={e.id}
                  style={{ position: 'relative' }}
                  onMouseEnter={() => setHovered(e.id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <div
                    onClick={() => { if (confirmDelete !== e.id) router.push(`/engagement/${e.id}`) }}
                    style={{
                      background: '#0C0C1A',
                      border: `1px solid ${isH ? 'rgba(124,58,237,0.28)' : 'rgba(124,58,237,0.13)'}`,
                      borderRadius: 8, padding: '0.85rem',
                      cursor: 'pointer', transition: 'all 0.13s',
                      boxShadow: isH ? '0 4px 20px rgba(124,58,237,0.12)' : 'none',
                    }}
                  >
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#E2E8F0', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {e.name}
                        </div>
                        <div style={{ fontSize: 9.5, color: '#3A3A58', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {e.target}
                        </div>
                      </div>
                      {isDone ? (
                        <span style={{
                          fontSize: 8, fontWeight: 700, borderRadius: 99,
                          padding: '2px 7px', whiteSpace: 'nowrap',
                          background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.22)', color: '#22C55E',
                        }}>DONE</span>
                      ) : isPaused ? (
                        <span style={{
                          fontSize: 8, fontWeight: 700, borderRadius: 99,
                          padding: '2px 7px', whiteSpace: 'nowrap',
                          background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.20)', color: '#EF4444',
                        }}>PAUSED</span>
                      ) : (
                        <span style={{
                          fontSize: 8, fontWeight: 700, borderRadius: 99,
                          padding: '2px 7px', whiteSpace: 'nowrap',
                          background: 'rgba(124,58,237,0.10)', border: '1px solid rgba(124,58,237,0.28)', color: '#A78BFA',
                        }}>ACTIVE</span>
                      )}
                    </div>

                    {/* Findings bar */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 9.5, color: '#3A3A58', textTransform: 'uppercase', letterSpacing: '0.08em' }}>findings</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: ac, fontFamily: "'JetBrains Mono', monospace" }}>{findCount}</span>
                    </div>
                    <div style={{
                      height: 4, borderRadius: 99, background: 'rgba(12,12,26,0.8)',
                      marginBottom: 10, overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', borderRadius: 99,
                        background: ac,
                        width: `${Math.min(100, (findCount / 20) * 100)}%`,
                        boxShadow: findCount > 0 ? `0 0 6px ${ac}88` : 'none',
                        transition: 'width 0.3s ease',
                      }} />
                    </div>

                    {/* Tags */}
                    <div style={{ display: 'flex', gap: 5 }}>
                      <span style={{
                        fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
                        background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.18)',
                        color: '#3A3A58', borderRadius: 99, padding: '1px 6px',
                      }}>
                        {phase}
                      </span>
                      <span style={{
                        fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
                        background: 'rgba(12,12,26,0.8)', border: '1px solid rgba(50,50,80,0.3)',
                        color: '#3A3A58', borderRadius: 99, padding: '1px 6px',
                      }}>
                        {new Date(e.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>

                  {/* Delete button */}
                  {confirmDelete === e.id ? (
                    <div style={{
                      position: 'absolute', right: 0, top: 0, bottom: 0,
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '0 10px 0 18px',
                      background: 'linear-gradient(to right, transparent, rgba(12,12,26,0.98) 18px)',
                      borderRadius: '0 8px 8px 0',
                      zIndex: 2,
                    }}>
                      <span style={{ color: '#94A3B8', fontSize: 10, whiteSpace: 'nowrap' }}>Excluir?</span>
                      <button
                        onClick={(ev) => { ev.stopPropagation(); handleDelete(e.id) }}
                        disabled={deleting === e.id}
                        style={{
                          fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 5,
                          background: 'rgba(239,68,68,0.15)', color: '#EF4444',
                          border: '1px solid rgba(239,68,68,0.5)',
                          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        }}
                      >
                        {deleting === e.id ? '...' : 'Sim'}
                      </button>
                      <button
                        onClick={(ev) => { ev.stopPropagation(); setConfirmDelete(null) }}
                        style={{
                          fontSize: 10, padding: '3px 8px', borderRadius: 5,
                          background: 'rgba(45,45,78,0.5)', color: '#94A3B8',
                          border: '1px solid rgba(124,58,237,0.2)',
                          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        }}
                      >
                        Não
                      </button>
                    </div>
                  ) : (
                    isH && isAdmin && (
                      <div style={{ position: 'absolute', right: 8, top: 8 }}>
                        <button
                          onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setConfirmDelete(e.id) }}
                          style={{
                            background: 'rgba(12,12,26,0.9)', border: '1px solid rgba(50,50,80,0.4)',
                            cursor: 'pointer', color: '#3A3A58',
                            padding: 5, display: 'flex', alignItems: 'center',
                            borderRadius: 5, transition: 'all 0.15s',
                          }}
                          onMouseEnter={(ev) => { ev.currentTarget.style.color = '#EF4444'; ev.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)' }}
                          onMouseLeave={(ev) => { ev.currentTarget.style.color = '#3A3A58'; ev.currentTarget.style.borderColor = 'rgba(50,50,80,0.4)' }}
                          title="Excluir engagement"
                        >
                          {TrashIco(12)}
                        </button>
                      </div>
                    )
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
