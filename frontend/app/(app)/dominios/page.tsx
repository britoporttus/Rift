'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api, DomainSummary } from '@/lib/api'
import { SEV_COLOR } from '@/lib/severity'
import { clickableDivProps } from '@/lib/a11y'
import { HBars } from '@/components/ui/charts/HBars'
import {
  Globe, Plus, ShieldCheck, ShieldAlert, Radar, Loader2, Server,
  AlertTriangle, Lock,
} from 'lucide-react'

const KIND_ORDER = ['vendor', 'partner', 'internal', 'other'] as const
const KIND_COLOR: Record<string, string> = {
  vendor: 'var(--purple-light)', partner: 'var(--info)', internal: 'var(--low)', other: 'var(--text-mute)',
}

const STEP_LABEL: Record<string, string> = {
  subdomains: 'subdomínios', dns: 'DNS', http: 'probe web',
  exposures: 'exposições', takeover: 'takeover', ports: 'portas', scoring: 'score', done: 'concluído',
}
const KIND_LABEL: Record<string, string> = { vendor: 'Fornecedor', partner: 'Parceiro', internal: 'Interno', other: 'Outro' }

function riskColor(level: string) { return SEV_COLOR[level] || SEV_COLOR.info }

const inputStyle: React.CSSProperties = {
  background: 'rgba(2,2,8,0.6)', border: '1px solid var(--border-mid)', borderRadius: 6,
  color: 'var(--text)', fontSize: 12, padding: '5px 9px', fontFamily: 'inherit', outline: 'none', minWidth: 120,
}

export default function DominiosPage() {
  const router = useRouter()
  const [domains, setDomains] = useState<DomainSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [newDomain, setNewDomain] = useState('')
  const [newKind, setNewKind] = useState('vendor')
  const [creating, setCreating] = useState(false)
  const [scanning, setScanning] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

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

  const totalLeaks = domains.reduce((a, d) => a + (d.leakCount || 0), 0)
  const atRisk = domains.filter((d) => d.riskLevel === 'critical' || d.riskLevel === 'high').length
  const unauthorizedCount = domains.filter((d) => !d.authorized).length
  const kindData = KIND_ORDER
    .map((k) => ({ label: KIND_LABEL[k], value: domains.filter((d) => d.kind === k).length, color: KIND_COLOR[k] }))
    .filter((k) => k.value > 0)

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1280, margin: '0 auto', width: '100%' }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 9 }}>
          <Globe size={19} color="var(--purple-light)" /> Domínios
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '3px 0 0' }}>
          Análise de superfície (ASM) passiva e score de segurança por domínio — fornecedores, parceiros e ativos próprios.
        </p>
      </div>

      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <Kpi label="Domínios" value={domains.length} color="var(--purple-light)" icon={<Globe size={18} />} />
          <Kpi label="Em risco alto/crítico" value={atRisk} color="var(--high)" icon={<AlertTriangle size={18} />} />
          <Kpi label="Não autorizados" value={unauthorizedCount} color="var(--medium)" icon={<Lock size={18} />} />
          <Kpi label="Credenciais vazadas" value={totalLeaks} color="var(--critical)" icon={<ShieldAlert size={18} />} />
        </div>
      )}

      {!loading && kindData.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem 1.4rem' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 18, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Domínios por tipo
          </div>
          <HBars data={kindData} />
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.9rem 1.1rem', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={newDomain} onChange={(e) => setNewDomain(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreate()} placeholder="fornecedor.com"
          style={{ ...inputStyle, flex: 1, minWidth: 200, fontFamily: 'var(--mono)' }} />
        <select value={newKind} onChange={(e) => setNewKind(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="vendor">Fornecedor</option>
          <option value="partner">Parceiro</option>
          <option value="internal">Interno</option>
          <option value="other">Outro</option>
        </select>
        <button onClick={handleCreate} disabled={creating || !newDomain.trim()}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', background: 'var(--purple)', border: 'none', borderRadius: 7, color: 'white', fontSize: 12.5, fontWeight: 700, cursor: creating ? 'default' : 'pointer', opacity: creating || !newDomain.trim() ? 0.6 : 1, fontFamily: 'inherit', boxShadow: '0 0 18px var(--purple-glow-strong)' }}>
          {creating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Adicionar
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {[0, 1, 2].map((i) => <div key={i} style={{ height: 150, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, animation: 'pulse 1.4s ease-in-out infinite' }} />)}
        </div>
      ) : domains.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px dashed var(--border-mid)', borderRadius: 12, padding: '3.5rem', textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ margin: '0 auto 1rem', display: 'flex', justifyContent: 'center', color: 'var(--text-mute)' }}><Radar size={34} /></div>
          <p style={{ fontSize: 14, margin: 0 }}>Nenhum domínio ainda.</p>
          <p style={{ fontSize: 12, margin: '6px 0 0', color: 'var(--text-mute)' }}>Adicione um fornecedor acima para mapear a superfície.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {domains.map((d) => {
            const isH = hovered === d.id
            const rc = riskColor(d.riskLevel)
            const isScanning = d.scanState === 'scanning'
            return (
              <div key={d.id} {...clickableDivProps(() => router.push(`/dominios/${d.id}`))}
                onMouseEnter={() => setHovered(d.id)} onMouseLeave={() => setHovered(null)}
                style={{ background: 'var(--surface)', border: `1px solid ${isH ? 'var(--border-mid)' : 'var(--border)'}`, borderRadius: 12, padding: '1.25rem', cursor: 'pointer', transition: 'all 0.13s', boxShadow: isH ? '0 6px 24px rgba(124,58,237,0.14)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name || d.domain}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-mute)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.domain}</div>
                  </div>
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: 26, fontWeight: 700, color: rc, fontFamily: 'var(--mono)', lineHeight: 1 }}>{d.riskScore}</div>
                    <div style={{ fontSize: 8, color: 'var(--text-mute)', letterSpacing: '0.1em', marginTop: 2 }}>SEGURANÇA</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  <Badge color="var(--purple-light)">{KIND_LABEL[d.kind] || d.kind}</Badge>
                  {d.authorized
                    ? <Badge color="var(--low)" icon={<ShieldCheck size={9} />}>autorizado</Badge>
                    : <Badge color="var(--text-mute)" icon={<Lock size={9} />}>passivo</Badge>}
                  {d.leakCount > 0 && <Badge color="var(--critical)" icon={<ShieldAlert size={9} />}>{d.leakCount} vazado(s)</Badge>}
                </div>

                <div style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
                  <Stat icon={<Server size={12} />} label="ativos" value={d.assetCount} />
                  <Stat icon={<Globe size={12} />} label="vivos" value={d.aliveCount} />
                  <Stat icon={<AlertTriangle size={12} />} label="exposições" value={d.exposureCount} />
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
                  <button onClick={(ev) => handleScan(d.id, ev)} disabled={isScanning || scanning === d.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 11px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: isScanning ? 'default' : 'pointer', fontFamily: 'inherit', background: 'color-mix(in srgb, var(--purple) 14%, transparent)', border: '1px solid var(--border-mid)', color: 'var(--purple-light)', opacity: isScanning ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                    {isScanning || scanning === d.id ? <Loader2 size={12} className="spin" /> : <Radar size={12} />} Escanear
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <style jsx global>{`.spin { animation: spin 0.9s linear infinite; }`}</style>
    </div>
  )
}

function Kpi({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.9rem 1.1rem', display: 'flex', alignItems: 'center', gap: 12, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: color }} />
      <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>{icon}</div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: 'var(--mono)', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontWeight: 600 }}>{label}</div>
      </div>
    </div>
  )
}

function Badge({ children, color, icon }: { children: React.ReactNode; color: string; icon?: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 700, borderRadius: 99, padding: '2px 8px', letterSpacing: '0.03em', background: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`, color }}>
      {icon}{children}
    </span>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ color: 'var(--text-mute)' }}>{icon}</span>{value}
      </span>
      <span style={{ fontSize: 9, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
    </div>
  )
}
