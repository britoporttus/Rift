'use client'
import { useState, useEffect, useCallback } from 'react'
import { api, SystemMetrics, UsageEntry } from '@/lib/api'
import { Cpu, MemoryStick, HardDrive, Clock, RefreshCw, DollarSign, Zap } from 'lucide-react'

function fmtBytes(b: number) {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(0)} MB`
  return `${(b / 1024).toFixed(0)} KB`
}
function fmtUptime(s: number) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

function Gauge({ value, color = 'var(--purple)', label }: { value: number; color?: string; label: string }) {
  return (
    <div style={{ flex: 1, minWidth: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
        <span>{label}</span><span style={{ color }}>{value}%</span>
      </div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
    </div>
  )
}

function MetricCard({ icon: Icon, title, value, sub }: { icon: React.ElementType; title: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '1rem 1.25rem', flex: 1, minWidth: 160 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon size={15} color="var(--purple-light)" />
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>{title}</span>
      </div>
      <div style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export default function AdminPage() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null)
  const [usage, setUsage] = useState<UsageEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const refresh = useCallback(() => {
    setLoading(true)
    Promise.all([api.admin.metrics(), api.admin.usage()])
      .then(([m, u]) => { setMetrics(m); setUsage(u); setLastRefresh(new Date()) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const totalUsd = usage.reduce((s, u) => s + u.usd, 0)
  const totalTokens = usage.reduce((s, u) => s + u.tokens, 0)
  const memPct = metrics ? metrics.memory.usedPercent : 0
  const cpuLoad = metrics ? Math.min(100, Math.round(metrics.cpu.loadAvg[0] / metrics.cpu.cores * 100)) : 0
  const diskPct = metrics && metrics.disk.total > 0 ? Math.round(metrics.disk.used / metrics.disk.total * 100) : 0

  return (
    <div style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>Admin</h1>
        <button onClick={refresh} disabled={loading} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'none', border: '1px solid var(--border)', borderRadius: 6,
          color: 'var(--muted)', fontSize: 12, padding: '0.4rem 0.75rem',
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          atualizar
        </button>
      </div>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>

      {/* System metrics */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Infraestrutura</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: '1rem' }}>
          <MetricCard icon={Cpu} title="CPU" value={metrics ? `${cpuLoad}%` : '—'} sub={metrics ? `${metrics.cpu.cores} cores · load ${metrics.cpu.loadAvg[0].toFixed(2)}` : undefined} />
          <MetricCard icon={MemoryStick} title="RAM" value={metrics ? fmtBytes(metrics.memory.used) : '—'} sub={metrics ? `de ${fmtBytes(metrics.memory.total)} (${memPct}%)` : undefined} />
          <MetricCard icon={HardDrive} title="Disco" value={metrics ? `${diskPct}%` : '—'} sub={metrics ? `${metrics.disk.used}MB de ${metrics.disk.total}MB` : undefined} />
          <MetricCard icon={Clock} title="Uptime" value={metrics ? fmtUptime(metrics.uptime) : '—'} />
        </div>
        {metrics && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '1rem 1.25rem', display: 'flex', gap: '1.5rem' }}>
            <Gauge value={cpuLoad} color="var(--purple)" label="CPU" />
            <Gauge value={memPct} color="var(--info)" label="RAM" />
            <Gauge value={diskPct} color="var(--medium)" label="Disco" />
          </div>
        )}
      </div>

      {/* Token usage */}
      <div>
        <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Uso de Tokens</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: '1rem' }}>
          <MetricCard icon={DollarSign} title="Total gasto" value={`$${totalUsd.toFixed(4)}`} />
          <MetricCard icon={Zap} title="Total tokens" value={totalTokens.toLocaleString()} />
        </div>

        {usage.length > 0 ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '0.6rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
              {['Data', 'Tokens', 'Custo (USD)'].map((h) => (
                <div key={h} style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
              ))}
            </div>
            {usage.slice(0, 30).map((u) => (
              <div key={u.date} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '0.6rem 1.25rem', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <div style={{ color: 'var(--text)' }}>{u.date}</div>
                <div style={{ color: 'var(--purple-light)' }}>{u.tokens.toLocaleString()}</div>
                <div style={{ color: 'var(--low)' }}>${u.usd.toFixed(4)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '2rem', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            Sem dados de uso ainda.
          </div>
        )}
        <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 6, textAlign: 'right' }}>
          atualizado em {lastRefresh.toLocaleTimeString('pt-BR')}
        </div>
      </div>
    </div>
  )
}
