'use client'
import { useState, useEffect, useCallback } from 'react'
import { api, SystemMetrics, UsageEntry, UserUsage } from '@/lib/api'

function fmtBytes(b: number) {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(0)} MB`
  return `${(b / 1024).toFixed(0)} KB`
}
function fmtUptime(s: number) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

function SI({ s = 15, c = 'currentColor', sw = 1.75, children }: { s?: number; c?: string; sw?: number; children: React.ReactNode }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'block' }}>
      {children}
    </svg>
  )
}

const CpuIco      = (s?: number, c?: string) => <SI s={s || 14} c={c || '#A78BFA'}><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" /><line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" /><line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" /><line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" /></SI>
const RamIco      = (s?: number, c?: string) => <SI s={s || 14} c={c || '#A78BFA'}><rect x="2" y="7" width="20" height="10" rx="2" /><line x1="6" y1="7" x2="6" y2="17" /><line x1="10" y1="7" x2="10" y2="17" /><line x1="14" y1="7" x2="14" y2="17" /><line x1="18" y1="7" x2="18" y2="17" /></SI>
const DiskIco     = (s?: number, c?: string) => <SI s={s || 14} c={c || '#A78BFA'}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></SI>
const ActivityIco = (s?: number, c?: string) => <SI s={s || 14} c={c || '#A78BFA'}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></SI>
const DollarIco   = (s?: number, c?: string) => <SI s={s || 14} c={c || '#A78BFA'}><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></SI>
const ZapIco      = (s?: number, c?: string) => <SI s={s || 14} c={c || '#A78BFA'}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></SI>
const RefreshIco  = (s?: number, c?: string) => <SI s={s || 13} c={c || '#94A3B8'}><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></SI>

const SECTION_LABEL: React.CSSProperties = {
  color: '#3A3A58', fontSize: 8, marginBottom: 10,
  textTransform: 'uppercase', letterSpacing: '0.18em',
}

function MetricCard({ icon, title, value, sub }: { icon: React.ReactNode; title: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: 'rgba(4,4,12,0.97)', border: '1px solid rgba(124,58,237,0.13)',
      borderRadius: 4, padding: '1rem 1.25rem', flex: 1, minWidth: 150,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {icon}
        <span style={{ color: '#94A3B8', fontSize: 11, letterSpacing: '0.06em' }}>{title}</span>
      </div>
      <div style={{ color: value === '—' ? '#3A3A58' : '#E2E8F0', fontSize: 18, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: '#94A3B8', fontSize: 11, marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function Gauge({ value, color = '#7C3AED', label }: { value: number; color?: string; label: string }) {
  return (
    <div style={{ flex: 1, minWidth: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94A3B8', marginBottom: 4, letterSpacing: '0.04em' }}>
        <span>{label}</span>
        <span style={{ color }}>{value}%</span>
      </div>
      <div style={{ height: 4, background: 'rgba(124,58,237,0.1)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 2, transition: 'width 0.4s' }} />
      </div>
    </div>
  )
}

export default function AdminPage() {
  const [metrics, setMetrics]       = useState<SystemMetrics | null>(null)
  const [usage, setUsage]           = useState<UsageEntry[]>([])
  const [userUsage, setUserUsage]   = useState<UserUsage[]>([])
  const [loading, setLoading]       = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [expandedDay, setExpandedDay]   = useState<string | null>(null)

  const refresh = useCallback(() => {
    setLoading(true)
    Promise.all([api.admin.metrics(), api.admin.usage(), api.admin.usageByUser()])
      .then(([m, u, uu]) => { setMetrics(m); setUsage(u); setUserUsage(uu); setLastRefresh(new Date()) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const totalUsd    = usage.reduce((s, u) => s + u.usd, 0)
  const totalTokens = usage.reduce((s, u) => s + u.tokens, 0)
  const memPct  = metrics ? metrics.memory.usedPercent : 0
  const cpuLoad = metrics ? Math.min(100, Math.round(metrics.cpu.loadAvg[0] / metrics.cpu.cores * 100)) : 0
  const diskPct = metrics && metrics.disk.total > 0 ? Math.round(metrics.disk.used / metrics.disk.total * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', animation: 'fadeIn 0.2s ease' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.75rem 2.5rem 1.5rem', maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#E2E8F0', letterSpacing: '-0.01em' }}>Admin</h1>
        <button onClick={refresh} disabled={loading} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'none', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 3,
          color: '#94A3B8', fontSize: 11, padding: '0.4rem 0.75rem',
          cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.04em',
        }}>
          <span style={{ animation: loading ? 'spin 1s linear infinite' : 'none', display: 'flex' }}>{RefreshIco()}</span>
          atualizar
        </button>
      </div>

      {/* Infraestrutura */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={SECTION_LABEL}>Infraestrutura</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '0.85rem' }}>
          <MetricCard icon={CpuIco()} title="CPU" value={metrics ? `${cpuLoad}%` : '—'} sub={metrics ? `${metrics.cpu.cores} cores · load ${metrics.cpu.loadAvg[0].toFixed(2)}` : undefined} />
          <MetricCard icon={RamIco()} title="RAM" value={metrics ? fmtBytes(metrics.memory.used) : '—'} sub={metrics ? `de ${fmtBytes(metrics.memory.total)} (${memPct}%)` : undefined} />
          <MetricCard icon={DiskIco()} title="Disco" value={metrics ? `${diskPct}%` : '—'} sub={metrics ? `${metrics.disk.used}MB de ${metrics.disk.total}MB` : undefined} />
          <MetricCard icon={ActivityIco()} title="Uptime" value={metrics ? fmtUptime(metrics.uptime) : '—'} />
        </div>
        {metrics && (
          <div style={{ background: 'rgba(4,4,12,0.97)', border: '1px solid rgba(124,58,237,0.13)', borderRadius: 4, padding: '1rem 1.25rem', display: 'flex', gap: '1.5rem' }}>
            <Gauge value={cpuLoad} color="#7C3AED" label="CPU" />
            <Gauge value={memPct} color="#3B82F6" label="RAM" />
            <Gauge value={diskPct} color="#EAB308" label="Disco" />
          </div>
        )}
      </div>

      {/* Tokens */}
      <div>
        <div style={SECTION_LABEL}>Uso de Tokens</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: '0.85rem' }}>
          <MetricCard icon={DollarIco()} title="Total gasto" value={`$${totalUsd.toFixed(4)}`} />
          <MetricCard icon={ZapIco()} title="Total tokens" value={totalTokens > 0 ? totalTokens.toLocaleString() : '0'} />
        </div>

        {usage.length > 0 ? (
          <div style={{ background: 'rgba(4,4,12,0.97)', border: '1px solid rgba(124,58,237,0.13)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '0.55rem 1.25rem', borderBottom: '1px solid rgba(124,58,237,0.1)' }}>
              {['Data', 'Tokens', 'Custo (USD)'].map((h) => (
                <div key={h} style={{ color: '#3A3A58', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em' }}>{h}</div>
              ))}
            </div>
            {usage.slice(0, 30).map((u) => (
              <div key={u.date} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '0.55rem 1.25rem', borderBottom: '1px solid rgba(124,58,237,0.07)', fontSize: 12 }}>
                <div style={{ color: '#94A3B8' }}>{u.date}</div>
                <div style={{ color: '#A78BFA' }}>{u.tokens.toLocaleString()}</div>
                <div style={{ color: '#22C55E' }}>${u.usd.toFixed(4)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: 'rgba(4,4,12,0.97)', border: '1px solid rgba(124,58,237,0.13)', borderRadius: 4, padding: '2rem', textAlign: 'center', color: '#3A3A58', fontSize: 12 }}>
            Sem dados de uso ainda.
          </div>
        )}

        <div style={{ color: '#252545', fontSize: 10, marginTop: 6, textAlign: 'right', letterSpacing: '0.04em' }}>
          atualizado em {lastRefresh.toLocaleTimeString('pt-BR')}
        </div>
      </div>

      {/* Uso por Usuário */}
      <div style={{ marginTop: '1.75rem' }}>
        <div style={SECTION_LABEL}>Uso por Usuário</div>

        {userUsage.length === 0 ? (
          <div style={{ background: 'rgba(4,4,12,0.97)', border: '1px solid rgba(124,58,237,0.13)', borderRadius: 4, padding: '2rem', textAlign: 'center', color: '#3A3A58', fontSize: 12 }}>
            Nenhum dado de uso por usuário ainda. Utilize o chat para gerar dados.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {userUsage.map((u) => {
              const uOpen = expandedUser === u.userId
              return (
                <div key={u.userId} style={{ background: 'rgba(4,4,12,0.97)', border: '1px solid rgba(124,58,237,0.13)', borderRadius: 4, overflow: 'hidden' }}>
                  {/* User row */}
                  <div
                    onClick={() => { setExpandedUser(uOpen ? null : u.userId); setExpandedDay(null) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.75rem 1.1rem', cursor: 'pointer', transition: 'background 0.12s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(8,4,20,0.97)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontSize: 11, color: '#3A3A58', width: 14 }}>{uOpen ? '▾' : '▸'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#E2E8F0', fontWeight: 600, fontSize: 12 }}>{u.userName || '—'}</div>
                      <div style={{ color: '#3A3A58', fontSize: 10, marginTop: 1 }}>{u.userEmail}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ color: '#A78BFA', fontSize: 12, fontWeight: 600 }}>{u.totalTokens.toLocaleString()} tokens</div>
                      <div style={{ color: '#22C55E', fontSize: 10, marginTop: 1 }}>${u.totalUsd.toFixed(4)}</div>
                    </div>
                  </div>

                  {/* Day rows */}
                  {uOpen && (
                    <div style={{ borderTop: '1px solid rgba(124,58,237,0.08)' }}>
                      {u.days.map((d) => {
                        const dayKey = `${u.userId}:${d.date}`
                        const dOpen = expandedDay === dayKey
                        return (
                          <div key={d.date} style={{ borderBottom: '1px solid rgba(124,58,237,0.06)' }}>
                            <div
                              onClick={() => setExpandedDay(dOpen ? null : dayKey)}
                              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.55rem 1.4rem', cursor: 'pointer', background: 'rgba(2,2,8,0.5)', transition: 'background 0.1s' }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(8,4,20,0.9)')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(2,2,8,0.5)')}
                            >
                              <span style={{ fontSize: 10, color: '#252545', width: 12 }}>{dOpen ? '▾' : '▸'}</span>
                              <span style={{ flex: 1, color: '#94A3B8', fontSize: 11 }}>{d.date}</span>
                              <span style={{ color: '#7C6AB5', fontSize: 11 }}>{d.tokens.toLocaleString()} tok</span>
                              <span style={{ color: '#1E6B42', fontSize: 11, marginLeft: 12 }}>${d.usd.toFixed(4)}</span>
                            </div>

                            {/* Engagement rows */}
                            {dOpen && (
                              <div style={{ background: 'rgba(1,1,6,0.7)' }}>
                                {d.engagements.map((eng) => (
                                  <div key={eng.engagementId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.4rem 1.7rem', borderBottom: '1px solid rgba(124,58,237,0.04)' }}>
                                    <span style={{ flex: 1, color: '#3A3A58', fontSize: 10 }}>{eng.engagementName}</span>
                                    <span style={{ color: '#4A3A7A', fontSize: 10 }}>{eng.tokens.toLocaleString()} tok</span>
                                    <span style={{ color: '#1A4A30', fontSize: 10, marginLeft: 12 }}>${eng.usd.toFixed(4)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
