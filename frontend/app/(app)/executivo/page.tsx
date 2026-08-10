'use client'
// Visão DIRETORIA (Fase 6) — "meu ambiente está seguro?". Uma tela: veredito +
// índice de exposição + tendência + 3 KPIs. Sem lista. Lê /api/overview/diretor.
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api, DiretorOverview } from '@/lib/api'
import { SEV_COLOR } from '@/lib/severity'
import { Page, PageHeader, Card, SectionTitle, Reveal, Skeleton, tint } from '@/components/ui/kit'
import { ScoreSlider } from '@/components/ui/charts/ScoreSlider'
import { AreaTrend } from '@/components/ui/charts/AreaTrend'
import { ShieldCheck, AlertTriangle, TimerReset, Clock, TrendingUp, ChevronRight } from 'lucide-react'

const LEVEL_LABEL: Record<string, string> = { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo', info: 'Seguro' }

const LEVEL_WORD: Record<string, string> = { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo', info: 'Seguro' }

export default function ExecutivoPage() {
  const router = useRouter()
  const [data, setData] = useState<DiretorOverview | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    api.overview.diretor().then(setData).catch(console.error).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const p = data?.posture
  const level = p?.level || 'info'
  const c = SEV_COLOR[level] || SEV_COLOR.info
  const trend = (data?.trend || []).map((t) => ({ label: t.date, value: t.score }))

  return (
    <Page max={1040}>
      <PageHeader
        icon={<ShieldCheck size={19} color="var(--purple-light)" />}
        title="Panorama executivo"
        subtitle="A leitura de uma linha: quão exposto está o ambiente, para onde a curva aponta, e o que exige decisão."
      />

      {loading ? (
        <Skeleton h={200} count={2} />
      ) : !p ? (
        <Card><div style={{ color: 'var(--muted)', fontSize: 13 }}>Sem dados suficientes ainda.</div></Card>
      ) : (
        <>
          {/* Veredito — a resposta à pergunta, em destaque */}
          <Reveal>
            <Card pad="1.6rem 1.8rem" style={{ borderColor: tint(c, 30) }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: c }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: c, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Exposição {LEVEL_LABEL[level]}
                </span>
              </div>
              <div style={{ fontSize: 'clamp(20px, 2.6vw, 27px)', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 20, textWrap: 'balance' as const }}>
                {p.verdict}
              </div>
              <ScoreSlider value={p.score} max={100} label={`Índice de exposição · ${LEVEL_LABEL[level]}`} color={c} />
              {p.worstDomain && (
                <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 14 }}>
                  Elo mais fraco:{' '}
                  {p.worstDomainId ? (
                    <button onClick={() => router.push(`/dominios/${p.worstDomainId}`)}
                      style={{ fontFamily: 'var(--mono)', color: 'var(--purple-light)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>
                      {p.worstDomain}
                    </button>
                  ) : <span style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{p.worstDomain}</span>}
                  {' · '}{data!.domainCount} domínio(s) monitorado(s)
                </div>
              )}
            </Card>
          </Reveal>

          {/* Onde o risco está — resposta explícita ao "de qual domínio é isso?".
              Não é lista operacional; são os domínios, navegáveis. */}
          {data!.hotspots.length > 0 && (
            <Reveal delay={40}>
              <Card pad="1.1rem 1.3rem">
                <SectionTitle icon={<AlertTriangle size={13} />}>Onde o risco está</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
                  {data!.hotspots.map((h, i) => {
                    const hc = SEV_COLOR[h.level] || SEV_COLOR.info
                    return (
                      <button key={h.id} onClick={() => router.push(`/dominios/${h.id}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', cursor: 'pointer', background: 'none', border: 'none',
                          borderTop: i === 0 ? 'none' : '1px solid var(--border)', textAlign: 'left', fontFamily: 'inherit', width: '100%' }}>
                        <span style={{ width: 3, alignSelf: 'stretch', minHeight: 24, background: hc, borderRadius: 2, flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.domain}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: hc, whiteSpace: 'nowrap' }}>{LEVEL_WORD[h.level]}</span>
                        <span style={{ fontSize: 18, fontWeight: 700, color: hc, fontFamily: 'var(--mono)', minWidth: 34, textAlign: 'right' }}>{h.score}</span>
                        <ChevronRight size={14} style={{ color: 'var(--text-mute)', flexShrink: 0 }} />
                      </button>
                    )
                  })}
                </div>
              </Card>
            </Reveal>
          )}

          {/* Tendência da postura */}
          {trend.length >= 2 && (
            <Reveal delay={60}>
              <Card pad="1.25rem 1.4rem">
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TrendingUp size={13} /> Exposição ao longo do tempo · 30 dias
                </div>
                <div style={{ marginTop: 14 }}>
                  <AreaTrend data={trend} color={c} height={140} valueSuffix=" pts" />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8 }}>
                  Menor é melhor — a curva é o pior índice entre os domínios a cada dia.
                </div>
              </Card>
            </Reveal>
          )}

          {/* 3 KPIs de decisão */}
          <Reveal delay={120}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              <BigKpi icon={<AlertTriangle size={20} />} value={data!.kpis.criticalsOpen} label="Críticos em aberto" color="var(--critical)" />
              <BigKpi icon={<TimerReset size={20} />} value={data!.kpis.inProgress} label="Em correção" color="var(--purple-light)" />
              <BigKpi icon={<Clock size={20} />} value={data!.kpis.overdue} label="Prazo estourado" color="var(--high)" />
            </div>
          </Reveal>
        </>
      )}
    </Page>
  )
}

function BigKpi({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color: string }) {
  return (
    <Card pad="1.3rem 1.4rem" style={{ overflow: 'hidden', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: color }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 11, flexShrink: 0, display: 'grid', placeItems: 'center', color, background: tint(color, 14), border: `1px solid ${tint(color, 35)}` }}>{icon}</div>
        <div>
          <div style={{ fontSize: 30, fontWeight: 700, color, fontFamily: 'var(--mono)', lineHeight: 1 }}>{value}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 5, fontWeight: 600 }}>{label}</div>
        </div>
      </div>
    </Card>
  )
}
