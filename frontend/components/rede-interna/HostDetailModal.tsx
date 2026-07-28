'use client'
import type { InternalHost } from '@/lib/api'
import { SEV_COLOR } from '@/lib/severity'
import { deviceColor, deviceLabel } from './deviceMeta'
import { DeviceGlyph } from './DeviceGlyph'
import { X } from 'lucide-react'

// Modal de detalhe de um host — compartilhado pelas duas visualizações (radial e
// estruturada). `absolute` por padrão (sobreposto ao container do diagrama);
// passe fixed para cobrir a viewport inteira.
export function HostDetailModal({ host, onClose, positioning = 'absolute' }: {
  host: InternalHost
  onClose: () => void
  positioning?: 'absolute' | 'fixed'
}) {
  const col = deviceColor(host.deviceType)
  return (
    <div onClick={onClose} style={{ position: positioning, inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', zIndex: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border-mid)', borderRadius: 12, width: '100%', maxWidth: 460, maxHeight: '92%', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0.9rem 1.1rem', borderBottom: '1px solid var(--border)' }}>
          <DeviceGlyph type={host.deviceType} size={30} color={col} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{host.ip}</div>
            <div style={{ fontSize: 11, color: col, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {deviceLabel(host.deviceType)}{host.status === 'gone' ? ' · sumiu' : ''}
            </div>
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
