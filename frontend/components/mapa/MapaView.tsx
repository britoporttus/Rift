'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import ForceGraph2D from 'react-force-graph-2d'
import { api, GraphNode, GraphEdge, GraphResponse, GraphNodeType, DomainSummary } from '@/lib/api'
import { SEV_COLOR, safeHref } from '@/lib/severity'
import {
  Share2, RotateCcw, RefreshCw, Search, X, ExternalLink, ChevronDown,
  Globe, Server, Network, Cpu, HardDrive, AlertTriangle, Bug, Skull, KeyRound, Database,
} from 'lucide-react'

// ── Estilo por tipo de nó (cor + rótulo + ícone) ─────────────────────────────────
const TYPE: Record<GraphNodeType, { color: string; label: string; Icon: typeof Globe }> = {
  domain:         { color: '#A78BFA', label: 'Domínios',    Icon: Globe },
  subdomain:      { color: '#7C3AED', label: 'Subdomínios', Icon: Server },
  ip:             { color: '#3B82F6', label: 'IPs',         Icon: Network },
  tech:           { color: '#64748B', label: 'Tecnologias', Icon: Cpu },
  webserver:      { color: '#38BDF8', label: 'Servidores',  Icon: HardDrive },
  exposure:       { color: '#F97316', label: 'Exposições',  Icon: AlertTriangle },
  vuln:           { color: '#EF4444', label: 'Vulns',       Icon: Bug },
  stealer_family: { color: '#EC4899', label: 'Stealers',    Icon: Skull },
  leaked_account: { color: '#F43F5E', label: 'Contas',      Icon: KeyRound },
  breach:         { color: '#EAB308', label: 'Breaches',    Icon: Database },
}
const ALL_TYPES = Object.keys(TYPE) as GraphNodeType[]
const KIND_LABEL: Record<string, string> = { vendor: 'Fornecedor', partner: 'Parceiro', internal: 'Interno', other: 'Outro' }
const LEAK_TYPES = new Set<GraphNodeType>(['leaked_account', 'breach', 'stealer_family'])

// Cor base de um nó (vuln/exposição usam a cor da severidade — critical/high em
// vermelho/laranja, como pede o roadmap).
function baseColor(n: GraphNode): string {
  if ((n.type === 'vuln' || n.type === 'exposure') && typeof n.meta.severity === 'string') {
    return SEV_COLOR[n.meta.severity as string] || TYPE[n.type].color
  }
  return TYPE[n.type].color
}

// Tamanho por importância: domínio pelo riskScore; vuln/exposição pela severidade;
// hubs (ip/tech/família…) pela contagem de compartilhamento; resto pelo grau.
const SEV_WEIGHT: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2.2, info: 1.6 }
function nodeVal(n: GraphNode, degree: number): number {
  const m = n.meta || {}
  const count = Number(m.count) || 1
  switch (n.type) {
    case 'domain':         return 5 + Math.min(9, (Number(m.riskScore) || 0) / 11)
    case 'ip':             return 1.6 + Math.min(6, count)
    case 'tech':           return 1.1 + Math.min(4, count * 0.6)
    case 'webserver':      return 1.2 + Math.min(3.5, count)
    case 'stealer_family': return 2 + Math.min(5, count)
    case 'breach':         return 2 + Math.min(4, count)
    case 'vuln':
    case 'exposure':       return SEV_WEIGHT[String(m.severity)] || 2
    case 'subdomain':      return 1.5 + Math.min(3, degree * 0.22)
    case 'leaked_account': return 1.6
    default:               return 1.5
  }
}

function withAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
const idOf = (x: unknown): string => (x && typeof x === 'object' ? (x as { id: string }).id : String(x))
const linkKey = (l: { source: unknown; target: unknown; type: string }) => `${idOf(l.source)}|${idOf(l.target)}|${l.type}`

// Nós/arestas com campos internos de render anexados.
type FNode = GraphNode & { __color: string; __val: number; x?: number; y?: number }
type FLink = GraphEdge & { __s: string; __t: string }

export default function MapaView() {
  const router = useRouter()
  const params = useSearchParams()
  const domainId = params.get('domain')

  const [domains, setDomains] = useState<DomainSummary[]>([])
  const [data, setData] = useState<GraphResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState<Set<GraphNodeType>>(new Set(ALL_TYPES))
  const [selected, setSelected] = useState<FNode | null>(null)
  const [query, setQuery] = useState('')
  const [hlNodes, setHlNodes] = useState<Set<string>>(new Set())
  const [hlLinks, setHlLinks] = useState<Set<string>>(new Set())
  const [size, setSize] = useState({ w: 0, h: 0 })

  const fgRef = useRef<any>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const firstFit = useRef(false)

  // Lista de domínios para o seletor (o mapa é SEMPRE por domínio).
  useEffect(() => { api.domains.list().then(setDomains).catch(() => {}) }, [])

  // ── Carregamento do grafo (só quando há domínio escolhido) ──────────────────────
  const load = useCallback(() => {
    if (!domainId) { setData(null); setLoading(false); return }
    setLoading(true); setError(null); firstFit.current = false
    api.graph.domain(domainId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar o mapa'))
      .finally(() => setLoading(false))
  }, [domainId])
  useEffect(() => { load() }, [load])

  const selectDomain = useCallback((id: string) => { router.push(id ? `/mapa?domain=${id}` : '/mapa') }, [router])
  const currentDomain = domains.find((d) => d.id === domainId) || null

  // Ao trocar de escopo (global ↔ domínio), limpa seleção/realce/filtros.
  useEffect(() => { setSelected(null); setHlNodes(new Set()); setHlLinks(new Set()); setVisible(new Set(ALL_TYPES)) }, [domainId])

  // ── Medição do container (ForceGraph precisa de w/h em px) ──────────────────────
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Estruturas derivadas ────────────────────────────────────────────────────────
  const degree = useMemo(() => {
    const d = new Map<string, number>()
    for (const e of data?.edges || []) { d.set(e.source, (d.get(e.source) || 0) + 1); d.set(e.target, (d.get(e.target) || 0) + 1) }
    return d
  }, [data])

  const adjacency = useMemo(() => {
    const a = new Map<string, Set<string>>()
    const l = new Map<string, Set<string>>()
    const add = (from: string, to: string, k: string) => {
      if (!a.has(from)) a.set(from, new Set()); a.get(from)!.add(to)
      if (!l.has(from)) l.set(from, new Set()); l.get(from)!.add(k)
    }
    for (const e of data?.edges || []) {
      const k = `${e.source}|${e.target}|${e.type}`
      add(e.source, e.target, k); add(e.target, e.source, k)
    }
    return { neighbors: a, links: l }
  }, [data])

  const nodeById = useMemo(() => new Map((data?.nodes || []).map((n) => [n.id, n])), [data])
  const typeCounts = useMemo(() => {
    const c = new Map<GraphNodeType, number>()
    for (const n of data?.nodes || []) c.set(n.type, (c.get(n.type) || 0) + 1)
    return c
  }, [data])

  // Objetos de nó/aresta criados UMA vez por carga → force-graph guarda x/y neles,
  // então alternar filtros preserva as posições (não re-simula do zero).
  const allNodes = useMemo<FNode[]>(
    () => (data?.nodes || []).map((n) => ({ ...n, __color: baseColor(n), __val: nodeVal(n, degree.get(n.id) || 0) })),
    [data, degree],
  )
  const allLinks = useMemo<FLink[]>(
    () => (data?.edges || []).map((e) => ({ ...e, __s: e.source, __t: e.target })),
    [data],
  )

  const graphData = useMemo(() => {
    const nodes = allNodes.filter((n) => visible.has(n.type))
    const vis = new Set(nodes.map((n) => n.id))
    const links = allLinks.filter((l) => vis.has(l.__s) && vis.has(l.__t))
    return { nodes, links }
  }, [allNodes, allLinks, visible])

  // ── Interações ──────────────────────────────────────────────────────────────────
  const handleHover = useCallback((node: any) => {
    if (!node) { setHlNodes(new Set()); setHlLinks(new Set()); return }
    const hn = new Set<string>([node.id])
    for (const nb of adjacency.neighbors.get(node.id) || []) hn.add(nb)
    setHlNodes(hn)
    setHlLinks(new Set(adjacency.links.get(node.id) || []))
  }, [adjacency])

  const focusNode = useCallback((node: FNode | null) => {
    setSelected(node)
    if (node && fgRef.current && typeof node.x === 'number' && typeof node.y === 'number') {
      fgRef.current.centerAt(node.x, node.y, 600)
      fgRef.current.zoom(Math.max(3, fgRef.current.zoom?.() || 1), 600)
    }
  }, [])

  const doSearch = useCallback(() => {
    const q = query.trim().toLowerCase()
    if (!q) return
    const hit = graphData.nodes.find((n) => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q))
    if (hit) {
      focusNode(hit as FNode)
      const hn = new Set<string>([hit.id]); for (const nb of adjacency.neighbors.get(hit.id) || []) hn.add(nb)
      setHlNodes(hn); setHlLinks(new Set(adjacency.links.get(hit.id) || []))
    }
  }, [query, graphData, focusNode, adjacency])

  const resetView = useCallback(() => { fgRef.current?.zoomToFit(500, 60); setSelected(null); setHlNodes(new Set()); setHlLinks(new Set()) }, [])

  function toggleType(t: GraphNodeType) {
    setVisible((prev) => { const next = new Set(prev); next.has(t) ? next.delete(t) : next.add(t); return next })
  }

  // Domínios conectados ao nó selecionado (para navegar até a origem).
  const connectedDomains = useMemo(() => {
    if (!selected) return [] as GraphNode[]
    const out: GraphNode[] = []
    for (const nb of adjacency.neighbors.get(selected.id) || []) {
      const node = nodeById.get(nb); if (node?.type === 'domain') out.push(node)
    }
    return out
  }, [selected, adjacency, nodeById])

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
                ? 'Ativos, IPs, tecnologias, exposições, vulns e vazamentos deste domínio, interligados.'
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

          {/* Busca + ações (só com domínio escolhido) */}
          {domainId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(2,2,8,0.6)', border: '1px solid var(--border-mid)', borderRadius: 7, padding: '4px 8px' }}>
                <Search size={13} color="var(--text-mute)" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()}
                  placeholder="buscar nó…"
                  style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 12, width: 130, fontFamily: 'inherit' }} />
                {query && <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-mute)', display: 'flex' }}><X size={12} /></button>}
              </div>
              <IconBtn title="Reenquadrar" onClick={resetView}><RotateCcw size={14} /></IconBtn>
              <IconBtn title="Atualizar" onClick={load}><RefreshCw size={14} /></IconBtn>
            </div>
          )}
        </div>

        {/* Stats + chips de filtro */}
        {hasData && stats && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            {ALL_TYPES.filter((t) => (typeCounts.get(t) || 0) > 0).map((t) => {
              const on = visible.has(t)
              const { color, label, Icon } = TYPE[t]
              return (
                <button key={t} onClick={() => toggleType(t)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                    borderRadius: 99, padding: '3px 9px', cursor: 'pointer', transition: 'all 0.12s',
                    background: on ? withAlpha(color, 0.13) : 'transparent',
                    border: `1px solid ${on ? withAlpha(color, 0.4) : 'var(--border)'}`,
                    color: on ? color : 'var(--text-mute)',
                    opacity: on ? 1 : 0.55,
                  }}>
                  <Icon size={11} /> {label}
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, opacity: 0.85 }}>{typeCounts.get(t)}</span>
                </button>
              )
            })}
            {stats.truncated > 0 && (
              <span title="O grafo foi limitado por segurança; refine com os filtros." style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--high)', border: '1px solid color-mix(in srgb, var(--high) 30%, transparent)', borderRadius: 99, padding: '3px 9px' }}>
                <AlertTriangle size={11} /> {stats.truncated} nó(s) truncado(s)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Palco do grafo */}
      <div ref={wrapRef} style={{ flex: 1, position: 'relative', minHeight: 0, margin: '0 0.75rem 0.75rem', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', background: 'rgba(2,2,8,0.35)' }}>
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
          size.w > 0 && (
            <ForceGraph2D
              ref={fgRef}
              width={size.w}
              height={size.h}
              graphData={graphData}
              backgroundColor="rgba(0,0,0,0)"
              nodeRelSize={3}
              nodeVal={(n: any) => n.__val}
              nodeColor={(n: any) => (hlNodes.size === 0 ? n.__color : hlNodes.has(n.id) ? n.__color : withAlpha(n.__color, 0.1))}
              nodeLabel={(n: any) => `${TYPE[n.type as GraphNodeType].label.replace(/s$/, '')}: ${n.label}`}
              nodeCanvasObjectMode={() => 'after'}
              nodeCanvasObject={(n: any, ctx: CanvasRenderingContext2D, scale: number) => {
                const r = Math.sqrt(n.__val) * 3
                const dimmed = hlNodes.size > 0 && !hlNodes.has(n.id)
                if (selected?.id === n.id) {
                  ctx.beginPath(); ctx.arc(n.x, n.y, r + 3, 0, 2 * Math.PI)
                  ctx.strokeStyle = '#A78BFA'; ctx.lineWidth = 1.6 / scale; ctx.stroke()
                }
                const show = n.type === 'domain' || selected?.id === n.id || hlNodes.has(n.id) || (hlNodes.size === 0 && scale > 2.4)
                if (!show || dimmed) return
                const label: string = n.label.length > 24 ? n.label.slice(0, 23) + '…' : n.label
                const fontSize = 11 / scale
                ctx.font = `${n.type === 'domain' ? 600 : 400} ${fontSize}px 'Space Grotesk', sans-serif`
                ctx.textAlign = 'center'; ctx.textBaseline = 'top'
                const tw = ctx.measureText(label).width
                const y = n.y + r + 1.5 / scale
                ctx.fillStyle = 'rgba(5,5,16,0.7)'
                ctx.fillRect(n.x - tw / 2 - 2 / scale, y, tw + 4 / scale, fontSize + 2 / scale)
                ctx.fillStyle = n.type === 'domain' ? '#E2E8F0' : '#B9B9D6'
                ctx.fillText(label, n.x, y + 1 / scale)
              }}
              linkColor={(l: any) => (hlLinks.size === 0 ? 'rgba(124,58,237,0.14)' : hlLinks.has(linkKey(l)) ? 'rgba(167,139,250,0.6)' : 'rgba(124,58,237,0.03)')}
              linkWidth={(l: any) => (hlLinks.has(linkKey(l)) ? 1.8 : 0.5)}
              linkDirectionalParticles={0}
              onNodeHover={handleHover}
              onNodeClick={(n: any) => focusNode(n as FNode)}
              onBackgroundClick={() => { setSelected(null); setHlNodes(new Set()); setHlLinks(new Set()) }}
              onEngineStop={() => { if (!firstFit.current) { firstFit.current = true; fgRef.current?.zoomToFit(400, 60) } }}
              cooldownTicks={120}
            />
          )
        )}

        {/* Painel de detalhe do nó */}
        {selected && (
          <div style={{
            position: 'absolute', top: 12, right: 12, width: 290, maxHeight: 'calc(100% - 24px)', overflowY: 'auto',
            background: 'var(--panel)', border: '1px solid var(--border-mid)', borderRadius: 12, padding: '0.9rem 1rem',
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: selected.__color, flexShrink: 0, boxShadow: `0 0 8px ${selected.__color}` }} />
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
                  {TYPE[selected.type].label.replace(/s$/, '')}
                </span>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-mute)', display: 'flex' }}><X size={15} /></button>
            </div>

            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', wordBreak: 'break-all', fontFamily: selected.type === 'tech' || selected.type === 'stealer_family' || selected.type === 'breach' ? 'inherit' : 'var(--mono)', marginBottom: 10 }}>
              {selected.label}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
              {metaRows(selected).map((row) => (
                <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11.5 }}>
                  <span style={{ color: 'var(--text-mute)' }}>{row.k}</span>
                  <span style={{ color: 'var(--muted)', textAlign: 'right', wordBreak: 'break-word', maxWidth: 170 }}>{row.v}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11.5 }}>
                <span style={{ color: 'var(--text-mute)' }}>Conexões</span>
                <span style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{degree.get(selected.id) || 0}</span>
              </div>
            </div>

            {/* Ações → origem */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {selected.type === 'domain' && selected.meta.domainId != null && (
                <PanelBtn onClick={() => router.push(`/dominios/${selected.meta.domainId}`)}><Globe size={13} /> Abrir em Domínios</PanelBtn>
              )}
              {selected.type === 'domain' && (
                <PanelBtn onClick={() => router.push(`/vazamentos/${encodeURIComponent(selected.label)}`)}><Database size={13} /> Ver vazamentos</PanelBtn>
              )}
              {selected.type === 'subdomain' && selected.meta.domainId != null && (
                <PanelBtn onClick={() => router.push(`/dominios/${selected.meta.domainId}`)}><Globe size={13} /> Abrir domínio</PanelBtn>
              )}
              {(selected.type === 'subdomain' || selected.type === 'exposure') && (() => {
                const raw = selected.type === 'exposure' || selected.meta.assetType === 'url'
                  ? String(selected.meta.value ?? selected.label)
                  : `${selected.meta.scheme || 'https'}://${selected.label}`
                const href = safeHref(raw)
                return href ? <PanelLink href={href}><ExternalLink size={13} /> Abrir URL</PanelLink> : null
              })()}
              {selected.type === 'vuln' && (
                <PanelBtn onClick={() => router.push('/findings')}><Bug size={13} /> Ver em Findings</PanelBtn>
              )}
              {LEAK_TYPES.has(selected.type) && connectedDomains.slice(0, 3).map((d) => (
                <PanelBtn key={d.id} onClick={() => router.push(`/vazamentos/${encodeURIComponent(d.label)}`)}><Database size={13} /> Vazamentos de {d.label}</PanelBtn>
              ))}
              {(selected.type === 'ip' || selected.type === 'tech' || selected.type === 'webserver') && connectedDomains.slice(0, 4).map((d) => (
                <PanelBtn key={d.id} onClick={() => router.push(`/dominios/${d.meta.domainId}`)}><Globe size={13} /> {d.label}</PanelBtn>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Metadados por tipo (linha k/v) ────────────────────────────────────────────────
function metaRows(n: GraphNode): { k: string; v: string }[] {
  const m = n.meta || {}
  const rows: { k: string; v: string }[] = []
  const push = (k: string, v: unknown) => { if (v !== undefined && v !== null && v !== '') rows.push({ k, v: String(v) }) }
  switch (n.type) {
    case 'domain': push('Score', m.riskScore); push('Nível', m.riskLevel); push('Autorizado', m.authorized ? 'sim' : 'não'); push('Tipo', KIND_LABEL[String(m.kind)] || m.kind); break
    case 'subdomain': push('Vivo', m.alive ? 'sim' : 'não'); push('HTTP', m.statusCode); push('Título', m.title); push('Origem', m.assetType); break
    case 'ip': push('Hosts que resolvem', m.count); break
    case 'tech': push('Usos', m.count); break
    case 'webserver': push('Usos', m.count); break
    case 'exposure': push('Severidade', m.severity); push('Fonte', m.source); push('HTTP', m.statusCode); push('Alvo', m.value); break
    case 'vuln': push('Severidade', m.severity); push('CVSS', m.cvss); push('Estado', m.state); push('Tipo', m.type); push('Local', m.location); break
    case 'stealer_family': push('Ocorrências', m.aggCount ?? m.count); break
    case 'breach': push('Data', m.breachDate); push('Aparições', m.count); break
    case 'leaked_account': push('Severidade', m.severity); push('Visto em', m.seenDate); push('Tem senha', m.hasPassword ? 'sim' : 'não'); break
  }
  return rows
}

// ── UI helpers ────────────────────────────────────────────────────────────────────
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
function PanelBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', borderRadius: 7, background: 'color-mix(in srgb, var(--purple) 12%, transparent)', border: '1px solid var(--border-mid)', color: 'var(--purple-light)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%' }}>
      {children}
    </button>
  )
}
function PanelLink({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', borderRadius: 7, background: 'color-mix(in srgb, var(--purple) 12%, transparent)', border: '1px solid var(--border-mid)', color: 'var(--purple-light)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'none' }}>
      {children}
    </a>
  )
}
