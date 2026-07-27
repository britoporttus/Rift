'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, Engagement, Finding, DomainSummary } from '@/lib/api'
import { SEV_COLOR } from '@/lib/severity'
import { engagementMatchesDomain } from '@/lib/domainMatch'
import {
  Plus, ShieldAlert, AlertTriangle, Bug, Globe, CheckCircle2, Clock, ChevronRight, Radar,
} from 'lucide-react'

function rc(level: string) { return SEV_COLOR[level] || SEV_COLOR.info }

// ── KPI card ──────────────────────────────────────────────────────
function KpiCard({ label, value, color, sub, icon }: {
  label: string; value: number; color: string; sub: string; icon: React.ReactNode
}) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '1.3rem 1.4rem', position: 'relative', overflow: 'hidden',
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: color }} />
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color, fontFamily: 'var(--mono)', lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 1 }}>{sub}</div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [findings, setFindings]       = useState<Finding[]>([])
  const [domains, setDomains]         = useState<DomainSummary[]>([])
  const [loading, setLoading]         = useState(true)

  // Carrega engagements + findings + domínios. showSpinner só no 1º load.
  const load = useCallback((showSpinner = false) => {
    if (showSpinner) setLoading(true)
    return Promise.all([api.engagements.list(), api.findings.list(), api.domains.list()])
      .then(([engs, finds, doms]) => { setEngagements(engs); setFindings(finds); setDomains(doms) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load(true)
    // Atualização VIVA: refaz o fetch a cada 10s e ao focar a aba.
    const interval = setInterval(() => { if (!document.hidden) load() }, 10000)
    const onFocus = () => { if (!document.hidden) load() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [load])

  const totalFindings = findings.length
  const criticalCount = findings.filter((f) => f.severity === 'critical').length
  const highCount     = findings.filter((f) => f.severity === 'high').length
  const fixedCount    = findings.filter((f) => f.remediationStatus === 'fixed').length
  const now = Date.now()
  const recentCount7d = findings.filter((f) => f.firstSeen && now - new Date(f.firstSeen).getTime() <= 7 * 86400000).length

  // Domínios em destaque — os de maior risco primeiro (o resumo executivo é
  // sobre "o que precisa de atenção", não uma lista de tudo que existe).
  const topDomains = [...domains].sort((a, b) => b.riskScore - a.riskScore).slice(0, 6)

  // Engagements cujo alvo não bate com nenhum Domínio cadastrado (ASM) — ficam
  // "órfãos" da navegação por domínio. Não escondemos: mostramos à parte, bem
  // menor, pra não voltar a ser a lista genérica que a tela era antes.
  const orphanEngagements = engagements.filter((e) => !domains.some((d) => engagementMatchesDomain(e.target, d.domain)))

  return (
    <div style={{ padding: '2rem 2rem 3rem', display: 'flex', flexDirection: 'column', gap: 30, maxWidth: 1280, margin: '0 auto', width: '100%' }}>

      {/* Page title */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em' }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '3px 0 0' }}>Resumo executivo — o que precisa de atenção agora.</p>
        </div>
        <button
          onClick={() => router.push('/engagement/novo')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
            padding: '0.5rem 1rem', background: 'var(--purple)', border: 'none', borderRadius: 7,
            color: 'white', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 0 18px var(--purple-glow-strong)',
          }}
        >
          <Plus size={14} /> Novo Escopo
        </button>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ height: 90, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, animation: 'pulse 1.4s ease-in-out infinite' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <KpiCard label="Críticos" value={criticalCount} color="var(--critical)" sub="findings críticos" icon={<ShieldAlert size={20} />} />
          <KpiCard label="Altos" value={highCount} color="var(--high)" sub="findings altos" icon={<AlertTriangle size={20} />} />
          <KpiCard label="Total de findings" value={totalFindings} color="var(--info)" sub="em todos os escopos" icon={<Bug size={20} />} />
          <KpiCard label="Corrigidos" value={fixedCount} color="var(--low)" sub={`de ${totalFindings} achados`} icon={<CheckCircle2 size={20} />} />
          <KpiCard label="Novos (7d)" value={recentCount7d} color="var(--purple-light)" sub="últimos 7 dias" icon={<Clock size={20} />} />
        </div>
      )}

      {/* Domínios em destaque — a navegação principal agora é por Domínio; o
          histórico de engagements de cada um vive lá (aba dentro do Domínio),
          não aqui. Aqui só o recorte "que precisa de atenção". */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ height: 64, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, animation: 'pulse 1.4s ease-in-out infinite' }} />
          ))}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Domínios em destaque
            </span>
            <Link href="/dominios" style={{ fontSize: 11.5, color: 'var(--purple-light)', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
              Ver todos <ChevronRight size={13} />
            </Link>
          </div>

          {topDomains.length === 0 ? (
            <div style={{ background: 'var(--surface)', border: '1px dashed var(--border-mid)', borderRadius: 12, padding: '2.5rem', textAlign: 'center', color: 'var(--muted)' }}>
              <div style={{ margin: '0 auto 1rem', display: 'flex', justifyContent: 'center', color: 'var(--text-mute)' }}><Globe size={30} /></div>
              <p style={{ fontSize: 14, margin: 0 }}>Nenhum domínio cadastrado ainda.</p>
              <p style={{ fontSize: 12, margin: '6px 0 0', color: 'var(--text-mute)' }}>Cadastre um em <Link href="/dominios" style={{ color: 'var(--purple-light)' }}>Domínios</Link> para começar o mapeamento de superfície.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
              {topDomains.map((d) => (
                <Link key={d.id} href={`/dominios/${d.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.9rem 1rem', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name || d.domain}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-mute)', fontFamily: 'var(--mono)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.assetCount} ativo(s) · {d.exposureCount} exposição(ões)</div>
                    </div>
                    <div style={{ textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: rc(d.riskLevel), fontFamily: 'var(--mono)', lineHeight: 1 }}>{d.riskScore}</div>
                      <div style={{ fontSize: 7.5, color: 'var(--text-mute)', letterSpacing: '0.08em', marginTop: 2 }}>RISCO</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Engagements sem domínio cadastrado — só aparece se existir, e fica
          pequeno de propósito (não é mais a tela principal de navegação). */}
      {!loading && orphanEngagements.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            Engagements sem domínio vinculado ({orphanEngagements.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {orphanEngagements.map((e) => (
              <Link key={e.id} href={`/engagement/${e.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem 0.8rem', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Radar size={13} color="var(--text-mute)" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-mute)', fontFamily: 'var(--mono)' }}>{e.target}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
