'use client'
// Recomendações de segurança da rede interna. Diferente do inventário (uma linha
// por host), aqui a unidade é o ACHADO: "RDP exposto" aparece uma vez, listando os
// N ativos afetados — porque a correção é uma só e vale pra todos. Cada card traz a
// severidade, por que importa e a ação recomendada (catálogo em lib/internalRemediation).
import { InternalHost } from '@/lib/api'
import { SEV_COLOR, SEV_ORDER, SEV_ICON } from '@/lib/severity'
import { remediationFor } from '@/lib/internalRemediation'
import { ShieldAlert, Wrench } from 'lucide-react'

interface RecItem {
  label: string
  severity: string
  why: string
  fix: string
  hosts: InternalHost[]
}

const SEV_PT: Record<string, string> = { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo', info: 'Info' }

// Agrupa os rótulos de achado de todos os hosts → uma recomendação por rótulo,
// ordenada por severidade e depois por nº de ativos afetados.
function buildRecommendations(hosts: InternalHost[]): RecItem[] {
  const byLabel = new Map<string, RecItem>()
  for (const h of hosts) {
    for (const label of h.labels || []) {
      const rem = remediationFor(label)
      let item = byLabel.get(label)
      if (!item) { item = { label, severity: rem.severity, why: rem.why, fix: rem.fix, hosts: [] }; byLabel.set(label, item) }
      item.hosts.push(h)
    }
  }
  const rank = (s: string) => { const i = SEV_ORDER.indexOf(s as (typeof SEV_ORDER)[number]); return i < 0 ? 99 : i }
  return [...byLabel.values()].sort((a, b) => rank(a.severity) - rank(b.severity) || b.hosts.length - a.hosts.length)
}

export function SecurityRecommendations({ hosts }: { hosts: InternalHost[] }) {
  const recs = buildRecommendations(hosts)
  if (recs.length === 0) return null

  const counts: Record<string, number> = {}
  for (const r of recs) counts[r.severity] = (counts[r.severity] || 0) + 1
  const affected = new Set(recs.flatMap((r) => r.hosts.map((h) => h.id))).size

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--high)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ShieldAlert size={13} /> Recomendações de segurança ({recs.length})
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {SEV_ORDER.filter((s) => counts[s]).map((s) => <SevChip key={s} sev={s} n={counts[s]} />)}
          <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>· {affected} ativo(s) afetado(s)</span>
        </div>
      </div>
      {recs.map((r) => <RecCard key={r.label} rec={r} />)}
    </div>
  )
}

function SevChip({ sev, n }: { sev: string; n: number }) {
  const c = SEV_COLOR[sev] || SEV_COLOR.info
  const plural = n > 1 ? 's' : ''
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: c, background: `color-mix(in srgb, ${c} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`, borderRadius: 99, padding: '2px 9px' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c }} /> {n} {SEV_PT[sev].toLowerCase()}{plural}
    </span>
  )
}

function RecCard({ rec }: { rec: RecItem }) {
  const c = SEV_COLOR[rec.severity] || SEV_COLOR.info
  const Icon = SEV_ICON[rec.severity] || ShieldAlert
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${c}`, borderRadius: 10, padding: '0.95rem 1.1rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <Icon size={16} color={c} style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{rec.label}</div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, color: c, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, background: `color-mix(in srgb, ${c} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`, borderRadius: 6, padding: '2px 8px' }}>
          {SEV_PT[rec.severity]}
        </span>
      </div>

      <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55, marginTop: 9 }}>{rec.why}</div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10, padding: '0.6rem 0.8rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <Wrench size={14} color="var(--purple-light)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.55 }}>
          <span style={{ color: 'var(--purple-light)', fontWeight: 700 }}>Recomendação: </span>{rec.fix}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 2 }}>{rec.hosts.length} ativo(s):</span>
        {rec.hosts.slice(0, 12).map((h) => (
          <span key={h.id} style={{ fontSize: 10.5, fontFamily: 'var(--mono)', background: 'var(--bg)', border: '1px solid var(--border-mid)', color: 'var(--muted)', borderRadius: 99, padding: '2px 8px' }}>
            {h.ip}{h.hostname ? ` · ${h.hostname}` : ''}
          </span>
        ))}
        {rec.hosts.length > 12 && <span style={{ fontSize: 10.5, color: 'var(--text-mute)' }}>+{rec.hosts.length - 12}</span>}
      </div>
    </div>
  )
}
