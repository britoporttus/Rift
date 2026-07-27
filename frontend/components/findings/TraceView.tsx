'use client'
import { useEffect, useState } from 'react'
import { api, TraceMessage } from '@/lib/api'
import { Terminal, MessageSquare } from 'lucide-react'

// Reconstrói "como o agente chegou aqui" — não é um vínculo causal explícito
// (Finding não referencia mensagens), é aproximação por proximidade de horário
// dentro do mesmo engagement. Ver backend/src/api/findings.js GET /:id/trace.
export function TraceView({ findingId }: { findingId: string }) {
  const [messages, setMessages] = useState<TraceMessage[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.findings.trace(findingId)
      .then((t) => { if (!cancelled) setMessages(t.messages) })
      .catch(() => { if (!cancelled) setError('Não foi possível carregar o rastro.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [findingId])

  if (loading) return <div style={{ fontSize: 11.5, color: 'var(--text-mute)' }}>carregando rastro…</div>
  if (error) return <div style={{ fontSize: 11.5, color: 'var(--text-mute)' }}>{error}</div>
  if (!messages || messages.length === 0) {
    return <div style={{ fontSize: 11.5, color: 'var(--text-mute)' }}>Sem rastro reconstruível para este achado (fora da janela de correlação).</div>
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 240, overflowY: 'auto',
      background: 'rgba(2,2,8,0.5)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px',
    }}>
      {messages.map((m, i) => {
        const p = m.payload || {}
        if (m.type === 'agent_action') {
          const tool = String(p.tool ?? '?')
          const args = p.args != null ? String(p.args) : ''
          const status = String(p.status ?? '')
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, fontFamily: 'var(--mono)' }}>
              <Terminal size={11} color="var(--purple-light)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ minWidth: 0 }}>
                <span style={{ color: 'var(--purple-light)' }}>{tool}</span>
                {args && <span style={{ color: 'var(--muted)' }}> {args.length > 140 ? args.slice(0, 138) + '…' : args}</span>}
                {status && <span style={{ color: 'var(--text-mute)', marginLeft: 6 }}>[{status}]</span>}
              </div>
            </div>
          )
        }
        const text = String(p.text ?? '')
        if (!text) return null
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11.5 }}>
            <MessageSquare size={11} color="var(--text-mute)" style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ color: 'var(--muted)', lineHeight: 1.4 }}>
              {text.length > 220 ? text.slice(0, 218) + '…' : text}
            </span>
          </div>
        )
      })}
    </div>
  )
}
