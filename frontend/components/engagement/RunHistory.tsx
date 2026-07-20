'use client'
import { useEffect, useRef, useState } from 'react'
import { History, ChevronRight } from 'lucide-react'
import { api, Job } from '@/lib/api'

// Histórico de execuções (Jobs) do engagement — agendadas + interativas. Dá visibilidade
// à tabela durável de Jobs: status, findings, custo, duração, e os marcadores novos
// (agendado / retomado após queda / na fila). Dados via GET /engagements/:id/jobs.
const CANON = [
  { key: 'recon', label: 'Recon' }, { key: 'enum', label: 'Enum' }, { key: 'vuln', label: 'Vuln' },
  { key: 'exploit', label: 'Exploit' }, { key: 'post', label: 'Post' }, { key: 'report', label: 'Report' },
]

// stopReason/reason → PT curto (mesma taxonomia do run-outcome.js + motivos do worker).
const REASON_PT: Record<string, string> = {
  operator: 'operador', budget: 'orçamento', incomplete: 'incompleto', interrupted: 'interrompido',
  safeguard: 'safeguard', timeout: 'tempo limite', error: 'erro', 'already-running': 'já rodando',
  'framework-unavailable': 'versão indisponível', 'engagement-missing': 'engagement removido',
  'no-dispatcher': 'sem dispatcher', 'dispatch-error': 'erro de dispatch',
}

function statusColor(s: Job['status']): string {
  return s === 'running' ? 'var(--purple-light)'
    : s === 'queued' ? 'var(--purple)'
    : s === 'completed' ? 'var(--low)'
    : s === 'failed' ? 'var(--critical)'
    : 'var(--muted)' // stopped
}

function statusLabel(j: Job): string {
  if (j.status === 'running') return 'em andamento'
  if (j.status === 'queued') return j.resume ? `retomando (${(j.attempts ?? 0) + 1}/${j.maxAttempts ?? 3})` : 'na fila'
  if (j.status === 'completed') return 'concluído'
  const r = j.reason ? (REASON_PT[j.reason] || j.reason) : null
  if (j.status === 'failed') return r ? `falhou · ${r}` : 'falhou'
  return r ? `parado · ${r}` : 'parado' // stopped
}

function kindLabel(j: Job): string {
  return j.kind === 'scheduled' ? 'agendado' : 'chat'
}

function fmtDuration(j: Job): string | null {
  if (!j.startedAt) return null
  const start = new Date(j.startedAt).getTime()
  const end = j.endedAt ? new Date(j.endedAt).getTime() : Date.now()
  const s = Math.max(0, Math.floor((end - start) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h${m % 60}m`
}

function fmtWhen(iso?: string | null): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  const m = Math.floor((Date.now() - t) / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `há ${d}d`
  return new Date(iso).toLocaleDateString('pt-BR')
}

// O job ao vivo (WS) sobrepõe a linha correspondente (ou entra no topo se for novo),
// então o run em andamento atualiza sem re-buscar a cada fase.
function mergeLive(list: Job[], live?: Job | null): Job[] {
  if (!live) return list
  const idx = list.findIndex((j) => j.id === live.id)
  if (idx === -1) return [live, ...list]
  const copy = list.slice()
  copy[idx] = live
  return copy
}

export function RunHistory({ engagementId, liveJob }: { engagementId: string; liveJob?: Job | null }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const prevStatus = useRef<string | undefined>(undefined)

  const fetchJobs = () => { api.engagements.jobs(engagementId).then((l) => setJobs(l || [])).catch(() => {}) }
  useEffect(() => { fetchJobs() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [engagementId])
  // Rebusca quando um run TERMINA: findingsCount/spentUsd só são gravados no closeJob.
  useEffect(() => {
    const s = liveJob?.status
    if (s && s !== prevStatus.current && (s === 'completed' || s === 'stopped' || s === 'failed')) fetchJobs()
    prevStatus.current = s
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [liveJob?.status, liveJob?.id])

  const rows = mergeLive(jobs, liveJob)
  if (!rows.length) return null

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
        <History size={15} color="var(--purple-light)" /> Histórico de runs
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)' }}>({rows.length})</span>
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {rows.map((j, i) => {
          const isOpen = expanded === j.id
          const col = statusColor(j.status)
          const live = j.status === 'running' || j.status === 'queued'
          return (
            <div key={j.id} style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <button onClick={() => setExpanded(isOpen ? null : j.id)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '10px 14px', fontFamily: 'inherit', textAlign: 'left',
              }}>
                <ChevronRight size={13} color="var(--muted)" style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }} />
                <span style={{ width: 8, height: 8, borderRadius: 999, background: col, flexShrink: 0, boxShadow: live ? `0 0 6px ${col}` : 'none' }} />
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, color: 'var(--muted)', minWidth: 62 }}>{kindLabel(j)}</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: col, flex: 1, minWidth: 0 }}>{statusLabel(j)}</span>
                <span style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', gap: 10, flexShrink: 0, alignItems: 'center' }}>
                  <span>{j.findingsCount ?? 0} finds</span>
                  {j.spentUsd ? <span>US$ {j.spentUsd.toFixed(2)}</span> : null}
                  {fmtDuration(j) && <span>{fmtDuration(j)}</span>}
                  <span style={{ minWidth: 56, textAlign: 'right' }}>{fmtWhen(j.startedAt || j.queuedAt)}</span>
                </span>
              </button>
              {isOpen && (
                <div style={{ padding: '0 14px 12px 40px', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                  {CANON.map((c, idx) => {
                    const st = j.steps?.find((s) => s.key === c.key)?.status || 'pending'
                    const sc = st === 'done' ? 'var(--low)' : st === 'active' ? 'var(--purple-light)' : st === 'skipped' ? 'var(--border)' : 'var(--muted)'
                    return (
                      <div key={c.key} style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 600, color: sc, opacity: st === 'pending' ? 0.5 : 1 }}>
                          <span style={{ width: 6, height: 6, borderRadius: 999, background: sc }} /> {c.label}
                        </span>
                        {idx < CANON.length - 1 && <span style={{ width: 10, height: 1, background: 'var(--border)', margin: '0 5px' }} />}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
