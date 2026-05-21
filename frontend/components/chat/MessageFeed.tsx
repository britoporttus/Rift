'use client'
import { useEffect, useRef } from 'react'
import { WsMsg } from '@/hooks/useEngagementWS'
import { Terminal, CheckCircle, AlertTriangle, HelpCircle, Loader2, Crosshair } from 'lucide-react'

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--critical)',
  high: 'var(--high)',
  medium: 'var(--medium)',
  low: 'var(--low)',
  info: 'var(--info)',
}

function ThinkingBubble({ msg }: { msg: WsMsg }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', opacity: 0.7 }}>
      <Loader2 size={14} color="var(--muted)" style={{ marginTop: 2, flexShrink: 0, animation: 'spin 1s linear infinite' }} />
      <span style={{ color: 'var(--muted)', fontSize: 13, fontStyle: 'italic' }}>{String(msg.text ?? '')}</span>
    </div>
  )
}

function ActionBubble({ msg }: { msg: WsMsg }) {
  const running = msg.status === 'running'
  return (
    <div style={{
      background: 'var(--surface)', border: `1px solid ${running ? 'var(--purple)' : 'var(--border)'}`,
      borderRadius: 6, padding: '0.5rem 0.75rem', fontSize: 12,
      display: 'flex', alignItems: 'center', gap: 8, maxWidth: 560,
    }}>
      <Terminal size={12} color="var(--purple-light)" style={{ flexShrink: 0 }} />
      <span style={{ color: 'var(--purple-light)', fontWeight: 600 }}>{String(msg.tool ?? '')}</span>
      {msg.args != null && <span style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{String(msg.args)}</span>}
      {running
        ? <Loader2 size={11} color="var(--purple)" style={{ marginLeft: 'auto', flexShrink: 0, animation: 'spin 1s linear infinite' }} />
        : <CheckCircle size={11} color="var(--low)" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
    </div>
  )
}

function MessageBubble({ msg }: { msg: WsMsg }) {
  const text = String(msg.text ?? '')
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', maxWidth: 640 }}>
      <Crosshair size={14} color="var(--purple)" style={{ marginTop: 2, flexShrink: 0 }} />
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '0.6rem 0.9rem', color: 'var(--text)', fontSize: 14,
        lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {text}
      </div>
    </div>
  )
}

function QuestionBubble({ msg, onAnswer }: { msg: WsMsg; onAnswer: (opt: string) => void }) {
  const opts = Array.isArray(msg.options) ? (msg.options as string[]) : []
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', maxWidth: 560 }}>
      <HelpCircle size={14} color="var(--purple-light)" style={{ marginTop: 2, flexShrink: 0 }} />
      <div>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--purple)',
          borderRadius: 8, padding: '0.6rem 0.9rem', color: 'var(--text)', fontSize: 14,
          marginBottom: 8,
        }}>
          {String(msg.text ?? '')}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {opts.map((opt) => (
            <button key={opt} onClick={() => onAnswer(opt)} style={{
              background: 'var(--purple-glow)', border: '1px solid var(--purple)',
              borderRadius: 6, color: 'var(--purple-light)', fontSize: 13,
              padding: '0.35rem 0.9rem', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function FindingBubble({ msg }: { msg: WsMsg }) {
  const sev = String(msg.severity ?? 'info')
  return (
    <div style={{
      background: 'var(--surface)', border: `1px solid ${SEV_COLOR[sev] ?? 'var(--border)'}`,
      borderRadius: 6, padding: '0.5rem 0.75rem', maxWidth: 560,
      display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
    }}>
      <AlertTriangle size={13} color={SEV_COLOR[sev]} style={{ flexShrink: 0 }} />
      <span style={{ color: SEV_COLOR[sev], fontWeight: 700, fontSize: 11, textTransform: 'uppercase', flexShrink: 0 }}>{sev}</span>
      <span style={{ color: 'var(--text)' }}>{String(msg.title ?? '')}</span>
    </div>
  )
}

interface Props {
  messages: WsMsg[]
  onAnswer: (opt: string) => void
}

export function MessageFeed({ messages, onAnswer }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const feed = messages.filter((m) => !['cost_update', 'phase_update'].includes(m.type))

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      {feed.map((msg) => {
        switch (msg.type) {
          case 'agent_thinking': return <ThinkingBubble key={msg._id} msg={msg} />
          case 'agent_action':   return <ActionBubble key={msg._id} msg={msg} />
          case 'agent_message':  return <MessageBubble key={msg._id} msg={msg} />
          case 'agent_question': return <QuestionBubble key={msg._id} msg={msg} onAnswer={onAnswer} />
          case 'finding':        return <FindingBubble key={msg._id} msg={msg} />
          default:               return null
        }
      })}
      <div ref={bottomRef} />
    </div>
  )
}
