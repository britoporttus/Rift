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
import { X } from 'lucide-react'

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
      {selected && <HostModal host={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function HostModal({ host, onClose }: { host: InternalHost; onClose: () => void }) {
  const col = deviceColor(host.deviceType)
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', zIndex: 10 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border-mid)', borderRadius: 12, width: '100%', maxWidth: 440, maxHeight: '92%', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.9rem 1.1rem', borderBottom: '1px solid var(--border)' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: col }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{host.ip}</div>
            <div style={{ fontSize: 11, color: col, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{deviceLabel(host.deviceType)}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {host.hostname && <Row k="Hostname" v={host.hostname} />}
          {host.mac && <Row k="MAC" v={`${host.mac}${host.macVendor ? ` · ${host.macVendor}` : ''}`} />}
          {host.os && <Row k="Sistema" v={host.os} />}
          {host.labels.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Achados de segurança</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {host.labels.map((l, i) => {
                  const sc = host.severity !== 'info' ? SEV_COLOR[host.severity] : 'var(--muted)'
                  return <div key={i} style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 7 }}><span style={{ color: sc }}>▪</span>{l}</div>
                })}
              </div>
            </div>
          )}
          {host.openPorts.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Portas abertas ({host.openPorts.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {host.openPorts.map((p, i) => (
                  <div key={i} style={{ fontSize: 11.5, color: 'var(--muted)', fontFamily: 'var(--mono)', display: 'flex', gap: 8 }}>
                    <span style={{ color: 'var(--text)', minWidth: 62 }}>{p.port}/{p.proto}</span>
                    <span>{[p.service, p.product, p.version].filter(Boolean).join(' ') || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
      <span style={{ color: 'var(--text-mute)', minWidth: 72 }}>{k}</span>
      <span style={{ color: 'var(--text)', wordBreak: 'break-word' }}>{v}</span>
    </div>
  )
}
