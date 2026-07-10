'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api, Engagement, Finding } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { SEV_COLOR, SEV_ORDER } from '@/lib/severity'
import {
  Plus, Trash2, Target, ShieldAlert, AlertTriangle, Bug, Radar,
} from 'lucide-react'

const SEVERITIES = SEV_ORDER

function alertColor(count: number) {
  if (count >= 20) return 'var(--critical)'
  if (count >= 8)  return 'var(--high)'
  if (count >= 4)  return 'var(--medium)'
  return 'var(--low)'
}

// ── KPI card ──────────────────────────────────────────────────────
function KpiCard({ label, value, color, sub, icon }: {
  label: string; value: number; color: string; sub: string; icon: React.ReactNode
}) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '1rem 1.15rem', position: 'relative', overflow: 'hidden',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: color }} />
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color, fontFamily: 'var(--mono)', lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 1 }}>{sub}</div>
      </div>
    </div>
  )
}

// ── Severity distribution ─────────────────────────────────────────
function SeverityBar({ findings }: { findings: Finding[] }) {
  const total = findings.length
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length]))

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '1rem 1.15rem',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Distribuição de findings
      </div>
      <div style={{ height: 8, borderRadius: 99, overflow: 'hidden', display: 'flex', marginBottom: 12, background: 'rgba(2,2,8,0.6)' }}>
        {total === 0 ? (
          <div style={{ flex: 1, background: 'var(--text-dim)' }} />
        ) : SEVERITIES.map((sev) => {
          const pct = (counts[sev] / total) * 100
          if (pct === 0) return null
          return <div key={sev} style={{ width: `${pct}%`, background: SEV_COLOR[sev], transition: 'width 0.3s ease' }} />
        })}
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        {SEVERITIES.map((sev) => (
          <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: SEV_COLOR[sev], flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>{sev}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{counts[sev]}</span>
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
    <div style={{ padding: '1.5rem 1.75rem', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1280, margin: '0 auto', width: '100%' }}>

      {/* Page title */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em' }}>Dashboard</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '3px 0 0' }}>Visão geral dos engagements e findings da plataforma.</p>
      </div>

      {/* KPI Cards */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <KpiCard label="Engagements" value={engagements.length} color="var(--purple-light)" sub="total criados" icon={<Target size={20} />} />
          <KpiCard label="Críticos" value={criticalCount} color="var(--critical)" sub="findings críticos" icon={<ShieldAlert size={20} />} />
          <KpiCard label="Altos" value={highCount} color="var(--high)" sub="findings altos" icon={<AlertTriangle size={20} />} />
          <KpiCard label="Total de findings" value={totalFindings} color="var(--info)" sub="em todos os escopos" icon={<Bug size={20} />} />
        </div>
      )}

      {/* Severity Bar */}
      {!loading && findings.length > 0 && <SeverityBar findings={findings} />}

      {/* Engagements section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Engagements <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>({engagements.length})</span>
          </span>
          <button
            onClick={() => router.push('/engagement/novo')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0.5rem 1rem', background: 'var(--purple)', border: 'none', borderRadius: 7,
              color: 'white', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 0 18px var(--purple-glow)',
            }}
          >
            <Plus size={14} /> Novo Escopo
          </button>
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 7, overflowX: 'auto', marginBottom: 14, paddingBottom: 2 }}>
          {[{ id: 'all', name: 'Todos' }, ...engagements].map((e) => {
            const isActive = activeFilter === e.id
            const eFinds = e.id === 'all' ? [] : findings.filter((f) => f.engagement_id === e.id)
            const topSev = SEVERITIES.find((s) => eFinds.some((f) => f.severity === s))
            const chipColor = topSev ? SEV_COLOR[topSev] : 'var(--purple-light)'
            return (
              <button
                key={e.id}
                onClick={() => setActiveFilter(isActive && e.id !== 'all' ? 'all' : e.id)}
                style={{
                  padding: '0.3rem 0.8rem', borderRadius: 99, whiteSpace: 'nowrap',
                  background: isActive ? `color-mix(in srgb, ${chipColor} 14%, transparent)` : 'transparent',
                  border: `1px solid ${isActive ? chipColor : 'var(--border)'}`,
                  color: isActive ? chipColor : 'var(--muted)',
                  fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
                }}
              >
                {e.name}
              </button>
            )
          })}
        </div>

        {/* Cards grid */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ height: 128, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, animation: 'pulse 1.4s ease-in-out infinite' }} />
            ))}
          </div>
        ) : filteredEngagements.length === 0 ? (
          <div style={{
            background: 'var(--surface)', border: '1px dashed var(--border-mid)', borderRadius: 12,
            padding: '3.5rem', textAlign: 'center', color: 'var(--muted)',
          }}>
            <div style={{ margin: '0 auto 1rem', display: 'flex', justifyContent: 'center', color: 'var(--text-mute)' }}><Radar size={34} /></div>
            <p style={{ fontSize: 14, margin: 0 }}>Nenhum engagement ainda.</p>
            <p style={{ fontSize: 12, margin: '6px 0 0', color: 'var(--text-mute)' }}>Crie um escopo para começar o mapeamento.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {filteredEngagements.map((e) => {
              const isH = hovered === e.id && confirmDelete !== e.id
              const eFinds = findings.filter((f) => f.engagement_id === e.id)
              const findCount = e.findingsCount ?? eFinds.length
              const ac = alertColor(findCount)
              const phase = e.phase ?? 'idle'
              // Estado REAL de execução vem de runState (idle/running/stopped/completed),
              // não de `status` (que ficava sempre 'idle' → tudo aparecia "PAUSED").
              const rs = e.runState ?? (e.status === 'completed' ? 'completed' : 'idle')
              const badge =
                  rs === 'running'   ? { t: 'RODANDO',    c: 'var(--purple-light)' }
                : rs === 'completed' ? { t: 'CONCLUÍDO',  c: 'var(--low)' }
                : rs === 'stopped'   ? { t: 'PARADO',     c: 'var(--medium)' }
                :                      { t: 'AGUARDANDO', c: 'var(--text-mute)' }

              return (
                <div key={e.id} style={{ position: 'relative' }}
                  onMouseEnter={() => setHovered(e.id)} onMouseLeave={() => setHovered(null)}>
                  <div
                    onClick={() => { if (confirmDelete !== e.id) router.push(`/engagement/${e.id}`) }}
                    style={{
                      background: 'var(--surface)',
                      border: `1px solid ${isH ? 'var(--border-mid)' : 'var(--border)'}`,
                      borderRadius: 12, padding: '1rem',
                      cursor: 'pointer', transition: 'all 0.13s',
                      boxShadow: isH ? '0 6px 24px rgba(124,58,237,0.14)' : 'none',
                    }}
                  >
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {e.name}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-mute)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {e.target}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 8.5, fontWeight: 700, borderRadius: 99, letterSpacing: '0.05em',
                        padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0,
                        background: `color-mix(in srgb, ${badge.c} 12%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${badge.c} 30%, transparent)`, color: badge.c,
                      }}>{badge.t}</span>
                    </div>

                    {/* Findings */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 9.5, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>findings</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: ac, fontFamily: 'var(--mono)' }}>{findCount}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 99, background: 'rgba(2,2,8,0.6)', marginBottom: 12, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 99, background: ac,
                        width: `${Math.min(100, (findCount / 20) * 100)}%`,
                        boxShadow: findCount > 0 ? `0 0 6px ${ac}` : 'none', transition: 'width 0.3s ease',
                      }} />
                    </div>

                    {/* Tags */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{ fontSize: 9, fontFamily: 'var(--mono)', background: 'var(--purple-glow)', border: '1px solid var(--border-mid)', color: 'var(--purple-light)', borderRadius: 99, padding: '2px 7px' }}>
                        {phase}
                      </span>
                      <span style={{ fontSize: 9, fontFamily: 'var(--mono)', background: 'rgba(2,2,8,0.5)', border: '1px solid var(--border)', color: 'var(--text-mute)', borderRadius: 99, padding: '2px 7px' }}>
                        {new Date(e.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>

                  {/* Delete */}
                  {confirmDelete === e.id ? (
                    <div style={{
                      position: 'absolute', right: 0, top: 0, bottom: 0,
                      display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px 0 20px',
                      background: 'linear-gradient(to right, transparent, var(--bg) 20px)',
                      borderRadius: '0 12px 12px 0', zIndex: 2,
                    }}>
                      <span style={{ color: 'var(--muted)', fontSize: 10.5, whiteSpace: 'nowrap' }}>Excluir?</span>
                      <button onClick={(ev) => { ev.stopPropagation(); handleDelete(e.id) }} disabled={deleting === e.id}
                        style={{
                          fontSize: 10.5, fontWeight: 700, padding: '4px 9px', borderRadius: 6,
                          background: 'color-mix(in srgb, var(--critical) 15%, transparent)', color: 'var(--critical)',
                          border: '1px solid color-mix(in srgb, var(--critical) 50%, transparent)',
                          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        }}>
                        {deleting === e.id ? '…' : 'Sim'}
                      </button>
                      <button onClick={(ev) => { ev.stopPropagation(); setConfirmDelete(null) }}
                        style={{
                          fontSize: 10.5, padding: '4px 9px', borderRadius: 6,
                          background: 'rgba(45,45,78,0.5)', color: 'var(--muted)',
                          border: '1px solid var(--border-mid)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        }}>
                        Não
                      </button>
                    </div>
                  ) : (
                    isH && isAdmin && (
                      <button
                        onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setConfirmDelete(e.id) }}
                        title="Excluir engagement" aria-label="Excluir engagement"
                        style={{
                          position: 'absolute', right: 8, top: 8,
                          background: 'var(--bg)', border: '1px solid var(--border-mid)',
                          cursor: 'pointer', color: 'var(--text-mute)', padding: 6,
                          display: 'flex', alignItems: 'center', borderRadius: 6, transition: 'all 0.15s',
                        }}
                        onMouseEnter={(ev) => { ev.currentTarget.style.color = 'var(--critical)'; ev.currentTarget.style.borderColor = 'color-mix(in srgb, var(--critical) 40%, transparent)' }}
                        onMouseLeave={(ev) => { ev.currentTarget.style.color = 'var(--text-mute)'; ev.currentTarget.style.borderColor = 'var(--border-mid)' }}
                      >
                        <Trash2 size={13} />
                      </button>
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
