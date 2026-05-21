'use client'
import { useState, useRef, KeyboardEvent } from 'react'
import { Send, Square } from 'lucide-react'

const SLASH_HINTS = [
  '/pentest-intake',
  '/pentest-recon',
  '/pentest-enum',
  '/pentest-vuln',
  '/pentest-exploit',
  '/pentest-report',
]

interface Props {
  onSend: (text: string) => void
  onStop: () => void
  agentRunning: boolean
  connected: boolean
}

export function ChatInput({ onSend, onStop, agentRunning, connected }: Props) {
  const [value, setValue] = useState('')
  const [hints, setHints] = useState<string[]>([])
  const [hintIdx, setHintIdx] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleChange(v: string) {
    setValue(v)
    if (v.startsWith('/')) {
      setHints(SLASH_HINTS.filter((h) => h.startsWith(v)))
      setHintIdx(0)
    } else {
      setHints([])
    }
  }

  function submit(text: string) {
    const t = text.trim()
    if (!t || !connected) return
    onSend(t)
    setValue('')
    setHints([])
    textareaRef.current?.focus()
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (hints.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHintIdx((i) => (i + 1) % hints.length) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setHintIdx((i) => (i - 1 + hints.length) % hints.length) }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        setValue(hints[hintIdx])
        setHints([])
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(value)
    }
  }

  return (
    <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)', position: 'relative' }}>
      {hints.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '1.25rem', right: '1.25rem',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          overflow: 'hidden', marginBottom: 4, zIndex: 10,
        }}>
          {hints.map((h, i) => (
            <div key={h} onClick={() => { setValue(h); setHints([]) }} style={{
              padding: '0.5rem 0.9rem', fontSize: 13, cursor: 'pointer',
              color: i === hintIdx ? 'var(--purple-light)' : 'var(--muted)',
              background: i === hintIdx ? 'var(--purple-glow)' : 'transparent',
            }}>
              {h}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder={connected ? 'Mensagem... (/ para comandos)' : 'Conectando...'}
          disabled={!connected}
          rows={1}
          style={{
            flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, color: 'var(--text)', fontSize: 14, padding: '0.6rem 0.9rem',
            resize: 'none', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
            minHeight: 40, maxHeight: 120, overflowY: 'auto',
          }}
        />
        {agentRunning ? (
          <button onClick={onStop} title="Parar agente" style={{
            background: 'rgba(239,68,68,0.15)', border: '1px solid var(--critical)',
            borderRadius: 8, color: 'var(--critical)', width: 40, height: 40,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
          }}>
            <Square size={15} />
          </button>
        ) : (
          <button onClick={() => submit(value)} disabled={!value.trim() || !connected} title="Enviar (Enter)" style={{
            background: value.trim() && connected ? 'var(--purple)' : 'var(--border)',
            border: 'none', borderRadius: 8, color: 'white',
            width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: value.trim() && connected ? 'pointer' : 'not-allowed', flexShrink: 0, transition: 'background 0.15s',
          }}>
            <Send size={15} />
          </button>
        )}
      </div>
    </div>
  )
}
