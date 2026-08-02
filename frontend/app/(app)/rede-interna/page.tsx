'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api, InternalNetworkSummary, InternalNetworkKind } from '@/lib/api'
import { SEV_COLOR } from '@/lib/severity'
import { clickableDivProps } from '@/lib/a11y'
import { Page, PageHeader, Card, Btn, Badge, Kpi, KpiRow, EmptyState, Skeleton } from '@/components/ui/kit'
import {
  Network, Plus, Server, ShieldAlert, HelpCircle, Radio, ChevronRight,
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

export default function RedeInternaPage() {
  const router = useRouter()
  const [nets, setNets] = useState<InternalNetworkSummary[]>([])
  const [loading, setLoading] = useState(true)

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

  const totalHosts = nets.reduce((a, n) => a + (n.hostCount || 0), 0)
  const totalRisky = nets.reduce((a, n) => a + (n.riskyCount || 0), 0)
  const unauth = nets.filter((n) => !n.authorized).length

  return (
    <Page>
      <PageHeader
        icon={<Network size={19} color="var(--purple-light)" />}
        title="Rede Interna"
        subtitle="Descoberta e inventário de redes internas via agente local. Crie uma rede, rode o agente numa máquina dela, e os dispositivos aparecem aqui."
        actions={<Btn variant="primary" href="/rede-interna/novo"><Plus size={15} /> Nova rede</Btn>}
      />

      {!loading && nets.length > 0 && (
        <KpiRow>
          <Kpi icon={<Network size={18} />} color="var(--purple-light)" label="Redes" value={nets.length} />
          <Kpi icon={<Server size={18} />} color="var(--info)" label="Dispositivos" value={totalHosts} />
          <Kpi icon={<ShieldAlert size={18} />} color="var(--high)" label="Com achados" value={totalRisky} />
          <Kpi icon={<HelpCircle size={18} />} color="var(--medium)" label="Não autorizadas" value={unauth} />
        </KpiRow>
      )}

      {/* Lista */}
      {loading ? (
        <Skeleton h={148} />
      ) : nets.length === 0 ? (
        <EmptyState
          icon={<Network size={32} />}
          title="Nenhuma rede cadastrada."
          hint="Uma rede interna é mapeada por um agente que roda dentro dela — a plataforma não alcança a LAN do cliente sozinha."
          action={<Btn variant="primary" href="/rede-interna/novo"><Plus size={14} /> Criar a primeira rede</Btn>}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {nets.map((n) => (
            <div key={n.id} {...clickableDivProps(() => router.push(`/rede-interna/${n.id}`))} style={{ cursor: 'pointer' }}>
              <Card hover pad="1.15rem 1.25rem" style={{ height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {KIND_LABEL[n.kind]} · <Radio size={11} color={n.lastImportAt ? 'var(--low)' : 'var(--text-dim)'} /> {timeAgo(n.lastImportAt)}
                    </div>
                  </div>
                  {/* Mesma leitura do card de Domínio: número grande = score. */}
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: 26, fontWeight: 700, color: rc(n.riskLevel), fontFamily: 'var(--mono)', lineHeight: 1 }}>{n.riskScore}</div>
                    <div style={{ fontSize: 8, color: 'var(--text-mute)', letterSpacing: '0.1em', marginTop: 2 }}>SEGURANÇA</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 20, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Stat label="DISPOSITIVOS" value={n.hostCount} />
                  <Stat label="COM ACHADOS" value={n.riskyCount} color={n.riskyCount > 0 ? 'var(--high)' : undefined} />
                  {!n.authorized && <Badge color="var(--medium)">NÃO AUTORIZADA</Badge>}
                  <ChevronRight size={16} color="var(--text-mute)" style={{ marginLeft: 'auto', alignSelf: 'center' }} />
                </div>
              </Card>
            </div>
          ))}
        </div>
      )}
      <style jsx global>{`.spin { animation: spin 0.9s linear infinite; }`}</style>
    </Page>
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
