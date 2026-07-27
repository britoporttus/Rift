'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, DomainDetail, DomainAsset, Engagement, GraphResponse } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { SEV_COLOR, SEV_ORDER } from '@/lib/severity'
import { ScoreSlider } from '@/components/ui/charts/ScoreSlider'
import { Donut } from '@/components/ui/charts/Donut'
import { engagementMatchesDomain } from '@/lib/domainMatch'
import {
  ArrowLeft, Globe, Radar, Loader2, ShieldCheck, ShieldAlert, Lock,
  AlertTriangle, Trash2, Check, Info, ChevronRight, Share2, Target, Plus, Workflow,
} from 'lucide-react'

const RS_BADGE: Record<string, { t: string; c: string }> = {
  running:   { t: 'RODANDO',    c: 'var(--purple-light)' },
  completed: { t: 'CONCLUÍDO',  c: 'var(--low)' },
  failed:    { t: 'FALHOU',     c: 'var(--critical)' },
  stopped:   { t: 'PARADO',     c: 'var(--medium)' },
  idle:      { t: 'AGUARDANDO', c: 'var(--text-mute)' },
}

const STEP_LABEL: Record<string, string> = {
  subdomains: 'enumerando subdomínios', dns: 'resolvendo DNS', http: 'sondando web (probe)',
  exposures: 'checando exposições', scoring: 'calculando score',
}
const KIND_LABEL: Record<string, string> = { vendor: 'Fornecedor', partner: 'Parceiro', internal: 'Interno', other: 'Outro' }
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

  const load = useCallback(() => {
    return Promise.all([api.domains.get(id), api.domains.assets(id), api.engagements.list(), api.graph.domain(id)])
      .then(([d, a, engs, g]) => {
        setDomain(d); setAssets(a); setGraph(g)
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

  if (loading || !domain) return <div style={{ padding: '3rem', color: 'var(--text-mute)', fontSize: 12, letterSpacing: '0.1em' }}>CARREGANDO...</div>

  const exposures = assets.filter((a) => a.type === 'exposure')

  return (
    <div style={{ padding: '1.5rem 1.75rem', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1180, margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <Link href="/dominios" style={{ color: 'var(--text-mute)', marginTop: 4 }}><ArrowLeft size={18} /></Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 21, fontWeight: 700, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
            <Globe size={19} color="var(--purple-light)" /> {domain.name || domain.domain}
          </h1>
          <div style={{ fontSize: 12, color: 'var(--text-mute)', fontFamily: 'var(--mono)', marginTop: 4 }}>{domain.domain} · {KIND_LABEL[domain.kind]}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <Link href={`/mapa?domain=${id}`} title="Ver no mapa de superfície"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 0.9rem', background: 'color-mix(in srgb, var(--purple) 12%, transparent)', border: '1px solid var(--border-mid)', borderRadius: 7, color: 'var(--purple-light)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' }}>
            <Share2 size={14} /> Ver no mapa
          </Link>
          <button onClick={doScan} disabled={isScanning || scanning}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 0.9rem', background: 'var(--purple)', border: 'none', borderRadius: 7, color: 'white', fontSize: 12.5, fontWeight: 700, cursor: isScanning ? 'default' : 'pointer', opacity: isScanning ? 0.6 : 1, fontFamily: 'inherit', boxShadow: '0 0 18px var(--purple-glow-strong)' }}>
            {isScanning || scanning ? <Loader2 size={14} className="spin" /> : <Radar size={14} />} {isScanning ? 'Escaneando' : 'Escanear'}
          </button>
          {isAdmin && <button onClick={doDelete} title="Excluir" style={{ display: 'flex', alignItems: 'center', padding: '0.5rem', background: 'var(--bg)', border: '1px solid var(--border-mid)', borderRadius: 7, color: 'var(--text-mute)', cursor: 'pointer' }}><Trash2 size={14} /></button>}
        </div>
      </div>

      {/* Score de segurança + composição */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.4rem 1.5rem' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 18 }}>
            Score de segurança
          </div>
          <ScoreSlider value={domain.riskScore} max={100} label={domain.riskLevel.toUpperCase()} color={rc(domain.riskLevel)} />
          <div style={{ display: 'flex', gap: 26, marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{domain.assetCount}</div>
              <div style={{ fontSize: 9.5, color: 'var(--text-mute)', marginTop: 4, letterSpacing: '0.08em' }}>ATIVOS</div>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--low)', fontFamily: 'var(--mono)' }}>{domain.aliveCount}</div>
              <div style={{ fontSize: 9.5, color: 'var(--text-mute)', marginTop: 4, letterSpacing: '0.08em' }}>VIVOS</div>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: domain.exposureCount > 0 ? 'var(--high)' : 'var(--muted)', fontFamily: 'var(--mono)' }}>{domain.exposureCount}</div>
              <div style={{ fontSize: 9.5, color: 'var(--text-mute)', marginTop: 4, letterSpacing: '0.08em' }}>EXPOSIÇÕES</div>
            </div>
          </div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.4rem 1.5rem' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Info size={13} /> Composição do score
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

      {/* Panorama de risco — vulnerabilidades correlacionadas a ESTE domínio
          (subdomínios + engagements ligados a ele), não o agregado geral da
          plataforma. */}
      {graph && graph.stats.vulns > 0 && (() => {
        const vulnNodes = graph.nodes.filter((n) => n.type === 'vuln')
        const slices = SEV_ORDER
          .map((sev) => ({
            key: sev, label: sev.charAt(0).toUpperCase() + sev.slice(1),
            value: vulnNodes.filter((v) => v.meta.severity === sev).length,
            color: SEV_COLOR[sev],
          }))
          .filter((s) => s.value > 0)
        return (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.1rem 1.4rem' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Panorama de risco deste domínio
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
              <Donut data={slices} total={vulnNodes.length} caption="vulns" size={112} thickness={14} />
              <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {slices.map((s) => (
                  <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                    <span style={{ color: 'var(--muted)', flex: 1 }}>{s.label}</span>
                    <span style={{ fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {isScanning && (
        <div style={{ background: 'color-mix(in srgb, var(--purple) 8%, transparent)', border: '1px solid var(--border-mid)', borderRadius: 10, padding: '0.7rem 1rem', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--purple-light)' }}>
          <Loader2 size={15} className="spin" /> {STEP_LABEL[domain.scanStep || ''] || 'escaneando'}…
        </div>
      )}
      {domain.scanState === 'failed' && domain.scanError && (
        <div style={{ background: 'color-mix(in srgb, var(--high) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--high) 30%, transparent)', borderRadius: 10, padding: '0.7rem 1rem', fontSize: 12, color: 'var(--high)' }}>Scan falhou: {domain.scanError}</div>
      )}

      {/* Autorização (gate legal) */}
      <div style={{ background: 'var(--surface)', border: `1px solid ${domain.authorized ? 'color-mix(in srgb, var(--low) 35%, transparent)' : 'var(--border)'}`, borderRadius: 12, padding: '0.9rem 1.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 200 }}>
            {domain.authorized ? <ShieldCheck size={18} color="var(--low)" /> : <Lock size={18} color="var(--text-mute)" />}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: domain.authorized ? 'var(--low)' : 'var(--text)' }}>{domain.authorized ? 'Domínio autorizado' : 'Modo passivo (não autorizado)'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 2 }}>
                {domain.authorized ? `Probe ativo (httpx/nuclei) e fontes reais de vazamento habilitados${domain.authorizedBy ? ` · por ${domain.authorizedBy}` : ''}.` : 'Só coleta passiva (subfinder + DNS). Autorize com base contratual para probe ativo e fontes reais.'}
              </div>
            </div>
          </div>
          {isAdmin && (domain.authorized ? (
            <button onClick={() => toggleAuth(false)} style={ghostBtn('var(--text-mute)')}>Revogar</button>
          ) : authOpen ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input value={authNote} onChange={(e) => setAuthNote(e.target.value)} placeholder="ref. do contrato/autorização" style={{ background: 'rgba(2,2,8,0.6)', border: '1px solid var(--border-mid)', borderRadius: 6, color: 'var(--text)', fontSize: 12, padding: '6px 9px', fontFamily: 'inherit', outline: 'none', width: 220 }} />
              <button onClick={() => toggleAuth(true)} style={{ ...ghostBtn('var(--low)'), display: 'flex', alignItems: 'center', gap: 5 }}><Check size={13} /> Autorizar</button>
              <button onClick={() => setAuthOpen(false)} style={ghostBtn('var(--muted)')}>Cancelar</button>
            </div>
          ) : (
            <button onClick={() => setAuthOpen(true)} style={ghostBtn('var(--purple-light)')}>Autorizar domínio</button>
          ))}
        </div>
      </div>

      {/* Exposição de credenciais → link para o módulo Vazamentos */}
      <Link href={`/vazamentos/${encodeURIComponent(domain.domain)}`} style={{ textDecoration: 'none' }}>
        <div style={{ background: 'var(--surface)', border: `1px solid ${domain.leakCount > 0 ? 'color-mix(in srgb, var(--critical) 30%, transparent)' : 'var(--border)'}`, borderRadius: 12, padding: '0.9rem 1.1rem', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <ShieldAlert size={18} color={domain.leakCount > 0 ? 'var(--critical)' : 'var(--text-mute)'} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Exposição de credenciais</div>
            <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 2 }}>
              {domain.leakCount > 0 ? `${domain.leakCount} registro(s) de vazamento associados — ver detalhe no módulo Vazamentos.` : 'Nenhuma busca de vazamento ainda. Abrir no módulo Vazamentos.'}
            </div>
          </div>
          {domain.leakCount > 0 && <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--critical)', fontFamily: 'var(--mono)' }}>{domain.leakCount}</span>}
          <ChevronRight size={16} color="var(--text-mute)" />
        </div>
      </Link>

      {/* Engagements/pentests já rodados para este alvo */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionTitle icon={<Target size={13} />} color="var(--purple-light)">Engagements ({engagements.length})</SectionTitle>
          <Link href={`/engagement/novo?target=${encodeURIComponent(domain.domain)}`}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: 'var(--purple-light)', textDecoration: 'none' }}>
            <Plus size={12} /> Novo escopo
          </Link>
        </div>
        {engagements.length === 0 ? (
          <div style={{ background: 'var(--surface)', border: '1px dashed var(--border-mid)', borderRadius: 12, padding: '1.2rem', textAlign: 'center', color: 'var(--text-mute)', fontSize: 12.5 }}>
            Nenhum engagement rodado ainda para este alvo.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {engagements
              .slice()
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
              .map((e) => {
                const rs = e.runState ?? (e.status === 'completed' ? 'completed' : 'idle')
                const badge = RS_BADGE[rs] || RS_BADGE.idle
                return (
                  <Link key={e.id} href={`/engagement/${e.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{
                      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                      padding: '0.6rem 0.9rem', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                    }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-mute)', marginTop: 2 }}>{new Date(e.updatedAt).toLocaleDateString('pt-BR')} · {e.findingsCount} achado(s)</div>
                      </div>
                      <span style={{
                        fontSize: 8.5, fontWeight: 700, borderRadius: 99, letterSpacing: '0.05em', padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0,
                        background: `color-mix(in srgb, ${badge.c} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${badge.c} 30%, transparent)`, color: badge.c,
                      }}>{badge.t}</span>
                      <ChevronRight size={14} color="var(--text-mute)" />
                    </div>
                  </Link>
                )
              })}
          </div>
        )}
      </div>

      {/* Exposições */}
      {exposures.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SectionTitle icon={<AlertTriangle size={13} />} color="var(--high)">Exposições ({exposures.length})</SectionTitle>
          {exposures.map((a) => <AssetRow key={a.id} a={a} />)}
        </div>
      )}

      {/* Árvore interativa de subdomínios/vulnerabilidades vive no Mapa (evita
          duplicar o mesmo componente em dois lugares) */}
      <Link href={`/mapa?domain=${id}`} style={{ textDecoration: 'none' }}>
        <div style={{
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--purple) 14%, transparent), var(--surface))',
          border: '1px solid var(--border-mid)', borderRadius: 12, padding: '1.1rem 1.3rem',
          display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'color-mix(in srgb, var(--purple) 16%, transparent)', border: '1px solid var(--border-mid)', color: 'var(--purple-light)',
          }}>
            <Workflow size={19} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Ver mapa interativo</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-mute)', marginTop: 2 }}>
              Árvore de {assets.length - exposures.length} subdomínio(s), com vulnerabilidades e engagements correlacionados — expanda, colapse e clique pra ver detalhe.
            </div>
          </div>
          <ChevronRight size={16} color="var(--text-mute)" />
        </div>
      </Link>

      <style jsx global>{`.spin { animation: spin 0.9s linear infinite; }`}</style>
    </div>
  )
}

function ghostBtn(color: string): React.CSSProperties {
  return { padding: '5px 12px', borderRadius: 6, background: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`, color, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
}
function SectionTitle({ children, icon, color }: { children: React.ReactNode; icon: React.ReactNode; color: string }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 6 }}>{icon}{children}</div>
}
function Chip({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 9.5, fontFamily: 'var(--mono)', background: 'rgba(2,2,8,0.5)', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 99, padding: '2px 7px' }}>{children}</span>
}

function AssetRow({ a }: { a: DomainAsset }) {
  const sc = SEV_COLOR[a.severity] || SEV_COLOR.info
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${a.severity !== 'info' ? sc : 'var(--border-mid)'}`, borderRadius: 8, padding: '0.7rem 0.9rem' }}>
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
      {(a.label || (a.ips && a.ips.length) || (a.tech && a.tech.length) || a.webServer) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
          {a.label && a.severity !== 'info' && <span style={{ fontSize: 9.5, fontWeight: 700, color: sc, background: `color-mix(in srgb, ${sc} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${sc} 30%, transparent)`, borderRadius: 99, padding: '2px 8px' }}>{a.label}</span>}
          {a.ips?.slice(0, 3).map((ip) => <Chip key={ip}>{ip}</Chip>)}
          {a.webServer && <Chip>{a.webServer}</Chip>}
          {a.tech?.slice(0, 5).map((t) => <Chip key={t}>{t}</Chip>)}
        </div>
      )}
    </div>
  )
}
