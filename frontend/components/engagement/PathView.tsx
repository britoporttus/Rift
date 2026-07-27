'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge, type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { api, Finding } from '@/lib/api'
import { SEV_COLOR, SEV_ORDER, SEV_ICON } from '@/lib/severity'
import { findingType } from '@/lib/findingClassify'
import { TraceView } from '@/components/findings/TraceView'
import { Terminal } from 'lucide-react'

const SEV_LABEL: Record<string, string> = {
  critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo', info: 'Info',
}

const TYPE_LABEL: Record<string, string> = {
  vulnerability: 'Vulnerabilidade', weakness: 'Fraqueza', observation: 'Observação',
}

// `location` às vezes traz mais de uma URL separada por " e " (ver watcher do
// framework) — pegamos a primeira pra extrair o host; o resto fica só no card.
function parseHost(location?: string | null): string | null {
  if (!location) return null
  const m = location.match(/https?:\/\/[^\s,]+/)
  const raw = m ? m[0] : location.trim()
  try { return new URL(raw).hostname } catch { return null }
}

const HOST_LANE = 260
const NODE_W = 200
const VULN_NODE_W = 148 // achado mostra só ícone+nível — não precisa da largura do nó de host

export function PathView({ engagementId, target }: { engagementId: string; target: string }) {
  const [findings, setFindings] = useState<Finding[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.findings.list({ engagementId }).then((fs) => {
      if (!cancelled) setFindings(fs)
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [engagementId])

  const { nodes, edges, hostsWithoutLocation, sevCounts } = useMemo(() => {
    const buckets = new Map<string, Finding[]>()
    let noHost = 0
    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
    for (const f of findings) {
      counts[f.severity] = (counts[f.severity] || 0) + 1
      const host = parseHost(f.location) || '(sem host identificado)'
      if (host === '(sem host identificado)') noHost += 1
      if (!buckets.has(host)) buckets.set(host, [])
      buckets.get(host)!.push(f)
    }
    const hosts = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length)

    const totalWidth = Math.max(hosts.length * HOST_LANE, HOST_LANE)
    const rootId = 'root'
    const rNodes: Node[] = [{
      id: rootId,
      position: { x: totalWidth / 2 - NODE_W / 2, y: 0 },
      data: { label: <div style={{ fontWeight: 700, fontSize: 13 }}>🎯 {target}</div> },
      style: {
        width: NODE_W, background: 'var(--purple-dim)', border: '1px solid var(--purple)',
        borderRadius: 10, color: 'var(--text)', padding: 8,
      },
    }]
    const rEdges: Edge[] = []

    hosts.forEach(([host, hf], hi) => {
      const hostId = `host:${host}`
      const hx = hi * HOST_LANE + HOST_LANE / 2 - NODE_W / 2
      const isUnknown = host === '(sem host identificado)'
      rNodes.push({
        id: hostId,
        position: { x: hx, y: 140 },
        data: { label: <div style={{ fontSize: 12, fontWeight: 600, wordBreak: 'break-all' }}>{isUnknown ? '❓ sem host' : `🖥 ${host}`}</div> },
        style: {
          width: NODE_W,
          background: isUnknown ? 'var(--surface2)' : 'var(--surface)',
          border: `1px solid ${isUnknown ? 'var(--border)' : 'var(--border-mid)'}`,
          borderStyle: isUnknown ? 'dashed' : 'solid',
          borderRadius: 10, color: 'var(--text)', padding: 8,
        },
      })
      rEdges.push({ id: `${rootId}-${hostId}`, source: rootId, target: hostId })

      const sorted = [...hf].sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity))
      sorted.forEach((f, fi) => {
        const fId = `finding:${f.id}`
        const color = SEV_COLOR[f.severity] || SEV_COLOR.info
        const SevIcon = SEV_ICON[f.severity] || SEV_ICON.info
        rNodes.push({
          id: fId,
          position: { x: hx, y: 260 + fi * 96 },
          data: {
            label: (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <SevIcon size={14} color={color} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '.03em', whiteSpace: 'nowrap' }}>
                    {SEV_LABEL[f.severity]}
                  </span>
                </div>
                {f.discoveredBy && (
                  <div style={{ marginTop: 4, fontSize: 9, color: 'var(--purple-light)', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    via {f.discoveredBy}
                  </div>
                )}
              </div>
            ),
          },
          style: {
            width: VULN_NODE_W, background: 'var(--surface)', borderRadius: 8, padding: '8px 10px',
            border: `1px solid ${color}55`, borderLeft: `3px solid ${color}`,
            cursor: 'pointer',
          },
        })
        rEdges.push({ id: `${hostId}-${fId}`, source: hostId, target: fId })
      })
    })

    return { nodes: rNodes, edges: rEdges, hostsWithoutLocation: noHost, sevCounts: counts }
  }, [findings, target])

  const path = useMemo(() => {
    if (!selected) return null
    const edge = edges.find((e) => e.target === selected)
    if (!edge) return new Set([selected])
    const hostEdge = edges.find((e) => e.target === edge.source)
    const ids = new Set([selected, edge.source])
    if (hostEdge) ids.add(hostEdge.source)
    return ids
  }, [selected, edges])

  const styledNodes = useMemo(() => nodes.map((n) => ({
    ...n,
    style: { ...n.style, opacity: !path || path.has(n.id) ? 1 : 0.18, transition: 'opacity .15s' },
  })), [nodes, path])

  const styledEdges = useMemo(() => edges.map((e) => ({
    ...e,
    style: { opacity: !path || (path.has(e.source) && path.has(e.target)) ? 1 : 0.1, stroke: 'var(--border-hi)', transition: 'opacity .15s' },
    animated: !!path && path.has(e.source) && path.has(e.target),
  })), [edges, path])

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    if (node.id.startsWith('finding:')) setSelected((s) => (s === node.id ? null : node.id))
  }, [])

  const selectedFinding = selected ? findings.find((f) => `finding:${f.id}` === selected) : null

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>carregando caminho...</div>
  }
  if (findings.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Nenhum finding ainda para desenhar o caminho.</div>
  }

  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <ReactFlow
          nodes={styledNodes}
          edges={styledEdges}
          onNodeClick={onNodeClick}
          onPaneClick={() => setSelected(null)}
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
            nodeColor={(n) => (n.id.startsWith('finding:') ? 'var(--purple)' : 'var(--surface2)')}
            style={{ background: 'var(--surface)' }}
          />
        </ReactFlow>

        {/* legenda — panorama anotado */}
        <div style={{
          position: 'absolute', top: 12, left: 12, zIndex: 5,
          background: 'var(--surface)', border: '1px solid var(--border-mid)',
          borderRadius: 10, padding: '10px 14px', fontSize: 11.5,
        }}>
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6, fontSize: 12 }}>Panorama</div>
          {SEV_ORDER.map((s) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: SEV_COLOR[s] }} />
              <span style={{ color: 'var(--muted)' }}>{SEV_LABEL[s]}</span>
              <span style={{ color: 'var(--text)', fontWeight: 600, marginLeft: 'auto' }}>{sevCounts[s] || 0}</span>
            </div>
          ))}
          {hostsWithoutLocation > 0 && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)', color: 'var(--text-mute)', fontSize: 10.5 }}>
              {hostsWithoutLocation} finding(s) sem host identificado
            </div>
          )}
        </div>
      </div>

      {selectedFinding && (
        <div style={{
          width: 300, flexShrink: 0, borderLeft: '1px solid var(--border)',
          background: 'var(--surface)', padding: 16, overflowY: 'auto',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em',
            color: SEV_COLOR[selectedFinding.severity], marginBottom: 6,
          }}>
            {SEV_LABEL[selectedFinding.severity]} · {TYPE_LABEL[findingType(selectedFinding as any)]}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>
            {selectedFinding.title}
          </div>
          {selectedFinding.location && (
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 10, wordBreak: 'break-all' }}>
              <span style={{ color: 'var(--text-mute)' }}>Local: </span>{selectedFinding.location}
            </div>
          )}
          {selectedFinding.discoveredBy && (
            <div style={{ fontSize: 11.5, color: 'var(--purple-light)', fontFamily: 'monospace', marginBottom: 10 }}>
              via {selectedFinding.discoveredBy}
            </div>
          )}
          {selectedFinding.description && (
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 14 }}>
              {selectedFinding.description}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            <Terminal size={12} /> Rastro
          </div>
          <TraceView findingId={selectedFinding.id} />
        </div>
      )}
    </div>
  )
}
