'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap, Position,
  type Node, type Edge, type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { GraphNode, GraphResponse, Engagement } from '@/lib/api'
import { SEV_COLOR, SEV_ICON } from '@/lib/severity'
import { engagementMatchesDomain } from '@/lib/domainMatch'
import { buildTree, TNode, HostModal, VulnModal, SEV_LABEL } from './DomainTree'
import { Server, Globe, Bug, Cpu, Network, Plus, Minus } from 'lucide-react'

// "Caminho" (mind-map com caixas conectadas por linha, igual à visão de
// engagement) sobre a MESMA árvore/dado do domínio — troca só a renderização
// da lista indentada por um diagrama, mantendo expandir/colapsar e o popup
// central de detalhe. Layout HORIZONTAL (raiz à esquerda, ramos pra direita)
// — mais legível que top-down pra árvores largas (muitos subdomínios).
const NODE_W = 210
const VULN_NODE_W = 148 // achado mostra só ícone+nível — não precisa da largura do nó de host
const LEVEL_GAP = 280  // distância horizontal entre níveis (profundidade)
const SIBLING_GAP = 80 // distância vertical entre irmãos (largura da árvore)

interface FlatEntry {
  id: string
  kind: 'host' | 'vuln'
  depth: number
  cross: number // posição no eixo perpendicular ao nível (vira Y no layout horizontal)
  isRoot?: boolean
  host?: TNode
  vuln?: GraphNode
}

function flatten(root: TNode, openIds: Set<string>) {
  const entries: FlatEntry[] = []
  const edges: Array<{ source: string; target: string }> = []
  let leafCounter = 0

  function visit(n: TNode, depth: number, parentId: string | null, isRoot: boolean): number {
    const isOpen = isRoot || openIds.has(n.g.id)
    const childCross: number[] = []
    if (isOpen) {
      for (const c of n.children) childCross.push(visit(c, depth + 1, n.g.id, false))
      for (const v of n.vulns) {
        const vc = leafCounter * SIBLING_GAP
        leafCounter++
        const vid = `finding:${v.id}`
        entries.push({ id: vid, kind: 'vuln', depth: depth + 1, cross: vc, vuln: v })
        edges.push({ source: n.g.id, target: vid })
        childCross.push(vc)
      }
    }
    const myCross = childCross.length > 0 ? (Math.min(...childCross) + Math.max(...childCross)) / 2 : (leafCounter++ * SIBLING_GAP)
    entries.push({ id: n.g.id, kind: 'host', depth, cross: myCross, isRoot, host: n })
    if (parentId) edges.push({ source: parentId, target: n.g.id })
    return myCross
  }

  visit(root, 0, null, true)
  return { entries, edges }
}

function MiniTag({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9.5, color: 'var(--text-mute)', background: 'rgba(2,2,8,0.4)', border: '1px solid var(--border)', borderRadius: 99, padding: '1px 6px', flexShrink: 0 }}>
      {icon}{children}
    </span>
  )
}

export function DomainFlow({ graph, domainLabel, engagements = [] }: { graph: GraphResponse; domainLabel: string; engagements?: Engagement[] }) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<{ kind: 'host'; node: TNode } | { kind: 'vuln'; node: GraphNode } | null>(null)

  const tree = useMemo(() => buildTree(graph, `dom:${domainLabel}`), [graph, domainLabel])
  const linkedEngagements = useMemo(
    () => engagements.filter((e) => engagementMatchesDomain(e.target, domainLabel)),
    [engagements, domainLabel],
  )

  // abre a raiz + filhos diretos por padrão; sub-níveis começam fechados
  useEffect(() => {
    if (tree) setOpenIds(new Set([tree.g.id, ...tree.children.map((c) => c.g.id)]))
  }, [tree])

  function toggle(id: string) {
    setOpenIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  const { entries, edges: rawEdges } = useMemo(
    () => (tree ? flatten(tree, openIds) : { entries: [] as FlatEntry[], edges: [] as Array<{ source: string; target: string }> }),
    [tree, openIds],
  )

  const nodes: Node[] = useMemo(() => entries.map((e) => {
    if (e.kind === 'vuln') {
      const v = e.vuln!
      const sev = String(v.meta.severity)
      const color = SEV_COLOR[sev] || SEV_COLOR.info
      const SevIcon = SEV_ICON[sev] || SEV_ICON.info
      return {
        id: e.id,
        position: { x: e.depth * LEVEL_GAP, y: e.cross },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          label: (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <SevIcon size={14} color={color} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '.03em', whiteSpace: 'nowrap' }}>
                  {SEV_LABEL[sev] || sev}
                </span>
              </div>
              {v.meta.discoveredBy != null && (
                <div style={{ marginTop: 4, fontSize: 9, color: 'var(--purple-light)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  via {String(v.meta.discoveredBy)}
                </div>
              )}
            </div>
          ),
        },
        style: {
          width: VULN_NODE_W, background: 'var(--surface)', borderRadius: 8, padding: '8px 10px',
          border: `1px solid ${color}55`, borderLeft: `3px solid ${color}`, cursor: 'pointer',
        },
      }
    }

    const n = e.host!
    const isDomain = n.g.type === 'domain'
    const hasCollapsible = n.children.length > 0 || n.vulns.length > 0
    const isOpen = e.isRoot || openIds.has(n.g.id)
    const sevColor = n.worstSev ? SEV_COLOR[n.worstSev] : null
    const WorstSevIcon = n.worstSev ? (SEV_ICON[n.worstSev] || Bug) : Bug
    // contagem do que está escondido — só o 1º nível (filhos diretos + vulns
    // próprios), pra dar uma pista de "tem mais coisa aqui" sem custo de
    // somar a subárvore inteira toda vez que renderiza.
    const hiddenCount = n.children.length + n.vulns.length

    return {
      id: e.id,
      position: { x: e.depth * LEVEL_GAP, y: e.cross },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        label: (
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {isDomain ? <Globe size={13} color="var(--purple-light)" /> : <Server size={12} color="var(--text-mute)" />}
              <span style={{
                fontWeight: isDomain ? 700 : 600, fontSize: isDomain ? 13 : 12, color: 'var(--text)',
                fontFamily: isDomain ? 'inherit' : 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {n.g.label}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
              {!isDomain && (
                <span style={{ width: 6, height: 6, borderRadius: 999, background: n.g.meta.alive ? 'var(--low)' : 'var(--text-dim)', flexShrink: 0 }} />
              )}
              {n.techs.length > 0 && <MiniTag icon={<Cpu size={9} />}>{n.techs.length}</MiniTag>}
              {n.ips.length > 0 && <MiniTag icon={<Network size={9} />}>{n.ips.length}</MiniTag>}
              {n.vulnCount > 0 && sevColor && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: sevColor,
                  background: `color-mix(in srgb, ${sevColor} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${sevColor} 35%, transparent)`,
                  borderRadius: 99, padding: '1px 7px', marginLeft: 'auto', flexShrink: 0,
                }}>
                  <WorstSevIcon size={9} /> {n.vulnCount}
                </span>
              )}
            </div>

            {/* bolinha de expandir/colapsar — fica NA borda do nó, do lado de
                onde os ramos saem (direita), só aparece se houver mais coisa */}
            {hasCollapsible && (
              <button
                onClick={(ev) => { ev.stopPropagation(); toggle(n.g.id) }}
                title={isOpen ? 'Recolher' : `Expandir (${hiddenCount})`}
                style={{
                  position: 'absolute', right: -20, top: '50%', transform: 'translateY(-50%)',
                  width: 20, height: 20, borderRadius: '50%', padding: 0, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isOpen ? 'var(--purple)' : 'var(--surface2)',
                  border: `1px solid ${isOpen ? 'var(--purple)' : 'var(--border-mid)'}`,
                  color: isOpen ? '#fff' : 'var(--purple-light)',
                  boxShadow: isOpen ? '0 0 8px var(--purple-glow-strong)' : 'none',
                }}
              >
                {isOpen ? <Minus size={11} /> : <Plus size={11} />}
              </button>
            )}
          </div>
        ),
      },
      style: {
        width: NODE_W, borderRadius: 10, padding: 8, cursor: 'pointer', overflow: 'visible',
        background: isDomain ? 'var(--purple-dim)' : 'var(--surface)',
        border: `1px solid ${isDomain ? 'var(--purple)' : 'var(--border-mid)'}`,
      },
    }
  }), [entries, openIds])

  const edges: Edge[] = useMemo(() => rawEdges.map((e) => ({
    id: `${e.source}->${e.target}`, source: e.source, target: e.target,
    style: { stroke: 'var(--border-hi)' },
  })), [rawEdges])

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    const entry = entries.find((e) => e.id === node.id)
    if (!entry) return
    if (entry.kind === 'vuln') setSelected({ kind: 'vuln', node: entry.vuln! })
    else setSelected({ kind: 'host', node: entry.host! })
  }, [entries])

  if (!tree || (tree.children.length === 0 && tree.vulnCount === 0)) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-mute)' }}>
        Nenhum subdomínio ainda. Rode um scan.
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={onNodeClick}
        nodesConnectable={false}
        edgesFocusable={false}
        fitView
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
      >
        <Background color="var(--border)" gap={24} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable zoomable
          nodeColor={(n) => (n.id.startsWith('finding:') ? 'var(--critical)' : 'var(--purple)')}
          style={{ background: 'var(--surface)' }}
        />
      </ReactFlow>

      {selected?.kind === 'host' && (
        <HostModal
          node={selected.node} onClose={() => setSelected(null)}
          onSelectVuln={(v) => setSelected({ kind: 'vuln', node: v })}
          engagements={selected.node.g.type === 'domain' ? linkedEngagements : []}
        />
      )}
      {selected?.kind === 'vuln' && (
        <VulnModal node={selected.node} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
