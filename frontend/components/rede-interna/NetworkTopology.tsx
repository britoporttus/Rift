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
const RING_BASE = 260      // raio do primeiro anel
const RING_STEP = 190      // distância entre anéis
const PER_RING = 14        // hosts por anel antes de abrir o próximo

function subnet24(ip: string): string { const p = ip.split('.'); return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.0/24` : 'outros' }
function lastOctet(ip: string): number { const p = ip.split('.'); return p.length === 4 ? Number(p[3]) : 999 }

// Quem é o hub que distribui o tráfego: o firewall/roteador de perímetro; na falta
// dele, o `.1` (gateway convencional) da sub-rede com mais hosts. É a topologia L3
// honesta — todo host usa o gateway como rota default. Sem gateway detectável,
// retorna null e o layout cai pro nó abstrato "rede".
function pickGateway(hosts: InternalHost[]): InternalHost | null {
  const fw = hosts.find((h) => h.deviceType === 'firewall' || h.deviceType === 'router')
  if (fw) return fw
  const bySubnet = new Map<string, InternalHost[]>()
  for (const h of hosts) { const k = subnet24(h.ip); if (!bySubnet.has(k)) bySubnet.set(k, []); bySubnet.get(k)!.push(h) }
  let best: InternalHost | null = null; let bestCount = 0
  for (const items of bySubnet.values()) {
    const gw = items.find((h) => lastOctet(h.ip) === 1)
    if (gw && items.length > bestCount) { best = gw; bestCount = items.length }
  }
  return best
}

// Layout radial GATEWAY-CÊNTRICO: o firewall/gateway no centro e os hosts orbitando
// nele (ordenados por tipo de dispositivo) — que é o que a rede faz de verdade: o
// gateway roteia o tráfego de todos. Honesto sobre o que o nmap entrega (não há
// topologia switch-a-switch sem SNMP/LLDP, fase futura).
function buildFlow(hosts: InternalHost[], networkName: string): { nodes: Node[]; edges: Edge[]; hubId: string } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const online = hosts.filter((h) => h.status !== 'gone')
  const gateway = pickGateway(online)
  const hubId = gateway ? gateway.id : '__net__'

  if (gateway) {
    const gsev = gateway.severity && gateway.severity !== 'info' ? SEV_COLOR[gateway.severity] : null
    nodes.push({
      id: gateway.id,
      position: CENTER,
      data: { label: (
        <div style={{ textAlign: 'center', padding: '3px 2px', minWidth: 0 }}>
          <div style={{ fontSize: 8.5, fontWeight: 800, color: 'rgba(255,255,255,0.82)', letterSpacing: '0.1em' }}>GATEWAY</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{gateway.ip}</div>
          <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.75)', marginTop: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{deviceLabel(gateway.deviceType)}</div>
          {gateway.hostname && <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.6)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{gateway.hostname}</div>}
        </div>
      ) },
      style: {
        width: 156, borderRadius: 14, border: `1px solid ${gsev || 'var(--purple-light)'}`,
        background: 'linear-gradient(135deg, #7C3AED, #6D28D9)', color: '#fff',
        boxShadow: gsev ? `0 0 26px ${gsev}88` : '0 0 26px rgba(124,58,237,0.55)',
      },
      draggable: false,
    })
  } else {
    nodes.push({
      id: '__net__',
      position: CENTER,
      data: { label: (
        <div style={{ textAlign: 'center', padding: '4px 2px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{networkName}</div>
          <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{online.length} host(s)</div>
        </div>
      ) },
      style: {
        width: 130, borderRadius: 14, border: '1px solid var(--purple)',
        background: 'linear-gradient(135deg, #7C3AED, #6D28D9)', color: '#fff',
        boxShadow: '0 0 24px rgba(124,58,237,0.5)',
      },
      draggable: false,
    })
  }

  const ring = (gateway ? online.filter((h) => h.id !== gateway.id) : online)
    .sort((a, b) => DEVICE_ORDER.indexOf(a.deviceType) - DEVICE_ORDER.indexOf(b.deviceType))

  ring.forEach((h, i) => {
    const r = Math.floor(i / PER_RING)
    const idxInRing = i % PER_RING
    const countInRing = Math.min(PER_RING, ring.length - r * PER_RING)
    const radius = RING_BASE + r * RING_STEP
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
      id: `e-${h.id}`, source: hubId, target: h.id,
      style: { stroke: sev || 'var(--border-hi)', strokeWidth: sev ? 1.5 : 1 },
    })
  })

  return { nodes, edges, hubId }
}

export function NetworkTopology({ hosts, networkName }: { hosts: InternalHost[]; networkName: string }) {
  const [selected, setSelected] = useState<InternalHost | null>(null)
  const { nodes, edges, hubId } = useMemo(() => buildFlow(hosts, networkName), [hosts, networkName])

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
        <MiniMap pannable zoomable nodeColor={(n) => (n.id === hubId ? '#7C3AED' : 'var(--surface2)')} maskColor="rgba(10,10,18,0.7)" />
      </ReactFlow>
      {selected && <HostDetailModal host={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
