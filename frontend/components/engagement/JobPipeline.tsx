'use client'
import { useEffect, useState } from 'react'
import { Check, Loader2, Circle, MinusCircle } from 'lucide-react'
import { api, Job, JobStep } from '@/lib/api'

// Pipeline de etapas do run atual (Jobs/Work). Reflete o fluxo rastreado pelo backend:
// recon → enum → vuln → exploit → post → relatório. Atualiza ao vivo via job_update
// (prop `liveJob`); no load, busca o último job do engagement para mostrar o fluxo
// mesmo sem run ativo.
const STATUS_COLOR: Record<JobStep['status'], string> = {
  done:    'var(--low)',
  active:  'var(--purple-light)',
  pending: 'var(--muted)',
  skipped: 'var(--border)',
}

function StepIcon({ status }: { status: JobStep['status'] }) {
  if (status === 'done')    return <Check size={13} color="var(--low)" />
  if (status === 'active')  return <Loader2 size={13} color="var(--purple-light)" style={{ animation: 'spin 1s linear infinite' }} />
  if (status === 'skipped') return <MinusCircle size={12} color="var(--border)" />
  return <Circle size={11} color="var(--muted)" />
}

export function JobPipeline({ engagementId, liveJob }: { engagementId: string; liveJob?: Job | null }) {
  const [fetched, setFetched] = useState<Job | null>(null)

  useEffect(() => {
    let alive = true
    api.engagements.jobs(engagementId).then((list) => { if (alive && list?.length) setFetched(list[0]) }).catch(() => {})
    return () => { alive = false }
  }, [engagementId])

  // O job ao vivo (do WS) sempre vence o buscado.
  const job = liveJob ?? fetched
  if (!job || !job.steps?.length) return null

  // O strip só agrega o que os cards de fase (ExecutionPanel) NÃO mostram: o estado de
  // FILA/RETOMADA (scan agendado esperando o worker, ou run retomado após queda). Durante
  // um run normal ou após terminar, some — a timeline de fases já vive nos cards abaixo.
  if (job.status !== 'queued') return null

  // Aqui status é sempre 'queued'. 'resume' = o backend caiu no meio e o worker vai
  // continuar de onde parou (`claude --resume`); senão é a 1ª execução na fila.
  const attempt     = job.attempts ?? 0
  const maxAttempts = job.maxAttempts ?? 3
  const statusLabel = job.resume ? `retomando · tentativa ${attempt + 1}/${maxAttempts}` : 'na fila'

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--purple)', borderRadius: 10,
      padding: '10px 14px', margin: '0 0 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--purple-light)' }}>
          <Loader2 size={11} color="var(--purple-light)" style={{ animation: 'spin 1s linear infinite' }} />
          Fluxo do run · {statusLabel}
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {job.findingsCount ?? 0} findings{job.spentUsd ? ` · US$ ${job.spentUsd.toFixed(2)}` : ''}
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
        {job.resume
          ? 'Aguardando o worker retomar a execução interrompida…'
          : 'Aguardando o worker iniciar a execução…'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
        {job.steps.map((s, i) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center' }}>
            <div title={s.status} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 9px', borderRadius: 999,
              border: `1px solid ${s.status === 'active' ? 'var(--purple)' : 'var(--border)'}`,
              background: s.status === 'active' ? 'rgba(124,58,237,.12)' : 'transparent',
              opacity: s.status === 'pending' ? 0.55 : 1,
            }}>
              <StepIcon status={s.status} />
              <span style={{ fontSize: 11.5, fontWeight: 600, color: STATUS_COLOR[s.status] }}>{s.label}</span>
            </div>
            {i < job.steps.length - 1 && (
              <div style={{ width: 14, height: 1, background: 'var(--border)', margin: '0 2px' }} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
