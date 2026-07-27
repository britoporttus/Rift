'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api, InternalNetworkSummary, InternalNetworkKind } from '@/lib/api'
import { SEV_COLOR } from '@/lib/severity'
import { clickableDivProps } from '@/lib/a11y'
import {
  Network, Plus, Loader2, Server, ShieldAlert, HelpCircle, Radio, ChevronRight,
} from 'lucide-react'

const KIND_LABEL: Record<InternalNetworkKind, string> = { lan: 'LAN', dmz: 'DMZ', cloud: 'Nuvem', other: 'Outra' }
function rc(level: string) { return SEV_COLOR[level] || SEV_COLOR.info }

function timeAgo(d?: string | null) {
  if (!d) return 'nunca'
  const t = new Date(d).getTime(); if (isNaN(t)) return '—'
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (s < 60) return 'agora'
  const m = Math.floor(s / 60); if (m < 60) return `há ${m} min`
  const h = Math.floor(m / 60); if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text)', fontSize: 13, padding: '9px 11px', fontFamily: 'inherit', outline: 'none',
}

export default function RedeInternaPage() {
  const router = useRouter()
  const [nets, setNets] = useState<InternalNetworkSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<InternalNetworkKind>('lan')
  const [authorized, setAuthorized] = useState(false)
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback((first = false) => {
    if (first) setLoading(true)
    return api.internalNetworks.list().then(setNets).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load(true)
    const iv = setInterval(() => { if (!document.hidden) load() }, 8000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(iv); window.removeEventListener('focus', onFocus) }
  }, [load])

  async function handleCreate() {
    if (!name.trim()) return
    setCreating(true); setErr('')
    try {
      const created = await api.internalNetworks.create({ name: name.trim(), kind, authorized })
      setName(''); setAuthorized(false)
      router.push(`/rede-interna/${created.id}`)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Erro ao criar') }
    finally { setCreating(false) }
  }

  const totalHosts = nets.reduce((a, n) => a + (n.hostCount || 0), 0)
  const totalRisky = nets.reduce((a, n) => a + (n.riskyCount || 0), 0)
  const unauth = nets.filter((n) => !n.authorized).length

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1280, margin: '0 auto', width: '100%' }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
          <Network size={19} color="var(--purple-light)" /> Rede Interna
        </h1>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Descoberta e inventário de redes internas via agente local. Crie uma rede, rode o agente numa máquina dela, e os dispositivos aparecem aqui.
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Kpi icon={<Network size={17} />} color="var(--purple)" label="Redes" value={nets.length} />
        <Kpi icon={<Server size={17} />} color="var(--info)" label="Dispositivos" value={totalHosts} />
        <Kpi icon={<ShieldAlert size={17} />} color="var(--high)" label="Com achados" value={totalRisky} />
        <Kpi icon={<HelpCircle size={17} />} color="var(--medium)" label="Não autorizadas" value={unauth} />
      </div>

      {/* Criar */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da rede (ex.: Cliente X — LAN Matriz)"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()} style={{ ...inputStyle, flex: 1, minWidth: 220 }} />
          <select value={kind} onChange={(e) => setKind(e.target.value as InternalNetworkKind)} style={inputStyle}>
            {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button onClick={handleCreate} disabled={creating || !name.trim()} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'var(--purple)', border: 'none',
            borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: creating ? 'default' : 'pointer',
            opacity: !name.trim() ? 0.5 : 1, fontFamily: 'inherit', boxShadow: '0 0 18px var(--purple-glow-strong)',
          }}>
            {creating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Adicionar rede
          </button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--muted)' }}>
          <input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--purple)' }} />
          Confirmo que tenho autorização para escanear esta rede (necessário para o agente coletar dados).
        </label>
        {err && <div style={{ fontSize: 12, color: 'var(--critical)' }}>{err}</div>}
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ color: 'var(--text-mute)', fontSize: 12, letterSpacing: '0.1em' }}>CARREGANDO...</div>
      ) : nets.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px dashed var(--border-mid)', borderRadius: 12, padding: '2.5rem', textAlign: 'center', color: 'var(--text-mute)', fontSize: 13 }}>
          Nenhuma rede cadastrada. Crie a primeira acima.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {nets.map((n) => (
            <div key={n.id} {...clickableDivProps(() => router.push(`/rede-interna/${n.id}`))} style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.1rem 1.25rem', cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {KIND_LABEL[n.kind]} · <Radio size={11} color={n.lastImportAt ? 'var(--low)' : 'var(--text-dim)'} /> {timeAgo(n.lastImportAt)}
                  </div>
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: rc(n.riskLevel), fontFamily: 'var(--mono)', lineHeight: 1 }}>{n.riskScore}</div>
              </div>
              <div style={{ display: 'flex', gap: 20, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <Stat label="DISPOSITIVOS" value={n.hostCount} />
                <Stat label="COM ACHADOS" value={n.riskyCount} color={n.riskyCount > 0 ? 'var(--high)' : undefined} />
                {!n.authorized && <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--medium)', background: 'color-mix(in srgb, var(--medium) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--medium) 30%, transparent)', borderRadius: 99, padding: '2px 8px', alignSelf: 'center' }}>NÃO AUTORIZADA</span>}
                <ChevronRight size={16} color="var(--text-mute)" style={{ marginLeft: 'auto', alignSelf: 'center' }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <style jsx global>{`.spin { animation: spin 0.9s linear infinite; }`}</style>
    </div>
  )
}

function Kpi({ icon, color, label, value }: { icon: React.ReactNode; color: string; label: string; value: number }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${color}`, borderRadius: 10, padding: '0.9rem 1.1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>{icon}</div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 9.5, color: 'var(--text-mute)', marginTop: 4, letterSpacing: '0.08em' }}>{label}</div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || 'var(--text)', fontFamily: 'var(--mono)' }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--text-mute)', marginTop: 3, letterSpacing: '0.08em' }}>{label}</div>
    </div>
  )
}
