'use client'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { WsMsg } from '@/hooks/useEngagementWS'
import { Engagement } from '@/lib/api'
import {
  Play, Radar, ScanSearch, ShieldAlert, CheckCircle2, Loader2, Circle,
  AlertTriangle, HelpCircle, ChevronDown, ChevronRight, DollarSign, Terminal,
} from 'lucide-react'

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--critical)', high: 'var(--high)', medium: 'var(--medium)',
  low: 'var(--low)', info: 'var(--info)',
}
const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info']

// Fases do Agente 1 (black-box). A timeline deriva o estado dos eventos phase_update.
const PHASES = [
  { key: 'recon', label: 'Recon',            icon: Radar,       hint: 'Mapeamento externo' },
  { key: 'enum',  label: 'Enumeração',       icon: ScanSearch,  hint: 'Superfície + assets' },
  { key: 'vuln',  label: 'Vulnerabilidades', icon: ShieldAlert, hint: 'Checagens simples' },
]

function normalizePhase(p: string): string {
  const s = p.toLowerCase()
  if (s.includes('recon')) return 'recon'
  if (s.includes('enum'))  return 'enum'
  if (s.includes('vuln'))  return 'vuln'
  if (s.includes('exploit')) return 'exploit'
  if (s.includes('post'))  return 'post'
  return s
}

export function ExecutionPanel({
  engagement, messages, onAnswer, agentRunning, connected, started, onStart,
}: {
  engagement: Engagement
  messages: WsMsg[]
  onAnswer: (opt: string) => void
  agentRunning: boolean
  connected: boolean
  started: boolean
  onStart: () => void
}) {
  const [feedOpen, setFeedOpen] = useState(false)

  // ── Findings (dedup por id, ordenado por severidade) ──────────────────────
  const findingMsgs = messages.filter((m) => m.type === 'finding')
  const findings = Object.values(
    findingMsgs.reduce((acc, f) => { acc[String(f.id ?? f._id)] = f; return acc }, {} as Record<string, WsMsg>)
  ).sort((a, b) => SEV_ORDER.indexOf(String(a.severity)) - SEV_ORDER.indexOf(String(b.severity)))
  const counts = SEV_ORDER.map((s) => ({ sev: s, n: findings.filter((f) => String(f.severity) === s).length }))

  // ── Fase atual / progresso (de phase_update) ──────────────────────────────
  const phaseUpdates = messages.filter((m) => m.type === 'phase_update')
  const latest = phaseUpdates[phaseUpdates.length - 1]
  const currentKey = latest ? normalizePhase(String(latest.phase ?? '')) : null
  const currentProgress = latest ? Number(latest.progress ?? 0) : 0
  const currentIdx = currentKey ? PHASES.findIndex((p) => p.key === currentKey) : -1

  function phaseStatus(idx: number): 'done' | 'running' | 'pending' {
    if (currentIdx === -1) {
      // sem phase_update ainda: se rodando e começou, a 1ª fase está em andamento
      return started && agentRunning && idx === 0 ? 'running' : 'pending'
    }
    if (idx < currentIdx) return 'done'
    if (idx === currentIdx) return currentProgress >= 100 ? 'done' : 'running'
    return 'pending'
  }

  // ── Decisão pendente (último agent_question ainda não respondido) ──────────
  let lastQ = -1
  messages.forEach((m, i) => { if (m.type === 'agent_question') lastQ = i })
  const answered = lastQ >= 0 && messages.slice(lastQ + 1).some(
    (m) => m.type === 'operator_message' || m.type === 'operator_answer'
  )
  const pendingQ = lastQ >= 0 && !answered ? messages[lastQ] : null

  // ── Custo ─────────────────────────────────────────────────────────────────
  const costMsgs = messages.filter((m) => m.type === 'cost_update')
  const usd = costMsgs.reduce((s, m) => s + Number(m.usd ?? 0), 0)

  // ── Feed de atividade (mensagens/ações recentes do agente) ────────────────
  const feed = messages
    .filter((m) => m.type === 'agent_message' || m.type === 'agent_action')
    .slice(-40)

  const totalFindings = findings.length

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', maxWidth: 1000, margin: '0 auto', width: '100%' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>

      {/* HERO */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '1.1rem 1.25rem', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Mapeamento externo (Agente 1 · black-box)
          </div>
          <div style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700, marginTop: 2 }}>
            {engagement.target}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <Stat label="Findings" value={String(totalFindings)} />
          <Stat label="Custo" value={`$${usd.toFixed(2)}`} />
          <div style={{
            fontSize: 12, fontWeight: 600, padding: '0.3rem 0.7rem', borderRadius: 20,
            display: 'flex', alignItems: 'center', gap: 6,
            background: agentRunning ? 'rgba(124,58,237,.15)' : 'var(--bg)',
            border: `1px solid ${agentRunning ? 'var(--purple)' : 'var(--border)'}`,
            color: agentRunning ? 'var(--purple-light)' : 'var(--muted)',
          }}>
            {agentRunning
              ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> rodando</>
              : <>{started ? 'em pausa' : 'parado'}</>}
          </div>
        </div>
      </div>

      {/* CTA quando ainda não começou */}
      {!started && (
        <div style={{
          background: 'var(--surface)', border: '1px dashed var(--purple)', borderRadius: 12,
          padding: '2rem', textAlign: 'center', marginBottom: 16,
        }}>
          <div style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
            Pronto para mapear {engagement.target}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
            O Agente 1 roda recon → enumeração → vulnerabilidades simples automaticamente,
            sem credenciais, e mostra os achados aqui em tempo real.
          </div>
          <button onClick={onStart} disabled={!connected} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: connected ? 'var(--purple)' : 'var(--border)', border: 'none', borderRadius: 8,
            color: 'white', fontSize: 14, fontWeight: 600, padding: '0.6rem 1.4rem',
            cursor: connected ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
          }}>
            <Play size={15} /> Iniciar mapeamento automático
          </button>
        </div>
      )}

      {/* TIMELINE DE FASES */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 16,
      }}>
        {PHASES.map((p, idx) => {
          const st = phaseStatus(idx)
          const Icon = p.icon
          const color = st === 'done' ? 'var(--low)' : st === 'running' ? 'var(--purple)' : 'var(--border)'
          return (
            <div key={p.key} style={{
              flex: 1, background: 'var(--surface)', borderRadius: 10,
              border: `1px solid ${st === 'pending' ? 'var(--border)' : color}`,
              padding: '0.85rem', position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Icon size={15} color={st === 'pending' ? 'var(--muted)' : color} />
                <span style={{ fontSize: 13, fontWeight: 600, color: st === 'pending' ? 'var(--muted)' : 'var(--text)' }}>
                  {p.label}
                </span>
                <span style={{ marginLeft: 'auto' }}>
                  {st === 'done'    && <CheckCircle2 size={14} color="var(--low)" />}
                  {st === 'running' && <Loader2 size={14} color="var(--purple)" style={{ animation: 'spin 1s linear infinite' }} />}
                  {st === 'pending' && <Circle size={13} color="var(--border)" />}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.hint}</div>
              {st === 'running' && (
                <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${currentProgress || 15}%`, background: 'var(--purple)', transition: 'width .3s' }} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* DECISÃO PENDENTE */}
      {pendingQ && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--purple)', borderRadius: 12,
          padding: '1rem 1.15rem', marginBottom: 16,
          boxShadow: '0 0 0 3px var(--purple-glow)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--purple-light)', fontWeight: 600, fontSize: 13 }}>
            <HelpCircle size={15} /> Decisão necessária
          </div>
          <div style={{ color: 'var(--text)', fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>
            <ReactMarkdown>{String(pendingQ.text ?? '')}</ReactMarkdown>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(Array.isArray(pendingQ.options) ? pendingQ.options as string[] : []).map((opt) => (
              <button key={opt} onClick={() => onAnswer(opt)} style={{
                background: 'var(--purple)', border: 'none', borderRadius: 8, color: 'white',
                fontSize: 13, fontWeight: 600, padding: '0.5rem 1rem', cursor: 'pointer', fontFamily: 'inherit',
              }}>{opt}</button>
            ))}
          </div>
        </div>
      )}

      {/* FINDINGS AO VIVO */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={15} color="var(--high)" /> Achados
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {counts.filter((c) => c.n > 0).map((c) => (
              <span key={c.sev} style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
                color: SEV_COLOR[c.sev], border: `1px solid ${SEV_COLOR[c.sev]}`, borderRadius: 20,
                padding: '1px 8px',
              }}>{c.n} {c.sev}</span>
            ))}
          </div>
        </div>

        {findings.length === 0 ? (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
            padding: '2rem', textAlign: 'center', color: 'var(--muted)', fontSize: 13,
          }}>
            {agentRunning ? 'Procurando… os achados aparecem aqui conforme confirmados.' : 'Nenhum achado ainda.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
            {findings.map((f) => {
              const sev = String(f.severity ?? 'info')
              return (
                <div key={String(f._id)} style={{
                  background: 'var(--surface)', border: `1px solid ${SEV_COLOR[sev] ?? 'var(--border)'}`,
                  borderLeft: `3px solid ${SEV_COLOR[sev] ?? 'var(--border)'}`, borderRadius: 8, padding: '0.7rem 0.85rem',
                }}>
                  <div style={{ color: SEV_COLOR[sev], fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
                    {sev}
                  </div>
                  <div style={{ color: 'var(--text)', fontSize: 13, lineHeight: 1.45 }}>{String(f.title ?? '')}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* FEED DE ATIVIDADE (colapsável, secundário) */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <button onClick={() => setFeedOpen((v) => !v)} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0.7rem 1rem',
          background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          color: 'var(--muted)', fontSize: 12,
        }}>
          {feedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Terminal size={13} /> Atividade do agente ({feed.length})
        </button>
        {feedOpen && (
          <div style={{ maxHeight: 320, overflowY: 'auto', padding: '0 1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {feed.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 12, padding: '0.5rem 0' }}>Sem atividade ainda.</div>
            ) : feed.map((m) => (
              <div key={String(m._id)} style={{ fontSize: 12, color: m.type === 'agent_action' ? 'var(--purple-light)' : 'var(--text)', lineHeight: 1.5, borderBottom: '1px solid rgba(45,45,78,.4)', paddingBottom: 5 }}>
                {m.type === 'agent_action'
                  ? <span><Terminal size={10} style={{ display: 'inline', marginRight: 4 }} />{String(m.tool ?? '')} {m.args ? <span style={{ color: 'var(--muted)' }}>{String(m.args).slice(0, 80)}</span> : null}</span>
                  : <span>{String(m.text ?? '').slice(0, 240)}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>{label}</div>
    </div>
  )
}
