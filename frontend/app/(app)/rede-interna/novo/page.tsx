'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, InternalNetworkKind } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { AgentSetup } from '@/components/rede-interna/AgentSetup'
import {
  ArrowLeft, ArrowRight, Network, Loader2, Gauge, Zap, AlertTriangle, Check, ShieldCheck,
} from 'lucide-react'

// Config + execução do scan de rede interna (reforma de UX 2026-07). Fase 1: nome +
// tipo + profundidade + pré-requisitos + autorização. Fase 2 (após criar): o comando
// do agente (reusa AgentSetup) + botão "Escanear" que leva aos resultados. A VPS não
// alcança a LAN — quem varre é o agente na máquina interna; "Escanear" só consolida.

const KIND_LABEL: Record<InternalNetworkKind, string> = { lan: 'LAN', dmz: 'DMZ', cloud: 'Nuvem', other: 'Outra' }

const DEPTHS: Array<{ id: 'medium' | 'full'; label: string; icon: typeof Gauge; hint: string; sub: string }> = [
  { id: 'medium', label: 'Médio', icon: Gauge, hint: 'recomendado', sub: 'As ~54 portas que mais importam para classificar dispositivos e achados. Rápido — ideal para a maioria das redes.' },
  { id: 'full', label: 'Full', icon: Zap, hint: 'mais completo', sub: 'Todas as portas bem-conhecidas (1–1024) + extras. Encontra mais serviços, porém bem mais lento.' },
]

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text)', fontSize: 13, padding: '10px 12px', fontFamily: 'inherit', outline: 'none', width: '100%',
}
const labelStyle: React.CSSProperties = { color: 'var(--muted)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', display: 'block', marginBottom: 7 }

export default function RedeInternaNovoPage() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [name, setName] = useState('')
  const [kind, setKind] = useState<InternalNetworkKind>('lan')
  const [depth, setDepth] = useState<'medium' | 'full'>('medium')
  const [authorized, setAuthorized] = useState(false)
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState('')
  const [netId, setNetId] = useState<string | null>(null)   // preenchido após criar → fase 2

  async function handleCreate() {
    if (!name.trim() || !authorized) return
    setCreating(true); setErr('')
    try {
      const created = await api.internalNetworks.create({ name: name.trim(), kind, scanDepth: depth, authorized })
      setNetId(created.id)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Erro ao criar') }
    finally { setCreating(false) }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 780, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <Link href={netId ? '/rede-interna' : '/novo-pentest'} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-mute)', fontSize: 12, textDecoration: 'none', marginBottom: 14 }}>
          <ArrowLeft size={14} /> {netId ? 'Redes internas' : 'Novo Pentest'}
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 9 }}>
          <Network size={20} color="var(--purple-light)" /> Mapear rede interna
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '5px 0 0', maxWidth: 620, lineHeight: 1.5 }}>
          {netId
            ? 'Rede criada. Rode o comando abaixo numa máquina dentro da rede — os dispositivos aparecem nos resultados conforme o agente reporta.'
            : 'A plataforma não alcança a sua LAN: um agente roda numa máquina interna e envia o inventário de volta. Configure e gere o comando.'}
        </p>
      </div>

      {!netId ? (
        // ── Fase 1: configuração ──────────────────────────────────────────────
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={labelStyle} htmlFor="net-name">Nome do scan</label>
              <input id="net-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreate()} placeholder="ex.: Cliente X — LAN Matriz" style={inputStyle} />
            </div>
            <div style={{ width: 150 }}>
              <label style={labelStyle} htmlFor="net-kind">Tipo</label>
              <select id="net-kind" value={kind} onChange={(e) => setKind(e.target.value as InternalNetworkKind)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Profundidade</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              {DEPTHS.map((d) => {
                const Icon = d.icon
                const active = depth === d.id
                return (
                  <button key={d.id} type="button" onClick={() => setDepth(d.id)} style={{
                    textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                    background: active ? 'rgba(124,58,237,.12)' : 'var(--bg)', border: `1px solid ${active ? 'var(--purple)' : 'var(--border)'}`,
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon size={15} color={active ? 'var(--purple-light)' : 'var(--muted)'} />
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: active ? 'var(--purple-light)' : 'var(--text)' }}>{d.label}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-mute)', fontFamily: 'var(--mono)' }}>· {d.hint}</span>
                      {active && <Check size={14} color="var(--purple-light)" style={{ marginLeft: 'auto' }} />}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.45 }}>{d.sub}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Pré-requisitos */}
          <div style={{ display: 'flex', gap: 10, padding: '0.85rem 1rem', background: 'color-mix(in srgb, var(--medium) 9%, transparent)', border: '1px solid color-mix(in srgb, var(--medium) 28%, transparent)', borderRadius: 10 }}>
            <AlertTriangle size={16} color="var(--medium)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.55 }}>
              <b>Pré-requisitos na máquina de scan:</b> instale <span style={{ fontFamily: 'var(--mono)', color: 'var(--purple-light)' }}>nmap</span> e, no Windows, o <span style={{ fontFamily: 'var(--mono)', color: 'var(--purple-light)' }}>npcap</span>. Faz toda a diferença — sem eles o agente cai para uma varredura nativa degradada (sem versão de serviço nem detecção de OS).
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 12.5, color: 'var(--muted)' }}>
            <input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--purple)', flexShrink: 0 }} />
            <span><ShieldCheck size={13} style={{ verticalAlign: -2, marginRight: 4, color: 'var(--low)' }} />Confirmo que tenho autorização para escanear esta rede (necessário para o agente coletar dados).</span>
          </label>

          {err && <div style={{ fontSize: 12.5, color: 'var(--critical)' }}>{err}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Link href="/novo-pentest" style={{ color: 'var(--muted)', fontSize: 12.5, textDecoration: 'none', padding: '0.6rem 0.5rem' }}>Cancelar</Link>
            <button type="button" onClick={handleCreate} disabled={creating || !name.trim() || !authorized} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, background: (name.trim() && authorized) ? 'var(--purple)' : 'var(--border)', border: 'none',
              borderRadius: 8, color: 'white', fontSize: 13.5, fontWeight: 700, padding: '0.6rem 1.3rem',
              cursor: (creating || !name.trim() || !authorized) ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              boxShadow: (name.trim() && authorized) ? '0 0 18px var(--purple-glow-strong)' : 'none',
            }}>
              {creating ? <><Loader2 size={14} className="spin" /> Criando…</> : <>Gerar comando <ArrowRight size={14} /></>}
            </button>
          </div>
        </div>
      ) : (
        // ── Fase 2: comando do agente + ir para resultados ────────────────────
        <>
          {isAdmin ? (
            <AgentSetup networkId={netId} authorized={authorized} />
          ) : (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem', fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>
              Rede criada. O comando do agente (com o token) é exibido para um administrador — peça a um admin para gerar/rodar o comando nesta rede.
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => router.push(`/rede-interna/${netId}`)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--purple)', border: 'none',
              borderRadius: 8, color: 'white', fontSize: 13.5, fontWeight: 700, padding: '0.6rem 1.3rem', cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 0 18px var(--purple-glow-strong)',
            }}>
              Escanear — ver resultados <ArrowRight size={14} />
            </button>
          </div>
        </>
      )}

      <style jsx global>{`.spin { animation: spin 0.9s linear infinite; }`}</style>
    </div>
  )
}
