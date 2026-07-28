'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, InternalNetworkDetail, InternalHost, InternalScanRecord } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { SEV_COLOR } from '@/lib/severity'
import { ScoreSlider } from '@/components/ui/charts/ScoreSlider'
import { AgentSetup } from '@/components/rede-interna/AgentSetup'
import { NetworkTopology } from '@/components/rede-interna/NetworkTopology'
import { NetworkDiagram } from '@/components/rede-interna/NetworkDiagram'
import { deviceColor, deviceLabel, deviceIcon, DEVICE_ORDER } from '@/components/rede-interna/deviceMeta'
import {
  ArrowLeft, Network, Loader2, ShieldCheck, Lock, Check, Trash2, Info, History,
  TrendingUp, TrendingDown, Minus, Radio, AlertTriangle, Workflow,
} from 'lucide-react'

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const t = new Date(d)
  return isNaN(t.getTime()) ? '—' : t.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function timeAgo(d?: string | null) {
  if (!d) return 'nunca'
  const t = new Date(d).getTime(); if (isNaN(t)) return '—'
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (s < 60) return 'agora há pouco'
  const m = Math.floor(s / 60); if (m < 60) return `há ${m} min`
  const h = Math.floor(m / 60); if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}
const KIND_LABEL: Record<string, string> = { lan: 'LAN', dmz: 'DMZ', cloud: 'Nuvem', other: 'Outra' }
function rc(level: string) { return SEV_COLOR[level] || SEV_COLOR.info }

export default function RedeInternaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [net, setNet] = useState<InternalNetworkDetail | null>(null)
  const [hosts, setHosts] = useState<InternalHost[]>([])
  const [history, setHistory] = useState<InternalScanRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [authNote, setAuthNote] = useState('')
  const [authOpen, setAuthOpen] = useState(false)
  const [view, setView] = useState<'estrutura' | 'radial'>('estrutura')

  const load = useCallback(() => {
    return Promise.all([api.internalNetworks.get(id), api.internalNetworks.hosts(id), api.internalNetworks.history(id, 30)])
      .then(([n, h, hist]) => { setNet(n); setHosts(h); setHistory(hist) })
      .catch(() => router.replace('/rede-interna'))
      .finally(() => setLoading(false))
  }, [id, router])

  useEffect(() => {
    load()
    const iv = setInterval(() => { if (!document.hidden) load() }, 5000)
    return () => clearInterval(iv)
  }, [load])

  async function toggleAuth(next: boolean) {
    try { const n = await api.internalNetworks.setAuthorization(id, next, authNote); setNet(n); setAuthOpen(false); setAuthNote('') }
    catch (e) { alert(e instanceof Error ? e.message : 'Erro') }
  }
  async function doDelete() {
    if (!confirm('Excluir esta rede e todos os dispositivos coletados?')) return
    try { await api.internalNetworks.delete(id); router.push('/rede-interna') } catch (e) { alert(e instanceof Error ? e.message : 'Erro') }
  }

  if (loading || !net) return <div style={{ padding: '3rem', color: 'var(--text-mute)', fontSize: 12, letterSpacing: '0.1em' }}>CARREGANDO...</div>

  const risky = hosts.filter((h) => h.severity && h.severity !== 'info')
  const grouped = DEVICE_ORDER.map((t) => ({ type: t, items: hosts.filter((h) => h.deviceType === t) })).filter((g) => g.items.length > 0)

  return (
    <div style={{ padding: '1.5rem 1.75rem', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1180, margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <Link href="/rede-interna" style={{ color: 'var(--text-mute)', marginTop: 4 }}><ArrowLeft size={18} /></Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 21, fontWeight: 700, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
            <Network size={19} color="var(--purple-light)" /> {net.name}
          </h1>
          <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 7 }}>
            {KIND_LABEL[net.kind]} · <Radio size={12} color={net.lastImportAt ? 'var(--low)' : 'var(--text-dim)'} /> última coleta {timeAgo(net.lastImportAt)}
            {net.agent?.hostname && <span>· agente: {net.agent.hostname}</span>}
          </div>
        </div>
        {isAdmin && <button onClick={doDelete} title="Excluir" style={{ display: 'flex', alignItems: 'center', padding: '0.5rem', background: 'var(--bg)', border: '1px solid var(--border-mid)', borderRadius: 7, color: 'var(--text-mute)', cursor: 'pointer' }}><Trash2 size={14} /></button>}
      </div>

      {/* Score + composição */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.4rem 1.5rem' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 18 }}>Score de risco da rede</div>
          <ScoreSlider value={net.riskScore} max={100} label={net.riskLevel.toUpperCase()} color={rc(net.riskLevel)} />
          <div style={{ display: 'flex', gap: 26, marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <NumStat value={net.hostCount} label="DISPOSITIVOS" />
            <NumStat value={risky.length} label="COM ACHADOS" color={risky.length > 0 ? 'var(--high)' : 'var(--muted)'} />
            <NumStat value={net.deviceTypeCounts?.unknown || 0} label="NÃO IDENTIF." color={(net.deviceTypeCounts?.unknown || 0) > 0 ? 'var(--medium)' : 'var(--muted)'} />
          </div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.4rem 1.5rem' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}><Info size={13} /> Composição do score</div>
          {net.riskReasons && net.riskReasons.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {net.riskReasons.map((r, i) => (
                <div key={i} style={{ fontSize: 12.5, color: 'var(--muted)', display: 'flex', gap: 8, lineHeight: 1.5 }}>
                  <span style={{ color: rc(net.riskLevel), flexShrink: 0 }}>•</span>{r}
                </div>
              ))}
            </div>
          ) : <div style={{ fontSize: 12.5, color: 'var(--text-mute)' }}>Nenhum fator de risco ainda. Rode o agente para coletar.</div>}
        </div>
      </div>

      {/* O que mudou desde a última coleta */}
      {net.lastDiff && net.lastDiff.computedAt && (net.lastDiff.newCount > 0 || net.lastDiff.missingCount > 0 || net.lastDiff.scoreDelta !== 0) && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.1rem 1.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <SectionTitle icon={<History size={13} />} color="var(--muted)">O que mudou desde a última coleta</SectionTitle>
            <ScoreDeltaBadge delta={net.lastDiff.scoreDelta} />
          </div>
          <div style={{ display: 'flex', gap: 26 }}>
            <NumStat value={net.lastDiff.newCount} label="NOVOS" prefix="+" color={net.lastDiff.newCount > 0 ? 'var(--low)' : 'var(--muted)'} />
            <NumStat value={net.lastDiff.missingCount} label="SUMIRAM" prefix="−" color={net.lastDiff.missingCount > 0 ? 'var(--high)' : 'var(--muted)'} />
          </div>
          {net.lastDiff.newHosts.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {net.lastDiff.newHosts.slice(0, 8).map((h, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--mono)' }}><span style={{ color: 'var(--low)' }}>+</span> {h.ip} · {deviceLabel(h.deviceType)}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Autorização (gate legal) */}
      <div style={{ background: 'var(--surface)', border: `1px solid ${net.authorized ? 'color-mix(in srgb, var(--low) 35%, transparent)' : 'var(--border)'}`, borderRadius: 12, padding: '0.9rem 1.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 200 }}>
            {net.authorized ? <ShieldCheck size={18} color="var(--low)" /> : <Lock size={18} color="var(--text-mute)" />}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: net.authorized ? 'var(--low)' : 'var(--text)' }}>{net.authorized ? 'Rede autorizada' : 'Rede não autorizada'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 2 }}>
                {net.authorized ? `O agente pode coletar${net.authorizedBy ? ` · por ${net.authorizedBy}` : ''}.` : 'Autorize (confirmando que tem permissão) para o agente coletar.'}
              </div>
            </div>
          </div>
          {isAdmin && (net.authorized ? (
            <button onClick={() => toggleAuth(false)} style={ghostBtn('var(--text-mute)')}>Revogar</button>
          ) : authOpen ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input value={authNote} onChange={(e) => setAuthNote(e.target.value)} placeholder="ref. da autorização" style={{ background: 'var(--bg)', border: '1px solid var(--border-mid)', borderRadius: 6, color: 'var(--text)', fontSize: 12, padding: '6px 9px', fontFamily: 'inherit', outline: 'none', width: 200 }} />
              <button onClick={() => toggleAuth(true)} style={{ ...ghostBtn('var(--low)'), display: 'flex', alignItems: 'center', gap: 5 }}><Check size={13} /> Autorizar</button>
              <button onClick={() => setAuthOpen(false)} style={ghostBtn('var(--muted)')}>Cancelar</button>
            </div>
          ) : (
            <button onClick={() => setAuthOpen(true)} style={ghostBtn('var(--purple-light)')}>Autorizar rede</button>
          ))}
        </div>
      </div>

      {/* Setup do agente (admin) — sempre disponível; destaque quando 0 hosts */}
      {isAdmin && <AgentSetup networkId={id} authorized={net.authorized} onRegenerated={load} />}

      {/* Topologia + inventário + achados só quando há hosts */}
      {hosts.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px dashed var(--border-mid)', borderRadius: 12, padding: '2.5rem', textAlign: 'center', color: 'var(--text-mute)', fontSize: 13 }}>
          Nenhum dispositivo coletado ainda. {isAdmin ? 'Rode o agente com o comando acima.' : 'Aguardando a primeira coleta do agente.'}
        </div>
      ) : (
        <>
          {/* Topologia — duas visões: estruturada (por segmento) e radial */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <SectionTitle icon={<Workflow size={13} />} color="var(--purple-light)">Topologia da rede</SectionTitle>
              <div style={{ display: 'flex', background: 'var(--bg)', border: '1px solid var(--border-mid)', borderRadius: 8, padding: 2 }}>
                {(['estrutura', 'radial'] as const).map((v) => (
                  <button key={v} onClick={() => setView(v)} style={{
                    fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    textTransform: 'capitalize',
                    background: view === v ? 'var(--purple)' : 'transparent',
                    color: view === v ? '#fff' : 'var(--muted)',
                  }}>{v === 'estrutura' ? 'Estrutura' : 'Radial'}</button>
                ))}
              </div>
            </div>
            {view === 'estrutura'
              ? <NetworkDiagram hosts={hosts} networkName={net.name} />
              : <NetworkTopology hosts={hosts} networkName={net.name} />}
          </div>

          {/* Achados de segurança */}
          {risky.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <SectionTitle icon={<AlertTriangle size={13} />} color="var(--high)">Achados de segurança ({risky.length})</SectionTitle>
              {risky.sort((a, b) => (['critical', 'high', 'medium', 'low', 'info'].indexOf(a.severity) - ['critical', 'high', 'medium', 'low', 'info'].indexOf(b.severity))).map((h) => <HostRow key={h.id} h={h} />)}
            </div>
          )}

          {/* Inventário agrupado por tipo */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SectionTitle icon={<Network size={13} />} color="var(--muted)">Inventário ({hosts.length})</SectionTitle>
            {grouped.map((g) => {
              const Icon = deviceIcon(g.type)
              return (
                <div key={g.type}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 700, color: deviceColor(g.type), textTransform: 'uppercase', letterSpacing: '0.05em', margin: '4px 0 8px' }}>
                    <Icon size={13} /> {deviceLabel(g.type)} ({g.items.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{g.items.map((h) => <HostRow key={h.id} h={h} />)}</div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Histórico de coletas */}
      {history.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.1rem 1.4rem' }}>
          <SectionTitle icon={<History size={13} />} color="var(--muted)">Histórico de coletas ({history.length})</SectionTitle>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' }}>
            {history.map((h, i) => (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                <span title={h.riskLevel} style={{ width: 9, height: 9, borderRadius: '50%', background: rc(h.riskLevel), flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{fmtDate(h.ranAt)}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-mute)', marginTop: 2 }}>{h.trigger === 'watch' ? 'automático' : 'manual'} · {h.hostCount} dispositivos · {h.riskyCount} com achados</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  {(h.newCount > 0 || h.missingCount > 0) && (
                    <span style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>
                      {h.newCount > 0 && <span style={{ color: 'var(--low)' }}>+{h.newCount}</span>}
                      {h.newCount > 0 && h.missingCount > 0 && ' '}
                      {h.missingCount > 0 && <span style={{ color: 'var(--high)' }}>−{h.missingCount}</span>}
                    </span>
                  )}
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: rc(h.riskLevel), minWidth: 26, textAlign: 'right' }}>{h.riskScore}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
function NumStat({ value, label, color, prefix }: { value: number; label: string; color?: string; prefix?: string }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || 'var(--text)', fontFamily: 'var(--mono)' }}>{prefix}{value}</div>
      <div style={{ fontSize: 9.5, color: 'var(--text-mute)', marginTop: 4, letterSpacing: '0.08em' }}>{label}</div>
    </div>
  )
}
function ScoreDeltaBadge({ delta }: { delta: number }) {
  if (!delta) return <span style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', alignItems: 'center', gap: 4 }}><Minus size={12} /> score estável</span>
  const worse = delta > 0
  const color = worse ? 'var(--high)' : 'var(--low)'
  return <span style={{ fontSize: 11, fontWeight: 700, color, display: 'flex', alignItems: 'center', gap: 4 }}>{worse ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {worse ? '+' : ''}{delta} no score</span>
}

function HostRow({ h }: { h: InternalHost }) {
  const sc = h.severity !== 'info' ? SEV_COLOR[h.severity] : null
  const col = deviceColor(h.deviceType)
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${sc || col}`, borderRadius: 8, padding: '0.7rem 0.9rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{h.ip}{h.hostname ? <span style={{ color: 'var(--text-mute)' }}> · {h.hostname}</span> : ''}</div>
          <div style={{ fontSize: 10.5, color: col, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{deviceLabel(h.deviceType)}{h.macVendor ? <span style={{ color: 'var(--text-mute)' }}> · {h.macVendor}</span> : ''}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--text-mute)' }}>{h.openPorts.length} porta(s)</span>
        </div>
      </div>
      {(h.labels.length > 0 || h.openPorts.length > 0) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
          {h.labels.map((l, i) => <span key={i} style={{ fontSize: 9.5, fontWeight: 700, color: sc || 'var(--muted)', background: `color-mix(in srgb, ${sc || 'var(--muted)'} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${sc || 'var(--muted)'} 30%, transparent)`, borderRadius: 99, padding: '2px 8px' }}>{l}</span>)}
          {h.openPorts.slice(0, 8).map((p, i) => <span key={i} style={{ fontSize: 9.5, fontFamily: 'var(--mono)', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 99, padding: '2px 7px' }}>{p.port}{p.service ? `/${p.service}` : ''}</span>)}
        </div>
      )}
    </div>
  )
}
