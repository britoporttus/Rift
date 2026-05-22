'use client'
import { WsMsg } from '@/hooks/useEngagementWS'
import { AlertTriangle, DollarSign, Activity } from 'lucide-react'

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--critical)',
  high: 'var(--high)',
  medium: 'var(--medium)',
  low: 'var(--low)',
  info: 'var(--info)',
}

const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info']

interface Props {
  messages: WsMsg[]
}

export function FindingsSidebar({ messages }: Props) {
  const findings = messages.filter((m) => m.type === 'finding')
  const phaseMsg = [...messages].reverse().find((m) => m.type === 'phase_update')
  const costMsgs = messages.filter((m) => m.type === 'cost_update')

  const phase    = phaseMsg ? String(phaseMsg.phase ?? '') : null
  const progress = phaseMsg ? Number(phaseMsg.progress ?? 0) : 0
  const totalUsd    = costMsgs.reduce((s, m) => s + Number(m.usd ?? 0), 0)
  const totalTokens = costMsgs.reduce((s, m) => s + Number(m.tokens ?? 0), 0)
  const usd    = totalUsd > 0 ? totalUsd.toFixed(4) : '0.00'
  const tokens = totalTokens > 0 ? totalTokens.toLocaleString() : '0'

  // deduplicate by id, keep latest
  const deduped = Object.values(
    findings.reduce((acc, f) => { acc[String(f.id ?? f._id)] = f; return acc }, {} as Record<string, WsMsg>)
  ).sort((a, b) => SEV_ORDER.indexOf(String(a.severity)) - SEV_ORDER.indexOf(String(b.severity)))

  return (
    <div style={{
      width: 280, borderLeft: '1px solid var(--border)', display: 'flex',
      flexDirection: 'column', background: 'var(--surface)', flexShrink: 0,
    }}>
      <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertTriangle size={13} color="var(--high)" />
          Findings ({deduped.length})
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
        {deduped.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: '2rem 0' }}>
            Nenhum finding ainda
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {deduped.map((f) => {
              const sev = String(f.severity ?? 'info')
              return (
                <div key={String(f._id)} style={{
                  background: 'var(--bg)', border: `1px solid ${SEV_COLOR[sev] ?? 'var(--border)'}`,
                  borderRadius: 6, padding: '0.5rem 0.7rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                    <span style={{
                      color: SEV_COLOR[sev], fontSize: 10, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>{sev}</span>
                  </div>
                  <div style={{ color: 'var(--text)', fontSize: 12, lineHeight: 1.4 }}>{String(f.title ?? '')}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Phase progress */}
      <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border)' }}>
        {phase && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Activity size={10} />
                fase: <span style={{ color: 'var(--purple-light)' }}>{phase}</span>
              </span>
              <span>{progress}%</span>
            </div>
            <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: 'var(--purple)', borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
          <DollarSign size={11} color="var(--low)" />
          <span style={{ color: 'var(--low)' }}>${usd}</span>
          <span style={{ fontSize: 11 }}> · {tokens} tokens</span>
        </div>
      </div>
    </div>
  )
}
