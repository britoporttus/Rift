'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api, Engagement, ChatSession } from '@/lib/api'
import { useEngagementWS, WsMsg } from '@/hooks/useEngagementWS'
import { MessageFeed } from '@/components/chat/MessageFeed'
import { ChatInput } from '@/components/chat/ChatInput'
import { FindingsSidebar } from '@/components/chat/FindingsSidebar'
import { FindingsReport } from '@/components/findings/FindingsReport'
import { ScheduleSettings } from '@/components/engagement/ScheduleSettings'
import { ExecutionPanel } from '@/components/engagement/ExecutionPanel'
import { ModelSwitcher } from '@/components/engagement/ModelSwitcher'
import { useAuth } from '@/hooks/useAuth'
import {
  ArrowLeft, Wifi, WifiOff, Play, MessageSquare, Shield, FileText,
  Eye, Download, X, Plus, MessageCircle, Trash2, Check, Pencil, Clock, Wand2, Radar,
} from 'lucide-react'
import Link from 'next/link'
import type { ReportFile } from '@/lib/api'

type Tab = 'exec' | 'chat' | 'findings' | 'report'

// Prompt do "Iniciar mapeamento automático" (Agente 1 black-box, recon→enum→vuln).
const AUTO_RUN_PROMPT =
  'Inicie o mapeamento automático do alvo como Agente 1 (black-box, sem credenciais): rode recon, depois enumeração, depois vulnerabilidades simples, em sequência e sem me pedir confirmação entre as fases. Pare e pergunte apenas em checkpoint real (achado crítico ou decisão importante). Mostre os achados conforme forem confirmados.'

export default function EngagementPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [engagement, setEngagement]     = useState<Engagement | null>(null)
  const [tab, setTab]                   = useState<Tab>('exec')
  const [history, setHistory]           = useState<WsMsg[]>([])
  const [showSchedule, setShowSchedule] = useState(false)

  // ── Session state ────────────────────────────────────────────────────────────
  const [sessions, setSessions]           = useState<ChatSession[]>([])
  const [activeSession, setActiveSession] = useState<string | null>(null)  // null = not yet loaded
  const [loadingSessions, setLoadingSessions] = useState(true)

  const { messages: liveMessages, connected, send, addLocal, isThinking, isStreaming, agentRunning, runState: wsRunState, contextUsage, reconnectNonce } =
    useEngagementWS(id, activeSession)

  const messages = useMemo(() => {
    const liveDbIds = new Set(liveMessages.map((m) => m._dbId).filter(Boolean))
    const filtered = history.filter((m) => !liveDbIds.has(m._dbId))
    return [...filtered, ...liveMessages]
  }, [history, liveMessages])

  // Load engagement
  useEffect(() => {
    api.engagements.get(id)
      .then(setEngagement)
      .catch(() => router.replace('/dashboard'))
  }, [id, router])

  // Load sessions list — first load sets the active session
  const refreshSessions = useCallback((keepActive = false) => {
    api.engagements.sessions.list(id)
      .then((s) => {
        setSessions(s)
        if (!keepActive && s.length > 0) {
          setActiveSession(prev => prev === null ? s[0].id : prev)
        } else if (keepActive && s.length > 0) {
          // Silently update session names (e.g. after auto-naming) without changing active
          setSessions(s)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSessions(false))
  }, [id])

  useEffect(() => { refreshSessions() }, [refreshSessions])

  // Load history whenever active session changes
  useEffect(() => {
    if (!activeSession) return
    setHistory([])
    api.engagements.messages(id, activeSession)
      .then((msgs) => setHistory(msgs.map((m, i) => ({ ...m, _id: -(i + 1) } as WsMsg))))
      .catch(() => {})
  }, [id, activeSession])

  // REL-5: ao REconectar (queda de rede no meio de um run), recarrega o histórico
  // para recuperar mensagens/findings que chegaram durante a queda. Não limpa o
  // feed antes (evita flicker); o merge por _dbId com liveMessages dedup.
  useEffect(() => {
    if (!activeSession || reconnectNonce === 0) return
    api.engagements.messages(id, activeSession)
      .then((msgs) => setHistory(msgs.map((m, i) => ({ ...m, _id: -(i + 1) } as WsMsg))))
      .catch(() => {})
  }, [reconnectNonce, id, activeSession])

  // Fallback: o sinal explícito agent_status é a fonte de verdade, mas mantemos
  // o OR com streaming caso um status se perca numa reconexão.
  const running = agentRunning || isThinking || isStreaming
  // A-STATE-1: estado do run derivado do backend — nunca de um flag local. Enquanto
  // o WS não informa (null), usa o valor persistido do engagement (sem "flash").
  const runState = (wsRunState ?? engagement?.runState ?? 'idle') as 'idle' | 'running' | 'stopped' | 'completed'

  function handleSend(text: string, extra?: Record<string, unknown>) {
    send({ type: 'operator_message', text, ...extra })
    // Refresh sessions after 2s to pick up auto-generated names
    setTimeout(() => refreshSessions(true), 2000)
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
  function handleCompact() {
    if (running || !connected) return
    handleSend('/rift-compact')
  }
  function handleStartAuto() {
    handleSend(AUTO_RUN_PROMPT)
  }
  // A-STATE-5: retoma via --resume (o claude session_id persistido) — o agente
  // continua de onde parou, sem re-rodar recon.
  function handleContinueAuto() {
    handleSend('Continue o mapeamento automático do alvo de onde parou, seguindo o mesmo plano (recon → enumeração → vulnerabilidades simples), em sequência e sem me pedir confirmação entre as fases. Pare só em checkpoint real.')
  }
  // A-STATE-5: run limpo — resetSession descarta a memória do agente no backend
  // antes de iniciar (o estado do engagement em disco permanece).
  function handleRestartAuto() {
    if (!confirm('Começar do zero descarta a memória da sessão do agente (o histórico de findings e o escopo são mantidos). Continuar?')) return
    handleSend(AUTO_RUN_PROMPT, { resetSession: true })
  }

  // ── Session actions ──────────────────────────────────────────────────────────
  async function createSession() {
    try {
      const s = await api.engagements.sessions.create(id, `Chat ${sessions.length + 1}`)
      setSessions(prev => [...prev, s])
      setActiveSession(s.id)
    } catch {}
  }

  async function deleteSession(sid: string) {
    if (sessions.length <= 1) return // keep at least one
    if (!confirm('Apagar este chat e todas as mensagens?')) return
    try {
      await api.engagements.sessions.delete(id, sid)
      const remaining = sessions.filter(s => s.id !== sid)
      setSessions(remaining)
      if (activeSession === sid) setActiveSession(remaining[0]?.id || 'default')
    } catch {}
  }

  async function renameSession(sid: string, name: string) {
    if (!name.trim()) return
    try {
      await api.engagements.sessions.rename(id, sid, name.trim())
      setSessions(prev => prev.map(s => s.id === sid ? { ...s, name: name.trim() } : s))
    } catch {}
  }

  if (!engagement) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--muted)' }}>
        carregando...
      </div>
    )
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'exec',     label: 'Execução',  icon: <Radar size={14} /> },
    { id: 'chat',     label: 'Chat',      icon: <MessageSquare size={14} /> },
    { id: 'findings', label: 'Findings',  icon: <Shield size={14} /> },
    { id: 'report',   label: 'Relatório', icon: <FileText size={14} /> },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div style={{
        padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--surface)', flexShrink: 0,
      }}>
        <Link href="/dashboard" style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={16} />
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 15 }}>{engagement.name}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>{engagement.target}</div>
        </div>

        {connected && !running && runState === 'idle' && tab === 'chat' && (
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

        {tab === 'chat' && contextUsage && (
          <ContextMeter usage={contextUsage} onCompact={handleCompact} disabled={running || !connected} />
        )}

        {tab === 'chat' && <ModelSwitcher disabled={running} />}

        {isAdmin && (
          <button onClick={() => setShowSchedule(true)} title="Agendar scans recorrentes" style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: engagement.schedule?.enabled ? 'rgba(124,58,237,.12)' : 'transparent',
            border: `1px solid ${engagement.schedule?.enabled ? 'var(--purple)' : 'var(--border)'}`,
            borderRadius: 6, color: engagement.schedule?.enabled ? 'var(--purple-light)' : 'var(--muted)',
            fontSize: 12, padding: '0.35rem 0.7rem', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <Clock size={13} />
            {engagement.schedule?.enabled ? 'Agendado' : 'Agendar'}
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
          {connected
            ? <><Wifi size={13} color="var(--low)" /><span style={{ color: 'var(--low)' }}>conectado</span></>
            : <><WifiOff size={13} color="var(--muted)" /><span style={{ color: 'var(--muted)' }}>reconectando...</span></>}
        </div>
      </div>

      {showSchedule && engagement && (
        <ScheduleSettings
          engagement={engagement}
          onClose={() => setShowSchedule(false)}
          onUpdated={(e) => setEngagement(e)}
        />
      )}

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 2, padding: '0 1.25rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', flexShrink: 0,
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
      {tab === 'exec' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <ExecutionPanel
            engagement={engagement}
            messages={messages}
            onAnswer={handleAnswer}
            agentRunning={running}
            connected={connected}
            runState={runState}
            onStart={handleStartAuto}
            onStop={handleStop}
            onContinue={handleContinueAuto}
            onRestart={handleRestartAuto}
          />
        </div>
      )}

      {tab === 'chat' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Session sidebar */}
          <SessionSidebar
            engId={id}
            sessions={sessions}
            activeSession={activeSession}
            onSelect={setActiveSession}
            onCreate={createSession}
            onDelete={deleteSession}
            onRename={renameSession}
            loading={loadingSessions}
          />

          {/* Chat area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <MessageFeed messages={messages} onAnswer={handleAnswer} isThinking={isThinking} />
            <ChatInput
              onSend={handleSend}
              onStop={handleStop}
              agentRunning={running}
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

// ── Context Meter ────────────────────────────────────────────────────────────

function ContextMeter({
  usage, onCompact, disabled,
}: {
  usage: { tokens: number; limit: number; percent: number }
  onCompact: () => void
  disabled: boolean
}) {
  const pct = Math.min(100, Math.max(0, usage.percent))
  const color = pct >= 85 ? 'var(--critical)' : pct >= 70 ? 'var(--medium)' : 'var(--purple)'
  const warn  = pct >= 70
  const kTokens = Math.round(usage.tokens / 1000)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        title={`Contexto: ~${kTokens}k de ${Math.round(usage.limit / 1000)}k tokens (${pct}%)`}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <span style={{ fontSize: 11, color: warn ? color : 'var(--muted)', whiteSpace: 'nowrap' }}>
          memória {pct}%
        </span>
        <div style={{ width: 64, height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .3s' }} />
        </div>
      </div>
      <button
        onClick={onCompact}
        disabled={disabled}
        title="Compactar contexto: salva o estado em disco e reinicia a conversa enxuta (economiza tokens)"
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: warn ? 'rgba(124,58,237,.12)' : 'transparent',
          border: `1px solid ${warn ? 'var(--purple)' : 'var(--border)'}`,
          borderRadius: 6, color: warn ? 'var(--purple-light)' : 'var(--muted)',
          fontSize: 12, padding: '0.35rem 0.7rem',
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
          fontFamily: 'inherit',
        }}
      >
        <Wand2 size={13} />
        Compactar
      </button>
    </div>
  )
}

// ── Session Sidebar ────────────────────────────────────────────────────────────

function SessionSidebar({
  engId, sessions, activeSession, onSelect, onCreate, onDelete, onRename, loading,
}: {
  engId: string
  sessions: ChatSession[]
  activeSession: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
  loading: boolean
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName]   = useState('')
  const editRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus()
  }, [editingId])

  function startEdit(s: ChatSession, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingId(s.id)
    setEditName(s.name)
  }

  function formatAge(dt: string) {
    const diff = Date.now() - new Date(dt).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1)  return 'agora'
    if (m < 60) return `${m}m`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h`
    return `${Math.floor(h / 24)}d`
  }

  return (
    <div style={{
      width: 180, flexShrink: 0,
      borderRight: '1px solid var(--border)',
      background: 'var(--surface)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '0.6rem 0.75rem',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Chats
        </span>
        <button
          onClick={onCreate}
          title="Novo chat"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--purple-light)', display: 'flex', padding: 2, borderRadius: 4,
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Sessions list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.25rem 0' }}>
        {loading ? (
          <div style={{ padding: '1rem', color: 'var(--muted)', fontSize: 12, textAlign: 'center' }}>…</div>
        ) : sessions.map(s => {
          const isActive = s.id === activeSession
          return (
            <div
              key={s.id}
              onClick={() => onSelect(s.id)}
              style={{
                padding: '0.45rem 0.75rem',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                background: isActive ? 'rgba(124,58,237,0.12)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--purple)' : '2px solid transparent',
                transition: 'background .12s',
                position: 'relative',
              }}
              className="session-row"
            >
              <MessageCircle size={12} color={isActive ? 'var(--purple-light)' : 'var(--muted)'} style={{ flexShrink: 0 }} />

              {editingId === s.id ? (
                <input
                  ref={editRef}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onBlur={() => setEditingId(null)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      onRename(s.id, editName)
                      setEditingId(null)
                    }
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onClick={e => e.stopPropagation()}
                  style={{
                    flex: 1, background: 'var(--bg)', border: '1px solid var(--purple)',
                    borderRadius: 4, color: 'var(--text)', fontSize: 12,
                    padding: '1px 4px', fontFamily: 'inherit', outline: 'none',
                  }}
                />
              ) : (
                <span style={{
                  flex: 1, fontSize: 12, minWidth: 0,
                  color: isActive ? 'var(--text)' : 'var(--muted)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {s.name}
                </span>
              )}

              {/* Actions shown on hover via CSS trick */}
              <div className="session-actions" style={{ display: 'flex', gap: 2, opacity: 0, transition: 'opacity .12s' }}>
                <button
                  onClick={e => startEdit(s, e)}
                  title="Renomear"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 1, display: 'flex', borderRadius: 3 }}
                >
                  <Pencil size={10} />
                </button>
                {sessions.length > 1 && (
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(s.id) }}
                    title="Apagar"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 1, display: 'flex', borderRadius: 3 }}
                  >
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* CSS for hover actions */}
      <style>{`
        .session-row:hover .session-actions { opacity: 1 !important; }
        .session-row:hover { background: rgba(124,58,237,0.07) !important; }
      `}</style>
    </div>
  )
}

// ── Report Tab ────────────────────────────────────────────────────────────────

function canPreview(ext: string) {
  return ['.html', '.md', '.txt'].includes(ext)
}

function ReportTab({ engagementId, engagementName }: { engagementId: string; engagementName: string }) {
  const [files, setFiles]             = useState<ReportFile[]>([])
  const [loading, setLoading]         = useState(true)
  const [preview, setPreview]         = useState<{ name: string; blobUrl: string; ext: string } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    api.reports.list(engagementId)
      .then(setFiles)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [engagementId])

  async function openPreview(f: ReportFile) {
    setPreviewLoading(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('rift_token') : null
      const res = await fetch(f.viewUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!res.ok) throw new Error('Erro ao carregar')
      const blob = await res.blob()
      setPreview({ name: f.name, blobUrl: URL.createObjectURL(blob), ext: f.ext })
    } catch {
      alert('Erro ao carregar relatório')
    } finally {
      setPreviewLoading(false)
    }
  }

  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.blobUrl)
    setPreview(null)
  }

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
    <>
      <div style={{ padding: '1.5rem', maxWidth: 800, margin: '0 auto' }}>
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--muted)' }}>
          Relatórios de <span style={{ color: 'var(--text)', fontWeight: 600 }}>{engagementName}</span>
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
              {canPreview(f.ext) && (
                <button
                  onClick={() => openPreview(f)}
                  disabled={previewLoading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                    background: 'var(--surface)', color: 'var(--text)',
                    border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <Eye size={12} /> Visualizar
                </button>
              )}
              <a
                href={f.url} download
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: 'rgba(124,58,237,.12)', color: 'var(--purple-light)',
                  border: '1px solid rgba(124,58,237,.3)', textDecoration: 'none',
                }}
              >
                <Download size={12} /> Baixar
              </a>
            </div>
          ))}
        </div>
      </div>

      {preview && (
        <div
          onClick={closePreview}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
          }}
        >
          <div
            onClick={(ev) => ev.stopPropagation()}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              width: '100%', maxWidth: 1000, height: '85vh',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            <div style={{
              padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
            }}>
              <FileText size={15} color="var(--purple-light)" />
              <span style={{ flex: 1, color: 'var(--text)', fontSize: 13, fontWeight: 500 }}>{preview.name}</span>
              <a
                href={preview.blobUrl} download={preview.name}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: 'var(--purple-light)', fontSize: 12, textDecoration: 'none',
                  padding: '0.25rem 0.6rem', borderRadius: 4,
                  border: '1px solid var(--purple)', background: 'var(--purple-glow)',
                }}
              >
                <Download size={12} /> baixar
              </a>
              <button
                onClick={closePreview}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>
            <iframe
              src={preview.blobUrl}
              style={{ flex: 1, border: 'none', background: preview.ext === '.html' ? '#fff' : 'var(--bg)' }}
              title={preview.name}
              // Relatório é HTML não-confiável (deriva de dados do alvo). Sandbox sem
              // allow-same-origin/allow-scripts → origem opaca, sem JS, sem acesso ao token.
              sandbox=""
            />
          </div>
        </div>
      )}
    </>
  )
}
