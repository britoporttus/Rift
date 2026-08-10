'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api, DomainSummary, Finding } from '@/lib/api'
import { SEV_COLOR } from '@/lib/severity'
import { clickableDivProps } from '@/lib/a11y'
import { AreaTrend } from '@/components/ui/charts/AreaTrend'
import { findingsPerDay } from '@/lib/trends'
import { Tilt } from '@/components/ui/fx/Tilt'
import { Magnetic } from '@/components/ui/fx/Magnetic'
import {
  Page, PageHeader, Card, Btn, Badge, Kpi, KpiRow, EmptyState, Skeleton,
  SectionTitle, inputStyle, tint, Reveal,
} from '@/components/ui/kit'
import {
  Globe, Plus, ShieldCheck, ShieldAlert, Radar, Loader2,
  AlertTriangle, Lock, Crosshair, FileText, TrendingUp, Trash2, History,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

// Tempo relativo curto (pt-BR) para o painel "o que mudou".
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m}min`
  const h = Math.round(m / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.round(h / 24)
  return `há ${d}d`
}

const STEP_LABEL: Record<string, string> = {
  subdomains: 'subdomínios', dns: 'DNS', http: 'probe web',
  exposures: 'exposições', takeover: 'takeover', ports: 'portas', scoring: 'score', done: 'concluído',
}
const KIND_LABEL: Record<string, string> = { vendor: 'Fornecedor', partner: 'Parceiro', internal: 'Interno', other: 'Outro' }

function riskColor(level: string) { return SEV_COLOR[level] || SEV_COLOR.info }

export default function DominiosPage() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [domains, setDomains] = useState<DomainSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [newDomain, setNewDomain] = useState('')
  const [newKind, setNewKind] = useState('vendor')
  const [creating, setCreating] = useState(false)
  const [scanning, setScanning] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [findings, setFindings] = useState<Finding[]>([])

  const load = useCallback((spin = false) => {
    if (spin) setLoading(true)
    return api.domains.list().then(setDomains).catch(console.error).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load(true)
    const iv = setInterval(() => { if (!document.hidden) load() }, 8000)
    const onFocus = () => { if (!document.hidden) load() }
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(iv); window.removeEventListener('focus', onFocus) }
  }, [load])

  // Findings alimentam a curva "descobertos · 14 dias". Busca única (a tendência
  // não precisa do polling de 8s dos domínios).
  useEffect(() => { api.findings.list().then(setFindings).catch(() => {}) }, [])

  async function handleCreate() {
    const d = newDomain.trim()
    if (!d) return
    setCreating(true)
    try {
      const created = await api.domains.create({ domain: d, kind: newKind })
      setNewDomain('')
      await load()
      router.push(`/dominios/${created.id}`)
    } catch (e) { alert(e instanceof Error ? e.message : 'Erro ao adicionar') } finally { setCreating(false) }
  }

  async function handleScan(id: string, ev: React.MouseEvent) {
    ev.stopPropagation()
    setScanning(id)
    try { await api.domains.scan(id); await load() } catch (e) { alert(e instanceof Error ? e.message : 'Erro') } finally { setScanning(null) }
  }

  // Remover pela LISTA: excluir só existia dentro do domínio, então limpar um
  // cadastro de teste exigia entrar nele primeiro. `stopPropagation` é
  // obrigatório — o cartão inteiro é clicável (clickableDivProps), e sem isso o
  // clique na lixeira navega para o domínio antes de o confirm aparecer.
  async function handleDelete(d: DomainSummary, ev: React.MouseEvent) {
    ev.stopPropagation()
    if (!confirm(`Excluir "${d.name || d.domain}" e os ativos coletados?\n\nAs credenciais em Vazamentos são preservadas.`)) return
    setDeleting(d.id)
    try { await api.domains.delete(d.id); await load() }
    catch (e) { alert(e instanceof Error ? e.message : 'Erro ao excluir') }
    finally { setDeleting(null) }
  }

  const totalLeaks = domains.reduce((a, d) => a + (d.leakCount || 0), 0)
  const atRisk = domains.filter((d) => d.riskLevel === 'critical' || d.riskLevel === 'high').length
  const unauthorizedCount = domains.filter((d) => !d.authorized).length
  const findingsTrend = findingsPerDay(findings, 14)
  // "O que mudou" no lugar do ranking "mais expostos": ranking só informa com
  // volume (com 2 e 1 exposições era decoração), e a pergunta que o
  // monitoramento contínuo deve responder é o que entrou/saiu (Fase 2, item 2.5).
  const recentChanges = domains
    .filter((d) => d.lastDiff?.computedAt &&
      ((d.lastDiff.newHostCount ?? 0) > 0 || (d.lastDiff.missingHostCount ?? 0) > 0 || (d.lastDiff.scoreDelta ?? 0) !== 0))
    .sort((a, b) => new Date(b.lastDiff!.computedAt!).getTime() - new Date(a.lastDiff!.computedAt!).getTime())
    .slice(0, 6)

  return (
    <Page>
      <PageHeader
        icon={<Globe size={19} color="var(--purple-light)" />}
        title="Web / API"
        subtitle="Superfície externa por domínio — subdomínios, portas e exposições. A base do pentest web, com e sem login."
        actions={
          <>
            <Btn href="/reports"><FileText size={14} /> Relatórios</Btn>
            <Magnetic><Btn variant="primary" onClick={() => router.push('/novo-pentest')}><Crosshair size={16} /> Novo Pentest</Btn></Magnetic>
          </>
        }
      />

      {/* KPIs navegáveis: "em risco" leva para os achados que sustentam o número.
          Antes eram só números — o operador via "3 em risco" e não tinha para
          onde clicar. */}
      {/* KPIs: "monitorados" e "em risco" sempre (respondem "onde olhar"); os
          outros dois só quando têm sinal — um "0 vazados / 0 não-autorizados"
          fixo era ruído na home (Fase 4). */}
      {!loading && domains.length > 0 && (
        <Reveal>
          <KpiRow>
            <Kpi label="Domínios monitorados" value={domains.length} color="var(--purple-light)" icon={<Globe size={18} />} countUp />
            <Kpi label="Em risco alto/crítico" value={atRisk} color="var(--high)" icon={<AlertTriangle size={18} />}
              href="/findings?severity=high" hint="ver achados de alta severidade" countUp />
            {unauthorizedCount > 0 && (
              <Kpi label="Não autorizados" value={unauthorizedCount} color="var(--medium)" icon={<Lock size={18} />}
                hint="só coleta passiva" countUp />
            )}
            {totalLeaks > 0 && (
              <Kpi label="Credenciais vazadas" value={totalLeaks} color="var(--critical)" icon={<ShieldAlert size={18} />} countUp />
            )}
          </KpiRow>
        </Reveal>
      )}

      {/* Panorama visual: tendência de descobertas + o que mudou nos últimos
          scans, lado a lado. */}
      {!loading && (findings.length > 0 || recentChanges.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18, alignItems: 'start' }}>
          {findings.length > 0 && (
            <Reveal delay={60}>
              <Card pad="1.25rem 1.4rem">
                <SectionTitle icon={<TrendingUp size={13} />}>Findings descobertos · 14 dias</SectionTitle>
                <div style={{ marginTop: 14 }}>
                  <AreaTrend data={findingsTrend} height={130} valueSuffix=" findings" />
                </div>
              </Card>
            </Reveal>
          )}
          {recentChanges.length > 0 && (
            <Reveal delay={120}>
              <Card pad="1.25rem 1.4rem">
                <SectionTitle icon={<History size={13} />}>O que mudou nos últimos scans</SectionTitle>
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' }}>
                  {recentChanges.map((d, i) => {
                    const nh = d.lastDiff?.newHostCount ?? 0
                    const mh = d.lastDiff?.missingHostCount ?? 0
                    const ds = d.lastDiff?.scoreDelta ?? 0
                    return (
                      <div key={d.id} role="button" tabIndex={0}
                        onClick={() => router.push(`/dominios/${d.id}`)}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && router.push(`/dominios/${d.id}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', cursor: 'pointer',
                          borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                        <span style={{ fontSize: 12.5, color: 'var(--text)', fontFamily: 'var(--mono)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.domain}</span>
                        <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, fontFamily: 'var(--mono)' }}>
                          {nh > 0 && <span style={{ color: 'var(--low)' }}>+{nh} host</span>}
                          {mh > 0 && <span style={{ color: 'var(--high)' }}>−{mh} host</span>}
                          {ds !== 0 && <span style={{ color: ds > 0 ? 'var(--high)' : 'var(--low)' }}>{ds > 0 ? '▲' : '▼'} {Math.abs(ds)}</span>}
                          <span style={{ color: 'var(--text-mute)' }}>{relTime(d.lastDiff!.computedAt!)}</span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </Card>
            </Reveal>
          )}
        </div>
      )}

      <Card pad="0.9rem 1.1rem" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={newDomain} onChange={(e) => setNewDomain(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreate()} placeholder="fornecedor.com"
          aria-label="Domínio a adicionar"
          style={{ ...inputStyle, flex: 1, minWidth: 200, fontFamily: 'var(--mono)' }} />
        <select value={newKind} onChange={(e) => setNewKind(e.target.value)} aria-label="Tipo do domínio" style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="vendor">Fornecedor</option>
          <option value="partner">Parceiro</option>
          <option value="internal">Interno</option>
          <option value="other">Outro</option>
        </select>
        <Btn variant="primary" onClick={handleCreate} disabled={creating || !newDomain.trim()}>
          {creating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Adicionar
        </Btn>
      </Card>

      {loading ? (
        <Skeleton h={196} />
      ) : domains.length === 0 ? (
        <EmptyState
          icon={<Radar size={34} />}
          title="Nenhum domínio ainda."
          hint="Adicione um domínio acima para mapear a superfície externa dele. A coleta inicial é passiva — nada é sondado ativamente antes de você autorizar."
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {domains.map((d, i) => {
            const isH = hovered === d.id
            const rc = riskColor(d.riskLevel)
            const isScanning = d.scanState === 'scanning'
            return (
              <Reveal key={d.id} delay={Math.min(i, 8) * 45} style={{ height: '100%' }}>
              <Tilt>
              <div {...clickableDivProps(() => router.push(`/dominios/${d.id}`))}
                onMouseEnter={() => setHovered(d.id)} onMouseLeave={() => setHovered(null)}
                style={{ background: 'var(--surface)', border: `1px solid ${isH ? 'var(--border-mid)' : 'var(--border)'}`, borderRadius: 12, padding: '1.25rem', cursor: 'pointer', transition: 'all 0.13s', boxShadow: isH ? '0 6px 24px rgba(124,58,237,0.14)' : 'none', height: '100%', position: 'relative', overflow: isScanning ? 'hidden' : undefined }}>
                {isScanning && <div className="rk-scanline" aria-hidden />}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name || d.domain}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-mute)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.domain}</div>
                  </div>
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: 26, fontWeight: 700, color: rc, fontFamily: 'var(--mono)', lineHeight: 1 }}>{d.riskScore}</div>
                    <div style={{ fontSize: 8, color: 'var(--text-mute)', letterSpacing: '0.1em', marginTop: 2 }}>EXPOSIÇÃO</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  <Badge color="var(--purple-light)">{KIND_LABEL[d.kind] || d.kind}</Badge>
                  {d.authorized
                    ? <Badge color="var(--low)" icon={<ShieldCheck size={9} />}>autorizado</Badge>
                    : <Badge color="var(--text-mute)" icon={<Lock size={9} />}>passivo</Badge>}
                  {d.leakCount > 0 && <Badge color="var(--critical)" icon={<ShieldAlert size={9} />}>{d.leakCount} vazado(s)</Badge>}
                </div>

                {/* Fase 4: os 3 números grandes saíram — repetiam o que a faixa de
                    severidade já diz. Fica a faixa (o que importa) + uma linha de
                    escala discreta. O detalhe por número vive dentro do domínio. */}
                <SevStrip counts={d.severityCounts} />

                <div style={{ fontSize: 10.5, color: 'var(--text-mute)', fontFamily: 'var(--mono)', marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span>{d.subdomainCount ?? d.assetCount} subdomínio(s)</span>
                  <span style={{ color: 'var(--text-dim)' }}>·</span>
                  <span>{d.portCount ?? 0} porta(s)</span>
                  {(d.lastDiff?.newHostCount ?? 0) > 0 && (
                    <><span style={{ color: 'var(--text-dim)' }}>·</span><span style={{ color: 'var(--low)' }}>+{d.lastDiff!.newHostCount} novo(s)</span></>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 10.5, color: 'var(--text-mute)', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    {isScanning ? (
                      <><Loader2 size={12} className="spin" color="var(--purple-light)" /><span style={{ color: 'var(--purple-light)' }}>escaneando: {STEP_LABEL[d.scanStep || ''] || d.scanStep}</span></>
                    ) : d.scanState === 'failed' ? (
                      <span style={{ color: 'var(--high)' }}>falhou</span>
                    ) : d.lastScanAt ? (
                      <span>último: {new Date(d.lastScanAt).toLocaleDateString('pt-BR')}</span>
                    ) : (
                      <span>nunca escaneado</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <button onClick={(ev) => handleScan(d.id, ev)} disabled={isScanning || scanning === d.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 11px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: isScanning ? 'default' : 'pointer', fontFamily: 'inherit', background: tint('var(--purple)', 14), border: '1px solid var(--border-mid)', color: 'var(--purple-light)', opacity: isScanning ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                      {isScanning || scanning === d.id ? <Loader2 size={12} className="spin" /> : <Radar size={12} />} Escanear
                    </button>
                    {isAdmin && (
                      <button onClick={(ev) => handleDelete(d, ev)} disabled={deleting === d.id}
                        title={`Excluir ${d.domain}`} aria-label={`Excluir ${d.domain}`}
                        style={{ display: 'flex', alignItems: 'center', padding: '5px 7px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-dim)', opacity: deleting === d.id ? 0.5 : 1 }}>
                        {deleting === d.id ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              </Tilt>
              </Reveal>
            )
          })}
        </div>
      )}

      <style jsx global>{`.spin { animation: spin 0.9s linear infinite; }`}</style>
    </Page>
  )
}

// Resumo de findings por severidade (exposições) — strip compacto na home. Só mostra
// as classes com contagem > 0; se não há nenhuma, uma linha discreta de "sem exposições".
const SEV_ROW: Array<'critical' | 'high' | 'medium' | 'low'> = ['critical', 'high', 'medium', 'low']
// Palavra por extenso — o operador não decodifica C/A/M/B de cabeça (Fase 2, A).
const SEV_WORD: Record<string, string> = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa' }
function SevStrip({ counts }: { counts?: Partial<Record<string, number>> }) {
  const active = SEV_ROW.filter((s) => (counts?.[s] || 0) > 0)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, minHeight: 20, flexWrap: 'wrap' }}>
      {active.length === 0 ? (
        <span style={{ fontSize: 10, color: 'var(--text-mute)', fontStyle: 'italic' }}>sem exposições classificadas</span>
      ) : active.map((s) => {
        const c = SEV_COLOR[s] || SEV_COLOR.info
        return (
          <span key={s} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600,
            borderRadius: 6, padding: '2px 8px', color: c,
            background: `color-mix(in srgb, ${c} 13%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 32%, transparent)`,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />{SEV_WORD[s]}
            <b style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{counts?.[s]}</b>
          </span>
        )
      })}
    </div>
  )
}

