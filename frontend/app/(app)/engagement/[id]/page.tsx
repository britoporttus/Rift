'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api, Engagement } from '@/lib/api'
import { useEngagementWS } from '@/hooks/useEngagementWS'
import { MessageFeed } from '@/components/chat/MessageFeed'
import { ChatInput } from '@/components/chat/ChatInput'
import { FindingsSidebar } from '@/components/chat/FindingsSidebar'
import { FindingsReport } from '@/components/findings/FindingsReport'
import { ArrowLeft, Wifi, WifiOff, Play, MessageSquare, Shield, FileText } from 'lucide-react'
import Link from 'next/link'
import type { ReportFile } from '@/lib/api'

type Tab = 'chat' | 'findings' | 'report'

export default function EngagementPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [engagement, setEngagement] = useState<Engagement | null>(null)
  const [started, setStarted] = useState(false)
  const [tab, setTab] = useState<Tab>('chat')

  const { messages, connected, send } = useEngagementWS(id)

  useEffect(() => {
    api.engagements.get(id)
      .then(setEngagement)
      .catch(() => router.replace('/dashboard'))
  }, [id, router])

  const agentRunning = useMemo(() => {
    const feed = [...messages].reverse()
    const lastAction = feed.find((m) => m.type === 'agent_action' && m.status === 'running')
    const lastDone   = feed.find((m) => m.type === 'agent_message' && String(m.text).includes('encerrado'))
    if (!lastAction) return false
    if (lastDone && (lastDone._id ?? 0) > (lastAction._id ?? 0)) return false
    return true
  }, [messages])

  function handleSend(text: string) {
    send({ type: 'operator_message', text })
    setStarted(true)
  }

  function handleAnswer(opt: string) {
    send({ type: 'operator_answer', option: opt, text: opt })
  }

  function handleStop() {
    send({ type: 'agent_stop' })
  }

  function handleStartTests() {
    handleSend('Iniciar testes automatizados no alvo.')
  }

  if (!engagement) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--muted)' }}>
        carregando...
      </div>
    )
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'chat', label: 'Chat', icon: <MessageSquare size={14} /> },
    { id: 'findings', label: 'Findings', icon: <Shield size={14} /> },
    { id: 'report', label: 'Relatório', icon: <FileText size={14} /> },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div style={{
        padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', flexShrink: 0,
      }}>
        <Link href="/dashboard" style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={16} />
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 15 }}>{engagement.name}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>{engagement.target}</div>
        </div>

        {connected && !agentRunning && !started && (
          <button onClick={handleStartTests} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--purple)', border: 'none', borderRadius: 6,
            color: 'white', fontSize: 13, fontWeight: 600, padding: '0.4rem 0.85rem',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <Play size={13} />
            Iniciar testes
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
          {connected
            ? <><Wifi size={13} color="var(--low)" /><span style={{ color: 'var(--low)' }}>conectado</span></>
            : <><WifiOff size={13} color="var(--muted)" /><span style={{ color: 'var(--muted)' }}>reconectando...</span></>}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 2, padding: '0 1.25rem',
        borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0,
      }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0.6rem 1rem', fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            color: tab === t.id ? 'var(--purple-light)' : 'var(--muted)',
            borderBottom: tab === t.id ? '2px solid var(--purple)' : '2px solid transparent',
            marginBottom: -1, transition: 'color .15s',
          }}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      {tab === 'chat' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <MessageFeed messages={messages} onAnswer={handleAnswer} />
            <ChatInput
              onSend={handleSend}
              onStop={handleStop}
              agentRunning={agentRunning}
              connected={connected}
            />
          </div>
          <FindingsSidebar messages={messages} />
        </div>
      )}

      {tab === 'findings' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <FindingsReport engagementId={id} />
        </div>
      )}

      {tab === 'report' && (
        <ReportTab engagementId={id} engagementName={engagement.name} />
      )}
    </div>
  )
}

function ReportTab({ engagementId, engagementName }: { engagementId: string; engagementName: string }) {
  const [files, setFiles] = useState<ReportFile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.reports.list(engagementId)
      .then(setFiles)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [engagementId])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--muted)', fontSize: 13 }}>
      Carregando relatórios...
    </div>
  )

  if (files.length === 0) return (
    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
      Nenhum relatório disponível para este engagement.
    </div>
  )

  return (
    <div style={{ padding: '1.5rem', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--muted)' }}>
        Relatórios gerados para <span style={{ color: 'var(--text)', fontWeight: 600 }}>{engagementName}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {files.map(f => (
          <div key={f.name} style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <FileText size={16} color="var(--purple-light)" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--text)', fontWeight: 500, fontSize: 13 }}>{f.name}</div>
              <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>
                {(f.size / 1024).toFixed(1)} KB · {f.ext.toUpperCase().replace('.', '')}
              </div>
            </div>
            <a
              href={f.url}
              target="_blank"
              rel="noreferrer"
              style={{
                padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: 'rgba(124,58,237,.12)', color: 'var(--purple-light)',
                border: '1px solid rgba(124,58,237,.3)', textDecoration: 'none',
                transition: 'background .15s',
              }}
            >
              Download
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
