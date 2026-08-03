'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, DomainDetail, DomainAsset, Engagement, GraphResponse } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { SEV_COLOR, SEV_ORDER } from '@/lib/severity'
import { ScoreSlider } from '@/components/ui/charts/ScoreSlider'
import { Donut } from '@/components/ui/charts/Donut'
import { AreaTrend, AreaPoint } from '@/components/ui/charts/AreaTrend'
import { Beacon } from '@/components/ui/fx/Beacon'
import { ScanSweep } from '@/components/ui/fx/ScanSweep'
import { Magnetic } from '@/components/ui/fx/Magnetic'
import { GradientBorder } from '@/components/ui/fx/GradientBorder'
import { engagementMatchesDomain } from '@/lib/domainMatch'
import { VerificationCard } from '@/components/dominios/VerificationCard'
import type { DomainScanRecord } from '@/lib/api'
import {
  Page, PageHeader, Card, Collapsible, Btn, Chip, Badge, EmptyState, tint, R,
} from '@/components/ui/kit'
import {
  Globe, Radar, Loader2, ShieldCheck, ShieldAlert, Lock,
  AlertTriangle, Trash2, Check, Info, ChevronRight, Share2, Target, Plus,
  Radio, History, TrendingUp, TrendingDown, Minus, Bug, Network, Camera, X, Clock,
  FileText, Crosshair,
} from 'lucide-react'

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const t = new Date(d)
  return isNaN(t.getTime()) ? '—' : t.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function timeAgo(d?: string | null) {
  if (!d) return 'nunca'
  const t = new Date(d).getTime()
  if (isNaN(t)) return '—'
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (s < 60) return 'agora há pouco'
  const m = Math.floor(s / 60); if (m < 60) return `há ${m} min`
  const h = Math.floor(m / 60); if (h < 24) return `há ${h}h`
  const dd = Math.floor(h / 24); return `há ${dd}d`
}

const RS_BADGE: Record<string, { t: string; c: string }> = {
  running:   { t: 'RODANDO',    c: 'var(--purple-light)' },
  completed: { t: 'CONCLUÍDO',  c: 'var(--low)' },
  failed:    { t: 'FALHOU',     c: 'var(--critical)' },
  stopped:   { t: 'PARADO',     c: 'var(--medium)' },
  idle:      { t: 'AGUARDANDO', c: 'var(--text-mute)' },
}

const STEP_LABEL: Record<string, string> = {
  subdomains: 'enumerando subdomínios', dns: 'resolvendo DNS', http: 'sondando web (probe)',
  exposures: 'checando exposições', takeover: 'checando subdomain takeover', ports: 'varrendo portas',
  scoring: 'calculando score',
}
const KIND_LABEL: Record<string, string> = { vendor: 'Fornecedor', partner: 'Parceiro', internal: 'Interno', other: 'Outro' }
const RISK_LABEL: Record<string, string> = {
  critical: 'Risco crítico', high: 'Risco alto', medium: 'Risco médio', low: 'Risco baixo', info: 'Sem risco relevante',
}
function rc(level: string) { return SEV_COLOR[level] || SEV_COLOR.info }

export default function DominioDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [domain, setDomain] = useState<DomainDetail | null>(null)
  const [assets, setAssets] = useState<DomainAsset[]>([])
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [graph, setGraph] = useState<GraphResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [authNote, setAuthNote] = useState('')
  const [authOpen, setAuthOpen] = useState(false)
  const [saasOpen, setSaasOpen] = useState(false)
  const [history, setHistory] = useState<DomainScanRecord[]>([])
  const [shotOpen, setShotOpen] = useState<DomainAsset | null>(null)  // lightbox do recon visual

  const load = useCallback(() => {
    return Promise.all([api.domains.get(id), api.domains.assets(id), api.engagements.list(), api.graph.domain(id), api.domains.history(id, 30)])
      .then(([d, a, engs, g, h]) => {
        setDomain(d); setAssets(a); setGraph(g); setHistory(h)
        setEngagements(engs.filter((e) => engagementMatchesDomain(e.target, d.domain)))
      })
      .catch(() => router.replace('/dominios'))
      .finally(() => setLoading(false))
  }, [id, router])

  useEffect(() => {
    load()
    const iv = setInterval(() => { if (!document.hidden) api.domains.get(id).then((d) => {
      setDomain(d)
      if (d.scanState === 'scanning') api.domains.assets(id).then(setAssets)
    }).catch(() => {}) }, 4000)
    return () => clearInterval(iv)
  }, [id, load])

  const isScanning = domain?.scanState === 'scanning'
  useEffect(() => { if (domain && !isScanning) load() /* eslint-disable-next-line */ }, [isScanning])

  async function doScan() {
    setScanning(true)
    try { await api.domains.scan(id); await load() } catch (e) { alert(e instanceof Error ? e.message : 'Erro') } finally { setScanning(false) }
  }
  async function toggleAuth(next: boolean) {
    try { const d = await api.domains.setAuthorization(id, next, authNote); setDomain(d); setAuthOpen(false); setAuthNote('') }
    catch (e) { alert(e instanceof Error ? e.message : 'Erro') }
  }
  async function doDelete() {
    if (!confirm('Excluir este domínio e os ativos coletados? (as credenciais em Vazamentos são preservadas)')) return
    try { await api.domains.delete(id); router.push('/dominios') } catch (e) { alert(e instanceof Error ? e.message : 'Erro') }
  }

  if (loading || !domain) return <Page><div style={{ color: 'var(--text-mute)', fontSize: 12, letterSpacing: '0.1em' }}>CARREGANDO...</div></Page>

  const exposures = assets.filter((a) => a.type === 'exposure')
  const ports = assets.filter((a) => a.type === 'port')
  const shots = assets.filter((a) => a.type === 'web' && a.screenshotPath)   // recon visual (Fase 4)
  const subdomainCount = assets.length - exposures.length - ports.length

  // Agrupa as portas por IP (uma entrada por IP, não por porta) e amarra ao(s)
  // subdomínio(s) que resolvem pra ele. Muito mais limpo que a lista plana.
  const subsForIp = (ip?: string | null) => !ip ? [] :
    assets.filter((a) => a.type === 'subdomain' && (a.ips || []).includes(ip)).map((a) => a.value)
  const ipGroups = Array.from(
    ports.reduce((m, p) => {
      const ip = p.ip || p.value
      if (!m.has(ip)) m.set(ip, { ip, thirdParty: !!p.thirdParty, provider: p.provider || null, ports: [] as DomainAsset[] })
      m.get(ip)!.ports.push(p)
      return m
    }, new Map<string, { ip: string; thirdParty: boolean; provider: string | null; ports: DomainAsset[] }>()).values()
  ).map((g) => ({
    ...g,
    subs: subsForIp(g.ip),
    ports: g.ports.slice().sort((a, b) => (a.port || 0) - (b.port || 0)),
    risky: g.ports.filter((p) => p.severity !== 'info'),
  }))
  const ownGroups = ipGroups.filter((g) => !g.thirdParty).sort((a, b) => b.risky.length - a.risky.length || a.ip.localeCompare(b.ip))
  const saasGroups = ipGroups.filter((g) => g.thirdParty)
  const findingGroups = ownGroups.filter((g) => g.risky.length > 0)

  // "Exige atenção": as exposições realmente acionáveis, ordenadas por gravidade.
  // É a única lista que fica aberta por padrão — o resto é inventário, e
  // inventário aberto de uma vez era exatamente o que poluía a tela.
  const priority = exposures
    .filter((a) => a.severity !== 'info')
    .sort((a, b) => SEV_ORDER.indexOf(a.severity as never) - SEV_ORDER.indexOf(b.severity as never))
  const riskyPortCount = findingGroups.reduce((n, g) => n + g.risky.length, 0)
  const vulnNodes = graph ? graph.nodes.filter((n) => n.type === 'vuln') : []
  // Série real do score ao longo dos scans (history vem do mais recente ao mais
  // antigo → invertemos para desenhar da esquerda p/ direita em ordem cronológica).
  const scoreSeries: AreaPoint[] = [...history].reverse().map((h) => ({
    label: new Date(h.ranAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    value: h.riskScore,
  }))

  return (
    <Page>
      <PageHeader
        eyebrow={{ href: '/dominios', label: 'Domínios' }}
        icon={<Globe size={19} color="var(--purple-light)" />}
        title={domain.name || domain.domain}
        subtitle={
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-mute)' }}>
            {domain.domain} · {KIND_LABEL[domain.kind]}
          </span>
        }
        actions={
          <>
            <Btn href={`/mapa?domain=${id}`} title="Ver no mapa de superfície"><Share2 size={14} /> Ver no mapa</Btn>
            <Magnetic>
            <Btn variant="primary" onClick={doScan} disabled={isScanning || scanning}>
              {isScanning || scanning ? <Loader2 size={14} className="spin" /> : <Radar size={14} />} {isScanning ? 'Escaneando' : 'Escanear'}
            </Btn>
            </Magnetic>
            {isAdmin && (
              <button onClick={doDelete} title="Excluir domínio" aria-label="Excluir domínio" style={{
                display: 'flex', alignItems: 'center', padding: '0.5rem', background: 'var(--bg)',
                border: '1px solid var(--border-mid)', borderRadius: R.ctl, color: 'var(--text-mute)', cursor: 'pointer',
              }}><Trash2 size={14} /></button>
            )}
          </>
        }
      />

      {/* Prova de posse: sem verificar, nada roda. Fica no topo porque é a
          única coisa acionável enquanto pendente. */}
      <VerificationCard
        domainId={id}
        domain={domain.domain}
        verification={domain.verification}
        onVerified={load}
      />

      {/* ── Veredito ─────────────────────────────────────────────────────────
          O topo responde uma pergunta só: "quão exposto está este domínio?".
          Score + rótulo + os três números que sustentam a conta + a faixa de
          estado (autorização / monitoramento). Antes isso estava espalhado em
          quatro cards de largura total empilhados. */}
      <Card pad="1.4rem 1.5rem">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1.1fr) minmax(240px, 1fr)', gap: 28, alignItems: 'start' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
              Score de segurança
            </div>
            <ScoreSlider value={domain.riskScore} max={100} label={RISK_LABEL[domain.riskLevel] || domain.riskLevel.toUpperCase()} color={rc(domain.riskLevel)} />
            <div style={{ display: 'flex', gap: 26, marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <HeroStat label="ativos" value={domain.assetCount} />
              <HeroStat label="vivos" value={domain.aliveCount} color="var(--low)" />
              <HeroStat label="exposições" value={domain.exposureCount} color={domain.exposureCount > 0 ? 'var(--high)' : 'var(--muted)'} />
              {vulnNodes.length > 0 && <HeroStat label="vulns" value={vulnNodes.length} color="var(--critical)" />}
            </div>
          </div>

          {/* Composição do score — o "porquê" ao lado do número, não numa seção
              separada 400px abaixo dele. */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Info size={13} /> Por que este score
            </div>
            {domain.riskReasons && domain.riskReasons.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {domain.riskReasons.map((r, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: 'var(--muted)', display: 'flex', gap: 8, lineHeight: 1.5 }}>
                    <span style={{ color: rc(domain.riskLevel), flexShrink: 0 }}>•</span>{r}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: 'var(--text-mute)' }}>Nenhum fator de risco identificado.</div>
            )}
          </div>
        </div>

        {/* Faixa de estado — autorização + monitoramento numa linha só. */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border)',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: domain.authorized ? 'var(--low)' : 'var(--text-mute)' }}>
            {domain.authorized ? <ShieldCheck size={15} /> : <Lock size={15} />}
            {domain.authorized ? 'Autorizado — probe ativo habilitado' : 'Modo passivo — só coleta sem contato ativo'}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-mute)' }}>
            <Beacon color="var(--low)" /> Monitoramento contínuo · último scan {timeAgo(domain.lastScanAt)}
          </span>

          {isAdmin && (
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {domain.authorized ? (
                <button onClick={() => toggleAuth(false)} style={ghostBtn('var(--text-mute)')}>Revogar autorização</button>
              ) : authOpen ? (
                <>
                  <input value={authNote} onChange={(e) => setAuthNote(e.target.value)} placeholder="ref. do contrato/autorização"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border-mid)', borderRadius: 6, color: 'var(--text)', fontSize: 12, padding: '6px 9px', fontFamily: 'inherit', outline: 'none', width: 220 }} />
                  <button onClick={() => toggleAuth(true)} style={{ ...ghostBtn('var(--low)'), display: 'flex', alignItems: 'center', gap: 5 }}><Check size={13} /> Autorizar</button>
                  <button onClick={() => setAuthOpen(false)} style={ghostBtn('var(--muted)')}>Cancelar</button>
                </>
              ) : (
                <button onClick={() => setAuthOpen(true)} style={ghostBtn('var(--purple-light)')}>Autorizar domínio</button>
              )}
            </span>
          )}
        </div>
      </Card>

      {/* Estado transitório do scan — some quando não há scan em curso. */}
      {isScanning && (
        <GradientBorder radius={10}>
          <div style={{ background: tint('var(--purple)', 8), borderRadius: 10, padding: '0.7rem 1rem', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--purple-light)' }}>
            <ScanSweep size={24} /> {STEP_LABEL[domain.scanStep || ''] || 'escaneando'}…
          </div>
        </GradientBorder>
      )}
      {domain.scanState === 'failed' && domain.scanError && (
        <div style={{ background: tint('var(--high)', 8), border: `1px solid ${tint('var(--high)', 30)}`, borderRadius: 10, padding: '0.7rem 1rem', fontSize: 12, color: 'var(--high)' }}>
          Scan falhou: {domain.scanError}
        </div>
      )}

      {/* ── Para onde ir a partir daqui ──────────────────────────────────────
          O assessment era um destino final: não havia caminho daqui para
          Findings nem Relatórios, apesar de ambos estarem no menu. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <NavTile href={`/engagement/novo?target=${encodeURIComponent(domain.domain)}`} icon={<Crosshair size={17} />}
          title="Novo pentest" hint="testar este alvo com o agente" primary />
        <NavTile href={`/findings?domain=${id}`} icon={<AlertTriangle size={17} />}
          title="Findings" hint={vulnNodes.length > 0 ? `${vulnNodes.length} correlacionado(s)` : 'achados deste domínio'} />
        <NavTile href={`/reports?domain=${id}`} icon={<FileText size={17} />}
          title="Relatórios" hint="executivo e técnico" />
        <NavTile href={`/mapa?domain=${id}`} icon={<Share2 size={17} />}
          title="Mapa de superfície" hint={`${subdomainCount} subdomínio(s)`} />
      </div>

      {/* ── Exige atenção ────────────────────────────────────────────────────
          Única lista aberta por padrão. Se não há nada acionável, o vazio é
          uma boa notícia e deve ser dito como tal. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: priority.length ? 'var(--high)' : 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <AlertTriangle size={13} /> Exige atenção
          {priority.length > 0 && <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-mute)', fontWeight: 500 }}>({priority.length})</span>}
        </div>
        {priority.length === 0 ? (
          <Card pad="1.1rem 1.3rem">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--muted)' }}>
              <ShieldCheck size={16} color="var(--low)" />
              {domain.lastScanAt
                ? 'Nenhuma exposição classificada como acionável no último scan.'
                : 'Domínio ainda não escaneado — rode um scan para levantar a superfície.'}
            </div>
          </Card>
        ) : (
          <>
            {priority.slice(0, 6).map((a) => <AssetRow key={a.id} a={a} />)}
            {priority.length > 6 && (
              <div style={{ fontSize: 11.5, color: 'var(--text-mute)', paddingLeft: 2 }}>
                +{priority.length - 6} outras — veja em “Exposições” abaixo.
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Detalhe sob demanda ──────────────────────────────────────────────
          Tudo abaixo é inventário e histórico: informação necessária, mas que
          não deve competir com o veredito. Fechado por padrão, com resumo
          visível na barra para continuar informando fechado. */}

      {graph && graph.stats.vulns > 0 && (
        <Collapsible title="Panorama de risco" icon={<Bug size={12} />} count={vulnNodes.length}
          meta="vulnerabilidades correlacionadas a este domínio">
          {(() => {
            const slices = SEV_ORDER
              .map((sev) => ({
                key: sev, label: sev.charAt(0).toUpperCase() + sev.slice(1),
                value: vulnNodes.filter((v) => v.meta.severity === sev).length,
                color: SEV_COLOR[sev],
              }))
              .filter((s) => s.value > 0)
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
                <Donut data={slices} total={vulnNodes.length} caption="vulns" size={112} thickness={14} />
                <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {slices.map((s) => (
                    <Link key={s.key} href={`/findings?domain=${id}&severity=${s.key}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, textDecoration: 'none' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                      <span style={{ color: 'var(--muted)', flex: 1 }}>{s.label}</span>
                      <span style={{ fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{s.value}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })()}
        </Collapsible>
      )}

      <Collapsible title="Engagements" icon={<Target size={12} />} count={engagements.length}
        color="var(--purple-light)"
        meta={engagements.length === 0 ? 'nenhum pentest rodado' : undefined}>
        {engagements.length === 0 ? (
          <EmptyState
            title="Nenhum engagement rodado ainda para este alvo."
            hint="Um engagement é o pentest conduzido pelo agente sobre este domínio."
            action={<Btn variant="primary" href={`/engagement/novo?target=${encodeURIComponent(domain.domain)}`}><Plus size={13} /> Novo escopo</Btn>}
          />
        ) : (
          <>
            {engagements
              .slice()
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
              .map((e) => {
                const rs = e.runState ?? (e.status === 'completed' ? 'completed' : 'idle')
                const badge = RS_BADGE[rs] || RS_BADGE.idle
                return (
                  <Link key={e.id} href={`/engagement/${e.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{
                      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: R.row,
                      padding: '0.6rem 0.9rem', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                    }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-mute)', marginTop: 2 }}>{new Date(e.updatedAt).toLocaleDateString('pt-BR')} · {e.findingsCount} achado(s)</div>
                      </div>
                      <Badge color={badge.c}>{badge.t}</Badge>
                      <ChevronRight size={14} color="var(--text-mute)" />
                    </div>
                  </Link>
                )
              })}
            <Link href={`/engagement/novo?target=${encodeURIComponent(domain.domain)}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: 'var(--purple-light)', textDecoration: 'none', marginTop: 2 }}>
              <Plus size={12} /> Novo escopo
            </Link>
          </>
        )}
      </Collapsible>

      {(domain.lastDiff?.computedAt || history.length > 0) && (
        <Collapsible title="Monitoramento" icon={<History size={12} />}
          meta={domain.lastDiff?.computedAt
            ? <ScoreDeltaBadge delta={domain.lastDiff.scoreDelta} />
            : `${history.length} scan(s) registrado(s)`}>
          {scoreSeries.length >= 2 && (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: R.row, padding: '0.9rem 1.1rem' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={12} /> Score de segurança ao longo do tempo
              </div>
              <AreaTrend data={scoreSeries} color="var(--purple-light)" height={110} live={isScanning} />
            </div>
          )}
          {domain.lastDiff && domain.lastDiff.computedAt && (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: R.row, padding: '0.9rem 1.1rem' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>Desde o scan anterior</div>
              <div style={{ display: 'flex', gap: 26 }}>
                <HeroStat label="novos" value={`+${domain.lastDiff.newCount}`} color={domain.lastDiff.newCount > 0 ? 'var(--low)' : 'var(--muted)'} />
                <HeroStat label="sumiram" value={`−${domain.lastDiff.missingCount}`} color={domain.lastDiff.missingCount > 0 ? 'var(--high)' : 'var(--muted)'} />
              </div>
              {(domain.lastDiff.newAssets.length > 0 || domain.lastDiff.missingAssets.length > 0) && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {domain.lastDiff.newAssets.slice(0, 6).map((a, i) => (
                    <div key={`n${i}`} style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 8, fontFamily: 'var(--mono)' }}>
                      <span style={{ color: 'var(--low)' }}>+</span> {a.value}
                    </div>
                  ))}
                  {domain.lastDiff.missingAssets.slice(0, 6).map((a, i) => (
                    <div key={`m${i}`} style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 8, fontFamily: 'var(--mono)' }}>
                      <span style={{ color: 'var(--high)' }}>−</span> {a.value}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 10 }}>calculado em {fmtDate(domain.lastDiff.computedAt)}</div>
            </div>
          )}

          {history.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {history.slice(0, 12).map((h, i) => (
                <div key={h.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                }}>
                  <span title={h.riskLevel} style={{ width: 9, height: 9, borderRadius: '50%', background: rc(h.riskLevel), flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{fmtDate(h.ranAt)}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-mute)', marginTop: 2 }}>
                      {h.trigger === 'monitor' ? 'automático' : 'manual'} · {h.assetCount} ativos · {h.aliveCount} vivos
                      {h.cveCount > 0 && <span style={{ color: 'var(--critical)', fontWeight: 700 }}> · {h.cveCount} CVE(s)</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    {(h.newCount > 0 || h.missingCount > 0) && (
                      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-mute)' }}>
                        {h.newCount > 0 && <span style={{ color: 'var(--low)' }}>+{h.newCount}</span>}
                        {h.newCount > 0 && h.missingCount > 0 && ' '}
                        {h.missingCount > 0 && <span style={{ color: 'var(--high)' }}>−{h.missingCount}</span>}
                      </span>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: rc(h.riskLevel), minWidth: 26, textAlign: 'right' }}>{h.riskScore}</span>
                  </div>
                </div>
              ))}
              {history.length > 12 && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', paddingTop: 8 }}>
                  mostrando os 12 scans mais recentes de {history.length}
                </div>
              )}
            </div>
          )}
        </Collapsible>
      )}

      {shots.length > 0 && (
        <Collapsible title="Capturas de tela" icon={<Camera size={12} />} count={shots.length}
          meta="recon visual dos hosts vivos">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
            {shots.map((a) => (
              <button key={a.id} onClick={() => setShotOpen(a)} title={`${a.value} — clique para ampliar`}
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: R.row, overflow: 'hidden', cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'inherit' }}>
                <img src={`/api/domains/${id}/screenshot/${a.id}`} alt={a.value} loading="lazy"
                  style={{ width: '100%', height: 118, objectFit: 'cover', objectPosition: 'top', display: 'block', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }} />
                <div style={{ padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: SEV_COLOR[a.severity] || SEV_COLOR.info, flexShrink: 0 }} />
                  <span style={{ fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.value}</span>
                  {typeof a.statusCode === 'number' && <span style={{ marginLeft: 'auto', fontSize: 9.5, fontFamily: 'var(--mono)', color: 'var(--text-mute)' }}>{a.statusCode}</span>}
                </div>
              </button>
            ))}
          </div>
        </Collapsible>
      )}

      {exposures.length > 0 && (
        <Collapsible title="Exposições" icon={<AlertTriangle size={12} />} count={exposures.length}
          meta={priority.length > 0 ? `${priority.length} acionável(is)` : 'todas informativas'}>
          {exposures.map((a) => <AssetRow key={a.id} a={a} />)}
        </Collapsible>
      )}

      {(ports.length > 0 || (domain.asnInfo && domain.asnInfo.length > 0)) && (
        <Collapsible title="Portas & serviços" icon={<Network size={12} />}
          meta={`${ipGroups.length} IP(s)${riskyPortCount ? ` · ${riskyPortCount} porta(s) de risco` : ''}`}>
          {domain.asnInfo && domain.asnInfo.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
              {domain.asnInfo.map((a, i) => {
                const tag = a.owned ? 'próprio · escaneado' : a.tooLarge ? 'cloud · não escaneado' : 'hospedado · não escaneado'
                const col = a.owned ? 'var(--purple-light)' : 'var(--text-mute)'
                const title = a.owned
                  ? 'Faixa própria do alvo (holder casa com o domínio) — vizinhos escaneados'
                  : 'Faixa de provedor/hospedagem — só contexto; vizinhos são de terceiros, não escaneados'
                return (
                  <span key={i} title={title} style={{
                    fontSize: 10.5, fontFamily: 'var(--mono)', borderRadius: 99, padding: '3px 9px',
                    background: 'var(--bg)', border: `1px solid ${a.owned ? 'var(--border-hi)' : 'var(--border-mid)'}`, color: col,
                  }}>
                    {a.asn}{a.holder ? ` · ${a.holder}` : ''} · {a.prefix} · {tag}
                  </span>
                )
              })}
            </div>
          )}

          {ports.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>Nenhuma porta aberta detectada.</div>
          ) : (
            <>
              {findingGroups.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--high)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Exposições nos seus servidores ({riskyPortCount})
                  </div>
                  {findingGroups.map((g) => <IpGroup key={`f-${g.ip}`} g={g} onlyRisky />)}
                </div>
              )}

              {ownGroups.map((g) => <IpGroup key={g.ip} g={g} />)}

              {saasGroups.length > 0 && (
                <div style={{ marginTop: 2 }}>
                  <button onClick={() => setSaasOpen((v) => !v)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', cursor: 'pointer',
                    background: 'var(--bg)', border: '1px dashed var(--border-mid)', borderRadius: R.row, padding: '0.6rem 0.9rem',
                    color: 'var(--text-mute)', fontSize: 12, fontFamily: 'inherit',
                  }}>
                    <ChevronRight size={14} style={{ transform: saasOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                    {saasGroups.length} IP(s) de SaaS/e-mail de terceiro (Microsoft 365, MailChimp…) — infra do provedor, não sua exposição
                  </button>
                  {saasOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                      {saasGroups.map((g) => <IpGroup key={g.ip} g={g} />)}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </Collapsible>
      )}

      {/* Vazamentos está represado (reforma UX 2026-07) — nota discreta no rodapé,
          não um card de largura total no meio do assessment. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-dim)', paddingLeft: 2 }}>
        <ShieldAlert size={13} />
        Exposição de credenciais
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: 'var(--text-mute)', border: '1px solid var(--border)', borderRadius: 99, padding: '1px 8px' }}>
          <Clock size={10} /> em construção
        </span>
      </div>

      {/* Lightbox do recon visual */}
      {shotOpen && (
        <div onClick={() => setShotOpen(null)} style={{
          position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2,2,8,0.86)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3vh 3vw', cursor: 'zoom-out',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column', gap: 8, cursor: 'default' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: SEV_COLOR[shotOpen.severity] || SEV_COLOR.info, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--text)' }}>{shotOpen.value}</span>
              {shotOpen.title && <span style={{ fontSize: 11.5, color: 'var(--text-mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {shotOpen.title}</span>}
              {shotOpen.scheme && <a href={`${shotOpen.scheme}://${shotOpen.value}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--purple-light)', textDecoration: 'none' }}>abrir ↗</a>}
              <button onClick={() => setShotOpen(null)} aria-label="Fechar" style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', padding: 2, marginLeft: shotOpen.scheme ? 0 : 'auto' }}><X size={18} /></button>
            </div>
            <img src={`/api/domains/${id}/screenshot/${shotOpen.id}`} alt={shotOpen.value}
              style={{ maxWidth: '100%', maxHeight: '82vh', objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border-mid)', background: 'var(--bg)' }} />
          </div>
        </div>
      )}

      <style jsx global>{`.spin { animation: spin 0.9s linear infinite; }`}</style>
    </Page>
  )
}

// ── Peças locais ─────────────────────────────────────────────────────────────

function HeroStat({ label, value, color = 'var(--text)' }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 19, fontWeight: 700, color, fontFamily: 'var(--mono)', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 9.5, color: 'var(--text-mute)', marginTop: 4, letterSpacing: '0.08em' }}>{label.toUpperCase()}</div>
    </div>
  )
}

/** Porta de saída do assessment para os outros módulos. */
function NavTile({ href, icon, title, hint, primary = false }: {
  href: string; icon: React.ReactNode; title: string; hint: string; primary?: boolean
}) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div style={{
        background: primary ? tint('var(--purple)', 12) : 'var(--surface)',
        border: `1px solid ${primary ? 'var(--border-hi)' : 'var(--border)'}`,
        borderRadius: R.card, padding: '0.95rem 1.1rem',
        display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', height: '100%',
        transition: 'border-color .13s, transform .13s',
      }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-hi)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = primary ? 'var(--border-hi)' : 'var(--border)'; e.currentTarget.style.transform = 'none' }}
      >
        <span style={{ color: 'var(--purple-light)', display: 'flex', flexShrink: 0 }}>{icon}</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{title}</span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-mute)', marginTop: 2 }}>{hint}</span>
        </span>
        <ChevronRight size={15} color="var(--text-dim)" style={{ marginLeft: 'auto', flexShrink: 0 }} />
      </div>
    </Link>
  )
}

function ScoreDeltaBadge({ delta }: { delta: number }) {
  if (!delta) {
    return <span style={{ fontSize: 11, color: 'var(--text-mute)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Minus size={12} /> score estável</span>
  }
  const worse = delta > 0
  const color = worse ? 'var(--high)' : 'var(--low)'
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {worse ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {worse ? '+' : ''}{delta} no score
    </span>
  )
}

function ghostBtn(color: string): React.CSSProperties {
  return { padding: '5px 12px', borderRadius: 6, background: tint(color, 12), border: `1px solid ${tint(color, 35)}`, color, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
}

function AssetRow({ a }: { a: DomainAsset }) {
  const sc = SEV_COLOR[a.severity] || SEV_COLOR.info
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${a.severity !== 'info' ? sc : 'var(--border-mid)'}`, borderRadius: R.row, padding: '0.7rem 0.9rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.alive && a.scheme ? `${a.scheme}://` : ''}{a.value}</div>
          {a.title && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {a.statusCode != null && <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: a.statusCode < 400 ? 'var(--low)' : 'var(--high)' }}>{a.statusCode}</span>}
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: a.alive ? 'var(--low)' : 'var(--text-dim)' }} title={a.alive ? 'vivo' : 'sem resposta web'} />
        </div>
      </div>
      {(a.cveId || a.label || (a.ips && a.ips.length) || (a.tech && a.tech.length) || a.webServer) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
          {a.cveId && (
            <a href={`https://nvd.nist.gov/vuln/detail/${a.cveId}`} target="_blank" rel="noreferrer"
              style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--critical)', background: tint('var(--critical)', 14), border: `1px solid ${tint('var(--critical)', 34)}`, borderRadius: 99, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', fontFamily: 'var(--mono)' }}>
              <Bug size={10} /> {a.cveId}
            </a>
          )}
          {a.label && a.severity !== 'info' && <Badge color={sc}>{a.label}</Badge>}
          {a.ips?.slice(0, 3).map((ip) => <Chip key={ip}>{ip}</Chip>)}
          {a.webServer && <Chip>{a.webServer}</Chip>}
          {a.tech?.slice(0, 5).map((t) => <Chip key={t}>{t}</Chip>)}
        </div>
      )}
      {a.firstSeen && (
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>visto desde {fmtDate(a.firstSeen)}</div>
      )}
    </div>
  )
}

// Uma entrada por IP: cabeçalho (IP + subdomínio + tag) e as portas em chips.
// `onlyRisky` mostra só as portas com achado (usado na seção "Exposições").
function IpGroup({ g, onlyRisky = false }: {
  g: { ip: string; thirdParty: boolean; provider: string | null; ports: DomainAsset[]; subs: string[]; risky: DomainAsset[] }
  onlyRisky?: boolean
}) {
  const shown = onlyRisky ? g.risky : g.ports
  const worst = g.risky.length ? g.risky.reduce((w, p) => SEV_ORDER.indexOf(p.severity as never) < SEV_ORDER.indexOf(w.severity as never) ? p : w).severity : 'info'
  const stripe = g.thirdParty ? 'var(--border-mid)' : (g.risky.length ? SEV_COLOR[worst] : 'var(--border-mid)')
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${stripe}`, borderRadius: R.row, padding: '0.65rem 0.9rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--mono)', fontWeight: 600 }}>{g.ip}</span>
        {g.subs.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-mute)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {g.subs.slice(0, 3).join(', ')}{g.subs.length > 3 ? ` +${g.subs.length - 3}` : ''}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {g.thirdParty
          ? <Badge color="var(--info)" title="Infra do provedor — não é exposição sua">SaaS · {g.provider}</Badge>
          : <Badge color="var(--low)">SEU SERVIDOR</Badge>}
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
        {shown.map((p) => {
          const risky = p.severity !== 'info'
          const c = risky ? (SEV_COLOR[p.severity] || SEV_COLOR.info) : null
          const svc = [p.service, p.product, p.version].filter(Boolean).join(' ')
          return (
            <span key={p.id} title={p.label || `${p.port}${svc ? ' · ' + svc : ''}`} style={{
              fontSize: 10.5, fontFamily: 'var(--mono)', borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap',
              color: risky ? c! : 'var(--muted)', fontWeight: risky ? 700 : 400,
              background: risky ? tint(c!, 12) : 'var(--bg)',
              border: `1px solid ${risky ? tint(c!, 34) : 'var(--border)'}`,
            }}>
              {p.port}{p.service ? `/${p.service}` : ''}
            </span>
          )
        })}
      </div>
      {onlyRisky && g.risky.some((p) => p.label) && (
        <div style={{ fontSize: 11, color: SEV_COLOR[worst], marginTop: 6 }}>
          {[...new Set(g.risky.map((p) => p.label).filter(Boolean))].join(' · ')}
        </div>
      )}
    </div>
  )
}
