'use client'
import { useMemo, useState } from 'react'
import type { InternalHost } from '@/lib/api'
import { SEV_COLOR } from '@/lib/severity'
import { deviceColor, deviceLabel } from './deviceMeta'
import { DeviceGlyph } from './DeviceGlyph'
import { HostDetailModal } from './HostDetailModal'
import { Cloud, Globe, ShieldAlert } from 'lucide-react'

// Diagrama estruturado da rede: Internet → perímetro (firewall/roteador + hosts
// públicos) → bandas de sub-rede privada. Agrupa por segmento (/24) e por
// público vs. privado — que é o que o nmap honestamente permite inferir (mapa
// físico switch-a-switch exigiria SNMP/LLDP, fase futura). Alternativa à visão
// radial; as duas coexistem.

function ipToInt(ip: string): number | null {
  const p = ip.split('.')
  if (p.length !== 4) return null
  let n = 0
  for (const o of p) { const b = Number(o); if (!/^\d{1,3}$/.test(o) || b > 255) return null; n = n * 256 + b }
  return n
}
function isPrivate(ip: string): boolean {
  const n = ipToInt(ip); if (n === null) return false
  const inR = (a: string, bits: number) => { const base = ipToInt(a)!; const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0; return ((n & mask) >>> 0) === ((base & mask) >>> 0) }
  return inR('10.0.0.0', 8) || inR('172.16.0.0', 12) || inR('192.168.0.0', 16) || inR('169.254.0.0', 16) || inR('100.64.0.0', 10)
}
function subnet24(ip: string): string {
  const p = ip.split('.'); return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.0/24` : 'outros'
}
function lastOctet(ip: string): number { const p = ip.split('.'); return p.length === 4 ? Number(p[3]) : 999 }

export function NetworkDiagram({ hosts, networkName }: { hosts: InternalHost[]; networkName: string }) {
  const [selected, setSelected] = useState<InternalHost | null>(null)

  const { perimeter, publicHosts, subnets } = useMemo(() => {
    const online = hosts.filter((h) => h.status !== 'gone')
    const perimeter = online.filter((h) => h.deviceType === 'firewall' || h.deviceType === 'router')
    const perimeterIds = new Set(perimeter.map((h) => h.id))
    const rest = online.filter((h) => !perimeterIds.has(h.id))
    const publicHosts = rest.filter((h) => !isPrivate(h.ip))
    const priv = rest.filter((h) => isPrivate(h.ip))
    const bySubnet = new Map<string, InternalHost[]>()
    for (const h of priv) { const k = subnet24(h.ip); if (!bySubnet.has(k)) bySubnet.set(k, []); bySubnet.get(k)!.push(h) }
    const subnets = [...bySubnet.entries()]
      .map(([cidr, items]) => ({ cidr, items: items.sort((a, b) => lastOctet(a.ip) - lastOctet(b.ip)) }))
      .sort((a, b) => a.cidr.localeCompare(b.cidr))
    return { perimeter, publicHosts, subnets }
  }, [hosts])

  const goneCount = hosts.filter((h) => h.status === 'gone').length

  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', padding: '1.4rem 1.2rem', overflowX: 'auto' }}>
      <div style={{ minWidth: 'min-content', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
        {/* Internet */}
        <Zone accent="var(--info)" icon={<Cloud size={15} />} title="Internet">
          <div style={{ fontSize: 11.5, color: 'var(--text-mute)' }}>fronteira externa da rede</div>
        </Zone>
        <Trunk />

        {/* Perímetro: firewalls/roteadores + hosts públicos */}
        {(perimeter.length > 0 || publicHosts.length > 0) && (
          <>
            <Zone accent="var(--high)" icon={<ShieldAlert size={15} />} title="Perímetro">
              {perimeter.length === 0 && publicHosts.length === 0 ? (
                <span style={{ fontSize: 11.5, color: 'var(--text-mute)' }}>nenhum firewall/roteador detectado</span>
              ) : (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {perimeter.map((h) => <DeviceCard key={h.id} host={h} tag="gateway" onClick={() => setSelected(h)} />)}
                  {publicHosts.map((h) => <DeviceCard key={h.id} host={h} tag={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Globe size={9} /> público</span>} onClick={() => setSelected(h)} />)}
                </div>
              )}
            </Zone>
            <Trunk branches={subnets.length} />
          </>
        )}

        {/* Bandas de sub-rede privada */}
        {subnets.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-mute)', padding: '0.5rem' }}>Nenhum host em rede privada.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', alignItems: 'stretch' }}>
            {subnets.map((s) => (
              <div key={s.cidr} style={{ border: '1px solid var(--border-mid)', borderRadius: 10, background: 'var(--surface)', padding: '0.9rem 1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: 'var(--purple-light)' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{s.cidr}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-mute)' }}>· {s.items.length} dispositivo(s)</span>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {s.items.map((h) => <DeviceCard key={h.id} host={h} tag={lastOctet(h.ip) === 1 ? 'gateway' : undefined} onClick={() => setSelected(h)} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {goneCount > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 14 }}>{goneCount} host(s) sumido(s) desde a última coleta não são mostrados aqui.</div>
        )}
      </div>

      {selected && <HostDetailModal host={selected} onClose={() => setSelected(null)} positioning="fixed" />}
    </div>
  )
}

function Zone({ accent, icon, title, children }: { accent: string; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid color-mix(in srgb, ${accent} 30%, var(--border))`, background: `color-mix(in srgb, ${accent} 5%, var(--surface))`, borderRadius: 10, padding: '0.8rem 1.1rem', minWidth: 260, textAlign: 'center' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: accent, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{icon}{title}</div>
      <div>{children}</div>
    </div>
  )
}

// Conector vertical entre zonas. Com `branches`, sugere a divisão em N segmentos.
function Trunk({ branches }: { branches?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: 2, height: 22, background: 'var(--border-hi)' }} />
      {typeof branches === 'number' && branches > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-dim)', fontSize: 10, marginBottom: 2 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--border-hi)' }} />
          {branches} segmentos
        </div>
      )}
    </div>
  )
}

function DeviceCard({ host, onClick, tag }: { host: InternalHost; onClick: () => void; tag?: React.ReactNode }) {
  const col = deviceColor(host.deviceType)
  const sev = host.severity && host.severity !== 'info' ? SEV_COLOR[host.severity] : null
  return (
    <button onClick={onClick} style={{
      width: 138, textAlign: 'center', cursor: 'pointer', fontFamily: 'inherit',
      background: 'var(--raised)', border: `1px solid ${sev || 'var(--border-mid)'}`,
      borderRadius: 10, padding: '10px 8px 9px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      boxShadow: sev ? `0 0 12px ${sev}44` : 'none', position: 'relative',
    }}>
      {sev && <span style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: '50%', background: sev }} />}
      <DeviceGlyph type={host.deviceType} size={40} color={col} />
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{host.ip}</span>
      <span style={{ fontSize: 9, color: col, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{deviceLabel(host.deviceType)}</span>
      {host.hostname && <span style={{ fontSize: 9, color: 'var(--text-mute)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{host.hostname}</span>}
      {tag && <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--purple-light)', background: 'color-mix(in srgb, var(--purple) 14%, transparent)', border: '1px solid var(--border-mid)', borderRadius: 99, padding: '1px 6px', marginTop: 1 }}>{tag}</span>}
    </button>
  )
}
