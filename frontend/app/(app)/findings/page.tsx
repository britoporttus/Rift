'use client'
import { useState, useEffect, useMemo, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { api, Finding, Engagement, RemediationStatus, DomainSummary } from '@/lib/api'
// P1-27 (auditoria 2026-07-20): cor local divergia da fonte única (high
// #F59E0B aqui vs #F97316 em lib/severity.ts) — um finding "high" aparecia com
// cor diferente aqui do que em Dashboard/Domínios/Vazamentos/Mapa/FindingsReport.
import { SEV_COLOR, SEV_ORDER as SEVERITIES } from '@/lib/severity'
import { clickableDivProps } from '@/lib/a11y'
import { findingType } from '@/lib/findingClassify'
import { engagementMatchesDomain } from '@/lib/domainMatch'
import { Donut } from '@/components/ui/charts/Donut'
import { VulnEducation } from '@/components/findings/VulnEducation'
import { AreaTrend } from '@/components/ui/charts/AreaTrend'
import { findingsPerDay } from '@/lib/trends'
import {
  Page, PageHeader, Card, Btn, Chip, EmptyState, Kpi, KpiRow, tint, SectionTitle, Reveal,
} from '@/components/ui/kit'
import {
  AlertTriangle, Download, ChevronDown, ChevronRight, Globe, Target,
  SlidersHorizontal, X, ShieldCheck, Activity, TrendingUp,
} from 'lucide-react'

const TYPE_LABEL: Record<string, string> = { vulnerability: 'Vulnerabilidade', weakness: 'Fraqueza', observation: 'Observação' }
const TYPE_COLOR: Record<string, string> = { vulnerability: 'var(--critical)', weakness: 'var(--high)', observation: 'var(--info)' }
const TYPES = ['vulnerability', 'weakness', 'observation'] as const

const REM_LABEL: Record<string, string> = { open: 'Aberto', fixed: 'Corrigido', accepted_risk: 'Risco aceito', regressed: 'Regrediu' }
const REM_COLOR: Record<string, string> = { open: 'var(--high)', fixed: 'var(--low)', accepted_risk: 'var(--muted)', regressed: 'var(--critical)' }
const REM_STATUSES = ['open', 'fixed', 'accepted_risk', 'regressed'] as const

function exportCSV(findings: Finding[]) {
  const header = ['id', 'title', 'severity', 'cvss', 'engagement', 'description']
  const rows = findings.map((f) => [
    f.id, f.title, f.severity, f.cvss ?? '', f.engagement_name ?? '', (f.description ?? '').replace(/\n/g, ' '),
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
  const csv = [header.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'findings.csv'; a.click()
  URL.revokeObjectURL(url)
}

/** Pílula de filtro — um só componente para as três dimensões (antes eram três
 *  blocos de estilo inline quase idênticos, um por fileira). */
function FilterPill({ active, color, count, label, onClick }: {
  active: boolean; color: string; count: number; label: string; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{
      padding: '0.3rem 0.8rem', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
      display: 'flex', alignItems: 'center', gap: 5, fontWeight: active ? 700 : 400,
      background: active ? tint(color, 14) : 'var(--surface)',
      border: `1px solid ${active ? color : 'var(--border)'}`,
      color: active ? color : 'var(--muted)', transition: 'all 0.12s',
    }}>
      <span style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>{count}</span>
      <span style={{ opacity: active ? 1 : 0.85 }}>{label}</span>
    </button>
  )
}

export default function FindingsPage() {
  // Suspense: a view lê ?engagement=/?domain= via useSearchParams.
  return (
    <Suspense fallback={<Page><div style={{ color: 'var(--text-mute)', fontSize: 12, letterSpacing: '0.1em' }}>CARREGANDO…</div></Page>}>
      <FindingsView />
    </Suspense>
  )
}

function FindingsView() {
  const params = useSearchParams()
  // Escopo vindo por deep link. Antes esta tela só existia como lista global:
  // não havia como chegar nela a partir de um domínio ou engagement, então o
  // operador via 200 findings de todos os alvos e filtrava na unha.
  const scopeEngagement = params.get('engagement') || ''
  const scopeDomainId   = params.get('domain') || ''
  const initialSeverity = params.get('severity') || ''

  const [findings, setFindings]       = useState<Finding[]>([])
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [domains, setDomains]         = useState<DomainSummary[]>([])
  const [loading, setLoading]         = useState(true)
  const [sevFilter, setSevFilter]     = useState(initialSeverity)
  const [engFilter, setEngFilter]     = useState('')
  const [typeFilter, setTypeFilter]   = useState('')
  const [remFilter, setRemFilter]     = useState('')
  const [showMore, setShowMore]       = useState(false)
  const [expanded, setExpanded]       = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.findings.list(), api.engagements.list(), api.domains.list().catch(() => [])])
      .then(([f, e, d]) => { setFindings(f); setEngagements(e); setDomains(d) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const scopeDomain = domains.find((d) => d.id === scopeDomainId) || null

  // Escopo de domínio → conjunto de engagements cujo alvo casa com o domínio
  // (mesmo critério de sufixo do grafo de superfície, sem campo novo no banco).
  const scopedEngagementIds = useMemo(() => {
    if (!scopeDomain) return null
    return new Set(engagements.filter((e) => engagementMatchesDomain(e.target, scopeDomain.domain)).map((e) => e.id))
  }, [scopeDomain, engagements])

  // Universo da tela: já recortado pelo deep link. Todos os contadores/gráficos
  // abaixo refletem o escopo, não o total global — senão o donut mentiria.
  const inScope = useMemo(() => findings.filter((f) => {
    if (scopeEngagement && f.engagement_id !== scopeEngagement) return false
    if (scopedEngagementIds && !scopedEngagementIds.has(f.engagement_id)) return false
    return true
  }), [findings, scopeEngagement, scopedEngagementIds])

  const filtered = inScope.filter((f) => {
    if (sevFilter && f.severity !== sevFilter) return false
    if (engFilter && f.engagement_id !== engFilter) return false
    if (typeFilter && findingType(f) !== typeFilter) return false
    if (remFilter && (f.remediationStatus ?? 'open') !== remFilter) return false
    return true
  })

  const scopedEngagement = engagements.find((e) => e.id === scopeEngagement) || null
  const engCount = new Set(inScope.map((f) => f.engagement_id)).size
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, inScope.filter((f) => f.severity === s).length]))
  const typeCounts = Object.fromEntries(TYPES.map((t) => [t, inScope.filter((f) => findingType(f) === t).length]))
  const remCounts = Object.fromEntries(REM_STATUSES.map((s) => [s, inScope.filter((f) => (f.remediationStatus ?? 'open') === s).length]))

  // Leitura de alto nível: o que exige ação agora vs o que já foi resolvido.
  const actionable = inScope.filter((f) => (f.remediationStatus ?? 'open') !== 'fixed' && (f.severity === 'critical' || f.severity === 'high')).length
  const fixedCount = remCounts.fixed || 0
  const secondaryActive = !!(typeFilter || remFilter || engFilter)

  return (
    <Page>
      <PageHeader
        icon={<AlertTriangle size={19} color="var(--purple-light)" />}
        title="Findings"
        subtitle={
          scopeDomain ? <>Achados correlacionados a <strong style={{ color: 'var(--text)' }}>{scopeDomain.domain}</strong>.</>
            : scopedEngagement ? <>Achados do engagement <strong style={{ color: 'var(--text)' }}>{scopedEngagement.name}</strong>.</>
            : 'Banco global de achados — todos os engagements, filtrável por severidade, tipo e estado de remediação.'
        }
        eyebrow={
          scopeDomain ? { href: `/dominios/${scopeDomain.id}`, label: scopeDomain.domain }
            : scopedEngagement ? { href: `/engagement/${scopedEngagement.id}`, label: scopedEngagement.name }
            : undefined
        }
        actions={
          <Btn variant="primary" onClick={() => exportCSV(filtered)}>
            <Download size={14} /> Exportar CSV
          </Btn>
        }
      />

      {/* Faixa de escopo — deixa explícito que a lista está recortada e dá a
          saída de volta para a visão global (senão o operador acha que sumiram
          findings). */}
      {(scopeDomain || scopedEngagement) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          background: tint('var(--purple)', 8), border: '1px solid var(--border-mid)',
          borderRadius: 10, padding: '0.6rem 0.95rem', fontSize: 12, color: 'var(--purple-light)',
        }}>
          {scopeDomain ? <Globe size={14} /> : <Target size={14} />}
          <span>
            Escopo: <strong>{scopeDomain ? scopeDomain.domain : scopedEngagement?.name}</strong>
            {' · '}{inScope.length} de {findings.length} achados
          </span>
          <Link href="/findings" style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11.5, color: 'var(--muted)', textDecoration: 'none',
          }}>
            <X size={12} /> ver todos
          </Link>
        </div>
      )}

      {!loading && inScope.length > 0 && (
        <>
          <Reveal>
            <KpiRow>
              <Kpi label="Exigem ação" value={actionable} color="var(--critical)" icon={<AlertTriangle size={18} />}
                hint="críticos e altos ainda abertos" countUp />
              <Kpi label="Total de achados" value={inScope.length} color="var(--purple-light)" icon={<Activity size={18} />}
                hint={`${engCount} ${engCount === 1 ? 'engagement' : 'engagements'}`} countUp />
              <Kpi label="Corrigidos" value={fixedCount} color="var(--low)" icon={<ShieldCheck size={18} />}
                hint="confirmados pelo re-teste" countUp />
            </KpiRow>
          </Reveal>

          <Reveal delay={60}>
            <Card pad="1.25rem 1.4rem">
              <SectionTitle icon={<TrendingUp size={13} />}>Findings descobertos · 14 dias</SectionTitle>
              <div style={{ marginTop: 14 }}>
                <AreaTrend data={findingsPerDay(inScope, 14)} height={130} valueSuffix=" findings" />
              </div>
            </Card>
          </Reveal>

          {/* Panorama: distribuição + composição por tipo, lado a lado */}
          <Reveal delay={120}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'stretch' }}>
            <Card pad="16px 22px" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)' }}>Distribuição</div>
              <Donut
                data={SEVERITIES.map((s) => ({ key: s, label: s, value: counts[s], color: SEV_COLOR[s] }))}
                total={inScope.length} caption="findings" size={128} thickness={16}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {SEVERITIES.filter((s) => counts[s] > 0).map((s) => (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLOR[s], flexShrink: 0 }} />
                    <span style={{ color: SEV_COLOR[s], textTransform: 'capitalize', minWidth: 55 }}>{s}</span>
                    <span style={{ color: 'var(--muted)' }}>{counts[s]}</span>
                  </div>
                ))}
              </div>
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              {TYPES.map((t) => {
                const c = TYPE_COLOR[t]
                const active = typeFilter === t
                return (
                  <div key={t}
                    {...clickableDivProps(() => setTypeFilter(active ? '' : t))}
                    style={{
                      background: 'var(--surface)', border: `1px solid ${active ? c : tint(c, 20)}`,
                      borderLeft: `4px solid ${c}`, borderRadius: 12, padding: '14px 16px',
                      display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
                    }}>
                    <div style={{ fontSize: 32, fontWeight: 700, color: c, lineHeight: 1, flexShrink: 0, fontFamily: 'var(--mono)' }}>{typeCounts[t]}</div>
                    <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text)' }}>{TYPE_LABEL[t]}</div>
                  </div>
                )
              })}
            </div>
          </div>
          </Reveal>
        </>
      )}

      {/* Filtros: severidade em primeiro plano (é como o operador pensa);
          tipo/remediação/engagement atrás de um clique. Antes eram três
          fileiras de pílulas empilhadas ocupando meia tela antes da lista. */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        <FilterPill active={sevFilter === ''} color="var(--purple-light)" count={inScope.length} label="Todos" onClick={() => setSevFilter('')} />
        {SEVERITIES.map((sev) => (
          <FilterPill key={sev} active={sevFilter === sev} color={SEV_COLOR[sev]} count={counts[sev]} label={sev}
            onClick={() => setSevFilter(sevFilter === sev ? '' : sev)} />
        ))}
        <button onClick={() => setShowMore((v) => !v)} style={{
          marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '0.3rem 0.8rem', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
          background: secondaryActive ? tint('var(--purple)', 14) : 'var(--surface)',
          border: `1px solid ${secondaryActive ? 'var(--border-hi)' : 'var(--border)'}`,
          color: secondaryActive ? 'var(--purple-light)' : 'var(--muted)',
        }}>
          <SlidersHorizontal size={12} /> Mais filtros{secondaryActive ? ' ·' : ''}
          {showMore ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      </div>

      {showMore && (
        <Card pad="0.9rem 1.1rem" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.08em', minWidth: 78 }}>Tipo</span>
            {TYPES.map((t) => (
              <FilterPill key={t} active={typeFilter === t} color={TYPE_COLOR[t]} count={typeCounts[t]} label={TYPE_LABEL[t]}
                onClick={() => setTypeFilter(typeFilter === t ? '' : t)} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.08em', minWidth: 78 }}>Remediação</span>
            {REM_STATUSES.map((s) => (
              <FilterPill key={s} active={remFilter === s} color={REM_COLOR[s]} count={remCounts[s]} label={REM_LABEL[s]}
                onClick={() => setRemFilter(remFilter === s ? '' : s)} />
            ))}
          </div>
          {!scopeEngagement && (
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.08em', minWidth: 78 }}>Engagement</span>
              <select value={engFilter} onChange={(e) => setEngFilter(e.target.value)} style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 99,
                color: 'var(--muted)', fontSize: 11, padding: '0.3rem 0.8rem', outline: 'none',
                fontFamily: 'inherit', cursor: 'pointer',
              }}>
                <option value="">Todos engagements</option>
                {engagements.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}
        </Card>
      )}

      {/* Lista */}
      {loading ? (
        <div style={{ color: 'var(--text-mute)', textAlign: 'center', padding: '3rem', fontSize: 12, letterSpacing: '0.1em' }}>CARREGANDO...</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={32} />}
          title={inScope.length === 0 ? 'Nenhum achado registrado neste escopo.' : 'Nenhum finding com os filtros atuais.'}
          hint={inScope.length === 0
            ? 'Rode um scan de superfície ou um pentest para popular esta lista.'
            : 'Ajuste ou limpe os filtros acima.'}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((f, i) => {
            const color = SEV_COLOR[f.severity] ?? 'var(--muted)'
            const isExpanded = expanded === f.id
            const rs: RemediationStatus = f.remediationStatus ?? 'open'
            return (
              <div key={`${f.engagement_id}-${f.id}`}
                {...clickableDivProps(() => setExpanded(isExpanded ? null : f.id))}
                style={{
                  background: 'var(--surface)',
                  border: `1px solid ${isExpanded ? 'var(--border-mid)' : 'var(--border)'}`,
                  borderLeft: `3px solid ${color}`,
                  borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                  transition: 'border-color 0.12s', animation: `fadeIn 0.18s ease ${Math.min(i, 12) * 0.03}s both`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', padding: '0.8rem 1rem', gap: 10 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', padding: '2px 7px', borderRadius: 3, flexShrink: 0,
                    textTransform: 'uppercase', background: tint(color, 14), border: `1px solid ${tint(color, 40)}`, color,
                  }}>
                    {f.severity}
                  </span>

                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.title}
                  </span>

                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, flexShrink: 0, whiteSpace: 'nowrap',
                    background: tint(REM_COLOR[rs], 14), color: REM_COLOR[rs],
                  }}>
                    {REM_LABEL[rs]}
                  </span>

                  {f.cvss && <Chip title="CVSS">CVSS {f.cvss}</Chip>}

                  {/* O nome do engagement vira link — antes era texto morto, e
                      era a única pista de onde o achado veio. */}
                  {f.engagement_name && f.engagement_id && (
                    <Link href={`/engagement/${f.engagement_id}`} onClick={(e) => e.stopPropagation()}
                      title={`Abrir ${f.engagement_name}`}
                      style={{
                        fontSize: 10.5, color: 'var(--text-mute)', whiteSpace: 'nowrap', maxWidth: 140,
                        overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: 'none', flexShrink: 0,
                      }}>
                      {f.engagement_name}
                    </Link>
                  )}
                  {f.description
                    ? (isExpanded ? <ChevronDown size={12} color="var(--text-mute)" /> : <ChevronRight size={12} color="var(--text-mute)" />)
                    : null}
                </div>

                {isExpanded && f.description && (
                  <div style={{ padding: '0 1rem 0.9rem', borderTop: '1px solid var(--border)' }}>
                    {f.discoveredBy && (
                      <div style={{ fontSize: 10.5, color: 'var(--purple-light)', fontFamily: 'var(--mono)', paddingTop: '0.6rem' }}>
                        via {f.discoveredBy}
                      </div>
                    )}
                    <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.8, paddingTop: '0.6rem', whiteSpace: 'pre-wrap' }}>
                      {f.description}
                    </p>
                    <VulnEducation finding={f} />
                    {f.evidence && (
                      <pre style={{
                        marginTop: 8, background: 'var(--bg)', borderRadius: 5,
                        padding: '0.5rem 0.75rem', fontSize: 11, color: 'var(--muted)', overflowX: 'auto',
                        border: '1px solid var(--border)', fontFamily: 'var(--mono)',
                      }}>
                        {f.evidence}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Page>
  )
}
