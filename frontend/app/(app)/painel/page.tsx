'use client'
// Visão GESTOR (Fase 6) — "o que está sendo corrigido?". Métricas de correção no
// topo + fila acionável embaixo (estourado primeiro). Lê /api/overview/gestor.
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api, GestorOverview } from '@/lib/api'
import { SEV_COLOR } from '@/lib/severity'
import { Page, PageHeader, Card, Btn, Kpi, KpiRow, SectionTitle, Skeleton, EmptyState, Reveal, tint } from '@/components/ui/kit'
import { ClipboardList, Clock, AlertTriangle, CheckCircle2, TimerReset, User as UserIcon, Globe, KanbanSquare } from 'lucide-react'

const SEV_ROW = ['critical', 'high', 'medium', 'low'] as const
const SEV_WORD: Record<string, string> = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa', info: 'Info' }
const REM_LABEL: Record<string, string> = { open: 'Aberto', in_progress: 'Em correção', regressed: 'Regrediu', fixed: 'Corrigido', accepted_risk: 'Risco aceito' }
const REM_COLOR: Record<string, string> = { open: 'var(--high)', in_progress: 'var(--purple-light)', regressed: 'var(--critical)', fixed: 'var(--low)', accepted_risk: 'var(--muted)' }

function relDue(iso: string): { text: string; overdue: boolean } {
  const diff = new Date(iso).getTime() - Date.now()
  const d = Math.round(diff / 86400000)
  if (d < 0) return { text: `${-d}d atrasado`, overdue: true }
  if (d === 0) return { text: 'vence hoje', overdue: false }
  return { text: `${d}d restante(s)`, overdue: false }
}

export default function PainelGestorPage() {
  const router = useRouter()
  const [data, setData] = useState<GestorOverview | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    api.overview.gestor().then(setData).catch(console.error).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const m = data?.metrics

  return (
    <Page>
      <PageHeader
        icon={<ClipboardList size={19} color="var(--purple-light)" />}
        title="Painel de correções"
        subtitle="O andamento das correções: o que está aberto, em correção, e o que já estourou o prazo."
        actions={<Btn href="/correcoes"><KanbanSquare size={14} /> Abrir quadro</Btn>}
      />

      {loading ? (
        <Skeleton h={120} />
      ) : !m ? (
        <EmptyState icon={<ClipboardList size={34} />} title="Sem dados de correção ainda." hint="Assim que houver achados acionáveis, o andamento aparece aqui." />
      ) : (
        <>
          {/* Métricas de correção */}
          <Reveal>
            <KpiRow>
              <Kpi label="Abertos" value={m.open} color="var(--high)" icon={<ClipboardList size={18} />} countUp />
              <Kpi label="Em correção" value={m.inProgress} color="var(--purple-light)" icon={<TimerReset size={18} />} countUp />
              <Kpi label="Prazo estourado" value={m.overdue} color="var(--critical)" icon={<AlertTriangle size={18} />}
                hint={m.overdue > 0 ? 'requer atenção' : 'nenhum'} countUp />
              <Kpi label="Tempo médio de correção" value={m.avgFixDays != null ? `${m.avgFixDays}d` : '—'} color="var(--low)" icon={<CheckCircle2 size={18} />} />
              <Kpi label="Dentro do prazo" value={m.onTimePct != null ? `${m.onTimePct}%` : '—'} color="var(--info)" icon={<Clock size={18} />} />
            </KpiRow>
          </Reveal>

          {/* Backlog por severidade */}
          <Reveal delay={60}>
            <Card pad="1.1rem 1.3rem">
              <SectionTitle icon={<AlertTriangle size={13} />}>Backlog aberto por severidade</SectionTitle>
              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                {SEV_ROW.map((s) => {
                  const c = SEV_COLOR[s]
                  const n = m.backlogBySev?.[s] ?? 0
                  return (
                    <div key={s} style={{ flex: '1 1 120px', minWidth: 110, background: 'var(--bg)', border: `1px solid ${tint(c, 30)}`, borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: c, fontFamily: 'var(--mono)' }}>{n}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{SEV_WORD[s]}</div>
                    </div>
                  )
                })}
              </div>
            </Card>
          </Reveal>

          {/* Fila acionável */}
          <Reveal delay={120}>
            <Card pad="1.1rem 1.3rem">
              <SectionTitle icon={<ClipboardList size={13} />}>Fila de correção · {data.queue.length}</SectionTitle>
              {data.queue.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={16} color="var(--low)" /> Nada em aberto — tudo corrigido ou aceito.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
                  {data.queue.map((f, i) => {
                    const c = SEV_COLOR[f.severity]
                    const due = f.dueDate ? relDue(f.dueDate) : null
                    return (
                      <div key={f.id} role="button" tabIndex={0}
                        onClick={() => router.push(f.engagementId ? `/engagement/${f.engagementId}?tab=findings` : '/findings')}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && router.push(f.engagementId ? `/engagement/${f.engagementId}?tab=findings` : '/findings')}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', cursor: 'pointer',
                          borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                        <span title={SEV_WORD[f.severity]} style={{ width: 3, alignSelf: 'stretch', background: c, borderRadius: 2, flexShrink: 0 }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13.5, color: 'var(--text)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.title}</div>
                          {/* ONDE: alvo (domínio) + localização (endpoint). Era a informação
                              que faltava — o gestor não sabia de qual domínio era o achado. */}
                          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 3, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ color: c, fontWeight: 600 }}>{SEV_WORD[f.severity]}</span>
                            {f.target && <><span style={{ color: 'var(--text-dim)' }}>·</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--purple-light)' }}><Globe size={10} />{f.target}</span></>}
                            {f.location && <><span style={{ color: 'var(--text-dim)' }}>·</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.location}</span></>}
                            {f.owner && <><span style={{ color: 'var(--text-dim)' }}>·</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><UserIcon size={10} />{f.owner}</span></>}
                          </div>
                        </div>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, color: REM_COLOR[f.remediationStatus], background: tint(REM_COLOR[f.remediationStatus], 12), border: `1px solid ${tint(REM_COLOR[f.remediationStatus], 30)}`, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {REM_LABEL[f.remediationStatus]}
                        </span>
                        {due && (
                          <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: due.overdue ? 'var(--critical)' : 'var(--text-mute)', whiteSpace: 'nowrap', flexShrink: 0, minWidth: 92, textAlign: 'right' }}>
                            {due.text}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </Reveal>
        </>
      )}
    </Page>
  )
}
