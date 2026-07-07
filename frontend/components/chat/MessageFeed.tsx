'use client'
import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { WsMsg } from '@/hooks/useEngagementWS'
import { Terminal, CheckCircle, AlertTriangle, HelpCircle, Loader2, Crosshair } from 'lucide-react'

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--critical)',
  high:     'var(--high)',
  medium:   'var(--medium)',
  low:      'var(--low)',
  info:     'var(--info)',
}

const mdComponents = {
  p:          ({ children }: React.PropsWithChildren) => <p style={{ margin: '0 0 0.5em' }}>{children}</p>,
  strong:     ({ children }: React.PropsWithChildren) => <strong style={{ color: 'var(--purple-light)', fontWeight: 600 }}>{children}</strong>,
  code:       ({ children, className }: React.PropsWithChildren<{ className?: string }>) =>
    className
      ? <code style={{ display: 'block', background: 'rgba(2,2,8,0.8)', borderRadius: 4, padding: '0.5em 0.75em', fontSize: 12, overflowX: 'auto', margin: '0.5em 0', fontFamily: 'monospace', color: '#A78BFA' }}>{children}</code>
      : <code style={{ background: 'rgba(124,58,237,0.12)', borderRadius: 3, padding: '0.1em 0.35em', fontSize: 12, fontFamily: 'monospace', color: '#A78BFA' }}>{children}</code>,
  pre:        ({ children }: React.PropsWithChildren) => <pre style={{ margin: '0.5em 0', overflowX: 'auto' }}>{children}</pre>,
  ul:         ({ children }: React.PropsWithChildren) => <ul style={{ margin: '0.4em 0', paddingLeft: '1.4em' }}>{children}</ul>,
  ol:         ({ children }: React.PropsWithChildren) => <ol style={{ margin: '0.4em 0', paddingLeft: '1.4em' }}>{children}</ol>,
  li:         ({ children }: React.PropsWithChildren) => <li style={{ margin: '0.1em 0' }}>{children}</li>,
  h1:         ({ children }: React.PropsWithChildren) => <h1 style={{ fontSize: 15, fontWeight: 700, margin: '0.6em 0 0.3em', color: 'var(--text)' }}>{children}</h1>,
  h2:         ({ children }: React.PropsWithChildren) => <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0.5em 0 0.25em', color: 'var(--text)' }}>{children}</h2>,
  h3:         ({ children }: React.PropsWithChildren) => <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0.4em 0 0.2em', color: 'var(--purple-light)' }}>{children}</h3>,
  table:      ({ children }: React.PropsWithChildren) => <div style={{ overflowX: 'auto', margin: '0.5em 0' }}><table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>{children}</table></div>,
  th:         ({ children }: React.PropsWithChildren) => <th style={{ padding: '4px 10px', borderBottom: '1px solid var(--border)', color: 'var(--purple-light)', fontWeight: 600, textAlign: 'left' }}>{children}</th>,
  td:         ({ children }: React.PropsWithChildren) => <td style={{ padding: '4px 10px', borderBottom: '1px solid rgba(45,45,78,0.5)', color: 'var(--text)' }}>{children}</td>,
  blockquote: ({ children }: React.PropsWithChildren) => <blockquote style={{ borderLeft: '3px solid var(--purple)', paddingLeft: '0.75em', margin: '0.4em 0', color: 'var(--muted)', fontStyle: 'italic' }}>{children}</blockquote>,
  hr:         () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '0.75em 0' }} />,
  a:          ({ href, children }: React.PropsWithChildren<{ href?: string }>) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--purple-light)', textDecoration: 'underline' }}>{children}</a>,
}

function OperatorBubble({ msg }: { msg: WsMsg }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{
        background: 'var(--purple)', borderRadius: 8,
        padding: '0.6rem 0.9rem', color: 'white', fontSize: 14,
        lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxWidth: 540,
      }}>
        {String(msg.text ?? '')}
      </div>
    </div>
  )
}

function ActionBubble({ msg }: { msg: WsMsg }) {
  const running = msg.status === 'running'
  return (
    <div style={{
      background: 'var(--surface)', border: `1px solid ${running ? 'var(--purple)' : 'var(--border)'}`,
      borderRadius: 6, padding: '0.45rem 0.75rem', fontSize: 12,
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
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', maxWidth: 680 }}>
      <Crosshair size={14} color="var(--purple)" style={{ marginTop: 4, flexShrink: 0 }} />
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '0.65rem 0.9rem', color: 'var(--text)', fontSize: 14,
        lineHeight: 1.65, wordBreak: 'break-word', flex: 1, minWidth: 0,
      }}>
        <ReactMarkdown components={mdComponents}>{text}</ReactMarkdown>
        {msg._streaming && <span className="stream-cursor" />}
      </div>
    </div>
  )
}

function QuestionBubble({ msg, onAnswer }: { msg: WsMsg; onAnswer: (opt: string) => void }) {
  const opts = Array.isArray(msg.options) ? (msg.options as string[]) : []
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', maxWidth: 560 }}>
      <HelpCircle size={14} color="var(--purple-light)" style={{ marginTop: 4, flexShrink: 0 }} />
      <div>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--purple)',
          borderRadius: 8, padding: '0.65rem 0.9rem', color: 'var(--text)', fontSize: 14,
          marginBottom: 8, lineHeight: 1.65,
        }}>
          <ReactMarkdown components={mdComponents}>{String(msg.text ?? '')}</ReactMarkdown>
        </div>
        {opts.length > 0 && (
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
        )}
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

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <Crosshair size={14} color="var(--purple)" style={{ flexShrink: 0 }} />
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '0.55rem 0.85rem',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        <span className="typing-dot" style={{ animationDelay: '0ms' }} />
        <span className="typing-dot" style={{ animationDelay: '150ms' }} />
        <span className="typing-dot" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}

interface Props {
  messages: WsMsg[]
  onAnswer: (opt: string) => void
  isThinking: boolean
}

export function MessageFeed({ messages, onAnswer, isThinking }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, isThinking])

  const feed = messages.filter((m) => !['cost_update', 'phase_update', 'agent_thinking', 'connection_ready'].includes(m.type))

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes blink { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }
        @keyframes typingBounce { 0%, 80%, 100% { transform: translateY(0) } 40% { transform: translateY(-4px) } }
        .stream-cursor::after {
          content: '▋';
          animation: blink 0.75s ease infinite;
          color: var(--purple-light);
          font-size: 13px;
          margin-left: 1px;
        }
        .typing-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--purple-light);
          display: inline-block;
          animation: typingBounce 1.2s ease infinite;
        }
      `}</style>

      {feed.map((msg) => {
        switch (msg.type) {
          case 'operator_message': return <OperatorBubble key={msg._id} msg={msg} />
          case 'agent_action':     return <ActionBubble   key={msg._id} msg={msg} />
          case 'agent_message':    return <MessageBubble  key={msg._id} msg={msg} />
          case 'agent_question':   return <QuestionBubble key={msg._id} msg={msg} onAnswer={onAnswer} />
          case 'finding':          return <FindingBubble  key={msg._id} msg={msg} />
          default:                 return null
        }
      })}

      {isThinking && <TypingIndicator />}

      <div ref={bottomRef} />
    </div>
  )
}
