'use client'
import { useMemo, useState } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge, type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { InternalHost } from '@/lib/api'
import { SEV_COLOR } from '@/lib/severity'
import { deviceColor, deviceLabel, DEVICE_ORDER } from './deviceMeta'
import { HostDetailModal } from './HostDetailModal'

const CENTER = { x: 0, y: 0 }
const RING_BASE = 240      // raio do primeiro anel
const RING_STEP = 190      // distância entre anéis
const PER_RING = 14        // hosts por anel antes de abrir o próximo

// Layout radial: rede no centro, hosts em anéis concêntricos, ORDENADOS por tipo
// de dispositivo (mesmo tipo agrupa em setores vizinhos). Honesto sobre o que o
// nmap entrega (não há topologia switch-a-switch sem SNMP/LLDP — fase futura).
function buildFlow(hosts: InternalHost[], networkName: string): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  nodes.push({
    id: '__net__',
    position: CENTER,
    data: { label: (
      <div style={{ textAlign: 'center', padding: '4px 2px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{networkName}</div>
        <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{hosts.length} host(s)</div>
      </div>
    ) },
    style: {
      width: 130, borderRadius: 14, border: '1px solid var(--purple)',
      background: 'linear-gradient(135deg, #7C3AED, #6D28D9)', color: '#fff',
      boxShadow: '0 0 24px rgba(124,58,237,0.5)',
    },
    draggable: false,
  })

  const sorted = [...hosts].sort((a, b) => DEVICE_ORDER.indexOf(a.deviceType) - DEVICE_ORDER.indexOf(b.deviceType))
  sorted.forEach((h, i) => {
    const ring = Math.floor(i / PER_RING)
    const idxInRing = i % PER_RING
    const countInRing = Math.min(PER_RING, sorted.length - ring * PER_RING)
    const radius = RING_BASE + ring * RING_STEP
    const angle = (idxInRing / countInRing) * Math.PI * 2 - Math.PI / 2
    const x = CENTER.x + radius * Math.cos(angle)
    const y = CENTER.y + radius * Math.sin(angle)
    const col = deviceColor(h.deviceType)
    const sev = h.severity && h.severity !== 'info' ? SEV_COLOR[h.severity] : null

    nodes.push({
      id: h.id,
      position: { x, y },
      data: { label: (
        <div style={{ padding: '2px 1px', minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.ip}</div>
          <div style={{ fontSize: 8.5, color: col, marginTop: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{deviceLabel(h.deviceType)}</div>
          {h.hostname && <div style={{ fontSize: 8.5, color: 'var(--text-mute)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.hostname}</div>}
        </div>
      ) },
      style: {
        width: 130, borderRadius: 9, padding: '6px 8px',
        border: `1px solid ${sev || col}`,
        background: 'var(--surface)',
        boxShadow: sev ? `0 0 12px ${sev}55` : 'none',
      },
      draggable: false,
    })
    edges.push({
      id: `e-${h.id}`, source: '__net__', target: h.id,
      style: { stroke: sev || 'var(--border-hi)', strokeWidth: sev ? 1.5 : 1 },
    })
  })

  return { nodes, edges }
}

export function NetworkTopology({ hosts, networkName }: { hosts: InternalHost[]; networkName: string }) {
  const [selected, setSelected] = useState<InternalHost | null>(null)
  const { nodes, edges } = useMemo(() => buildFlow(hosts, networkName), [hosts, networkName])

  const onNodeClick: NodeMouseHandler = (_e, node) => {
    if (node.id === '__net__') return
    setSelected(hosts.find((h) => h.id === node.id) || null)
  }

  return (
    <div style={{ height: 560, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', position: 'relative', background: 'var(--panel)' }}>
      <ReactFlow
        nodes={nodes} edges={edges} onNodeClick={onNodeClick}
        fitView colorMode="dark" nodesConnectable={false} nodesDraggable={false}
        proOptions={{ hideAttribution: true }} minZoom={0.15}
      >
        <Background gap={22} color="rgba(140,120,225,0.06)" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor={(n) => (n.id === '__net__' ? '#7C3AED' : 'var(--surface2)')} maskColor="rgba(10,10,18,0.7)" />
      </ReactFlow>
      {selected && <HostDetailModal host={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
