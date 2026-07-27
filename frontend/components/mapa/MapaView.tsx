'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api, GraphResponse, DomainSummary, Engagement } from '@/lib/api'
import { SEV_COLOR } from '@/lib/severity'
import { engagementMatchesDomain } from '@/lib/domainMatch'
import { DomainFlow } from '@/components/dominios/DomainFlow'
import { Share2, RefreshCw, Globe, ChevronDown } from 'lucide-react'

// Stat chip — contagem por tipo de nó do grafo (mesmo dado que a árvore usa,
// só resumido aqui em cima como panorama rápido).
// Só os tipos que a árvore de fato desenha (leaks/famílias de stealer ficam
// no módulo Vazamentos — mostrar a contagem aqui sem representação visual
// correspondente é o mesmo problema de "número solto" que motivou a troca.
const STAT_LABEL: Record<string, string> = {
  subdomains: 'Subdomínios', ips: 'IPs', techs: 'Tecnologias',
  exposures: 'Exposições', vulns: 'Vulns',
}

export default function MapaView() {
  const router = useRouter()
  const params = useSearchParams()
  const domainId = params.get('domain')

  const [domains, setDomains] = useState<DomainSummary[]>([])
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [data, setData] = useState<GraphResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.domains.list().then(setDomains).catch(() => {})
    api.engagements.list().then(setEngagements).catch(() => {})
  }, [])

  const load = useCallback(() => {
    if (!domainId) { setData(null); setLoading(false); return }
    setLoading(true); setError(null)
    api.graph.domain(domainId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar o mapa'))
      .finally(() => setLoading(false))
  }, [domainId])
  useEffect(() => { load() }, [load])

  const selectDomain = useCallback((id: string) => { router.push(id ? `/mapa?domain=${id}` : '/mapa') }, [router])
  const currentDomain = domains.find((d) => d.id === domainId) || null
  const domainEngagements = currentDomain ? engagements.filter((e) => engagementMatchesDomain(e.target, currentDomain.domain)) : []

  const hasData = !!data && data.nodes.length > 0
  const stats = data?.stats

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '1rem 1.5rem 0.7rem', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 200 }}>
            <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
              <Share2 size={18} color="var(--purple-light)" /> Mapa de Superfície
            </h1>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '3px 0 0' }}>
              {currentDomain
                ? 'Árvore de subdomínios, correlacionada com vulnerabilidades e engagements deste domínio.'
                : 'Escolha um domínio para ver seu mapa de superfície.'}
            </p>
          </div>

          {/* Seletor de domínio — o mapa é sempre por domínio */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Globe size={13} color="var(--text-mute)" style={{ position: 'absolute', left: 10, pointerEvents: 'none' }} />
            <select
              value={domainId || ''}
              onChange={(e) => selectDomain(e.target.value)}
              style={{
                appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
                background: 'rgba(2,2,8,0.6)', border: '1px solid var(--border-mid)', borderRadius: 8,
                color: domainId ? 'var(--text)' : 'var(--muted)', fontSize: 12.5, fontWeight: 600,
                padding: '7px 30px 7px 30px', fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
                minWidth: 210,
              }}>
              <option value="">Selecione um domínio…</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>{d.name && d.name !== d.domain ? `${d.name} · ${d.domain}` : d.domain}</option>
              ))}
            </select>
            <ChevronDown size={14} color="var(--text-mute)" style={{ position: 'absolute', right: 10, pointerEvents: 'none' }} />
          </div>

          <div style={{ flex: 1 }} />

          {domainId && (
            <IconBtn title="Atualizar" onClick={load}><RefreshCw size={14} /></IconBtn>
          )}
        </div>

        {/* Stats rápidas */}
        {hasData && stats && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            {Object.entries(STAT_LABEL).filter(([k]) => (stats as any)[k] > 0).map(([k, label]) => (
              <span key={k} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600,
                borderRadius: 99, padding: '3px 9px', color: 'var(--muted)',
                background: 'transparent', border: '1px solid var(--border)',
              }}>
                {label} <span style={{ fontFamily: 'var(--mono)', fontSize: 10, opacity: 0.85 }}>{(stats as any)[k]}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Palco */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, margin: '0 0.75rem 0.75rem', borderRadius: 12, overflow: 'hidden', border: hasData ? '1px solid var(--border)' : 'none' }}>
        {!domainId ? (
          <DomainPicker domains={domains} onPick={selectDomain} />
        ) : loading ? (
          <Centered>CARREGANDO…</Centered>
        ) : error ? (
          <Centered><span style={{ color: 'var(--high)' }}>{error}</span></Centered>
        ) : !hasData ? (
          <Centered>
            <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
              <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-mute)', marginBottom: 12 }}><Share2 size={34} /></div>
              <p style={{ fontSize: 14, margin: 0 }}>Este domínio ainda não tem dados para mapear.</p>
              <p style={{ fontSize: 12, margin: '6px 0 0', color: 'var(--text-mute)' }}>Rode um scan em <Link href={`/dominios/${domainId}`} style={{ color: 'var(--purple-light)' }}>Domínios</Link> primeiro.</p>
            </div>
          </Centered>
        ) : (
          <DomainFlow graph={data!} domainLabel={currentDomain!.domain} engagements={domainEngagements} />
        )}
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-mute)', fontSize: 12, letterSpacing: '0.12em' }}>{children}</div>
}

// Seletor de domínio — o mapa é sempre por domínio; sem escolha, mostra os cards.
function DomainPicker({ domains, onPick }: { domains: DomainSummary[]; onPick: (id: string) => void }) {
  if (!domains.length) {
    return (
      <Centered>
        <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-mute)', marginBottom: 12 }}><Globe size={34} /></div>
          <p style={{ fontSize: 14, margin: 0 }}>Nenhum domínio cadastrado.</p>
          <p style={{ fontSize: 12, margin: '6px 0 0', color: 'var(--text-mute)' }}>Adicione um em <Link href="/dominios" style={{ color: 'var(--purple-light)' }}>Domínios</Link>.</p>
        </div>
      </Centered>
    )
  }
  return (
    <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 14px', textAlign: 'center' }}>Selecione um domínio para abrir seu mapa de superfície.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {domains.map((d) => {
            const rc = SEV_COLOR[d.riskLevel] || SEV_COLOR.info
            return (
              <button key={d.id} onClick={() => onPick(d.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.8rem 0.9rem', cursor: 'pointer', fontFamily: 'inherit' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-mid)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: 'color-mix(in srgb, var(--purple) 12%, transparent)', border: '1px solid var(--border-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--purple-light)' }}><Globe size={16} /></div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name || d.domain}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-mute)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.domain}</div>
                </div>
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: rc, fontFamily: 'var(--mono)', lineHeight: 1 }}>{d.riskScore}</div>
                  <div style={{ fontSize: 7.5, color: 'var(--text-mute)', letterSpacing: '0.1em', marginTop: 2 }}>SEGURANÇA</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button title={title} onClick={onClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, background: 'rgba(2,2,8,0.6)', border: '1px solid var(--border-mid)', color: 'var(--purple-light)', cursor: 'pointer' }}>
      {children}
    </button>
  )
}
