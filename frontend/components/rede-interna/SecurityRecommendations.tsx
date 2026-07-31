'use client'
// Recomendações de segurança da rede interna. Unidade = ACHADO (não host): "RDP
// exposto" aparece 1x listando os N ativos afetados, porque a correção é uma só.
// Layout: agrupado por severidade, com cards colapsáveis. Crítico/alto abrem por
// padrão (o que importa salta à vista); médio/baixo ficam recolhidos (só título +
// nº de ativos) pra não ocupar tela. Catálogo de ação em lib/internalRemediation.
import { useState } from 'react'
import { InternalHost } from '@/lib/api'
import { SEV_COLOR, SEV_ORDER, SEV_ICON } from '@/lib/severity'
import { remediationFor, buildRemediationCsv } from '@/lib/internalRemediation'
import { ShieldAlert, Wrench, ChevronDown, FileSpreadsheet } from 'lucide-react'

interface RecItem {
  label: string
  severity: string
  why: string
  fix: string
  hosts: InternalHost[]
}

const SEV_PT: Record<string, string> = { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo', info: 'Info' }
const SEV_PT_PLURAL: Record<string, string> = { critical: 'Críticos', high: 'Altos', medium: 'Médios', low: 'Baixos', info: 'Informativos' }

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

export function SecurityRecommendations({ hosts, networkName }: { hosts: InternalHost[]; networkName?: string }) {
  const recs = buildRecommendations(hosts)
  // Abre crítico/alto por padrão — hierarquia sem custo de tela pros de menor risco.
  const [open, setOpen] = useState<Set<string>>(() =>
    new Set(recs.filter((r) => r.severity === 'critical' || r.severity === 'high').map((r) => r.label)))

  if (recs.length === 0) return null

  const groups = SEV_ORDER.map((sev) => ({ sev, items: recs.filter((r) => r.severity === sev) })).filter((g) => g.items.length > 0)
  const affected = new Set(recs.flatMap((r) => r.hosts.map((h) => h.id))).size
  const toggle = (label: string) => setOpen((prev) => { const n = new Set(prev); n.has(label) ? n.delete(label) : n.add(label); return n })

  function exportCsv() {
    const name = networkName || 'Rede interna'
    const csv = buildRemediationCsv(recs, { networkName: name, generatedAt: new Date().toLocaleString('pt-BR') })
    // BOM (﻿) pro Excel abrir UTF-8 certo (acentos); ';' como delimitador pt-BR.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'rede'
    a.href = url
    a.download = `correcoes-${slug}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--high)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <ShieldAlert size={13} /> Recomendações de segurança ({recs.length})
          <span style={{ color: 'var(--text-mute)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· {affected} ativo(s) afetado(s)</span>
        </div>
        <button
          onClick={exportCsv}
          title="Exporta a planilha de correções (CSV) — criticidade, urgência e SLA sugerido"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: '5px 11px', borderRadius: 7, color: 'var(--purple-light)', background: 'color-mix(in srgb, var(--purple) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--purple) 35%, transparent)' }}
        >
          <FileSpreadsheet size={13} /> Exportar planilha
        </button>
      </div>

      {groups.map((g) => (
        <div key={g.sev} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <GroupHeader sev={g.sev} n={g.items.length} />
          {g.items.map((r) => <RecCard key={r.label} rec={r} open={open.has(r.label)} onToggle={() => toggle(r.label)} />)}
        </div>
      ))}
    </div>
  )
}

function GroupHeader({ sev, n }: { sev: string; n: number }) {
  const c = SEV_COLOR[sev] || SEV_COLOR.info
  const Icon = SEV_ICON[sev] || ShieldAlert
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
      <Icon size={13} color={c} />
      <span style={{ fontSize: 11, fontWeight: 800, color: c, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{SEV_PT_PLURAL[sev]}</span>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: c, background: `color-mix(in srgb, ${c} 14%, transparent)`, borderRadius: 99, padding: '1px 8px', minWidth: 18, textAlign: 'center' }}>{n}</span>
      <div style={{ flex: 1, height: 1, background: `color-mix(in srgb, ${c} 22%, transparent)` }} />
    </div>
  )
}

function RecCard({ rec, open, onToggle }: { rec: RecItem; open: boolean; onToggle: () => void }) {
  const c = SEV_COLOR[rec.severity] || SEV_COLOR.info
  const Icon = SEV_ICON[rec.severity] || ShieldAlert
  const plural = rec.hosts.length > 1 ? 's' : ''
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${c}`, borderRadius: 8, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{ background: 'transparent', border: 'none', margin: 0, cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem 0.85rem', fontFamily: 'inherit', textAlign: 'left', color: 'inherit' }}
      >
        <Icon size={15} color={c} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.label}</span>
        <span style={{ fontSize: 10.5, color: 'var(--text-mute)', fontFamily: 'var(--mono)', flexShrink: 0 }}>{rec.hosts.length} ativo{plural}</span>
        <ChevronDown size={14} color="var(--text-mute)" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
      </button>

      {open && (
        <div style={{ padding: '0 0.85rem 0.8rem', display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>{rec.why}</div>
          <div style={{ display: 'flex', gap: 8, padding: '0.55rem 0.75rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7 }}>
            <Wrench size={13} color="var(--purple-light)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.5 }}>
              <span style={{ color: 'var(--purple-light)', fontWeight: 700 }}>Recomendação: </span>{rec.fix}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            {rec.hosts.slice(0, 14).map((h) => (
              <span key={h.id} style={{ fontSize: 10, fontFamily: 'var(--mono)', background: 'var(--bg)', border: '1px solid var(--border-mid)', color: 'var(--muted)', borderRadius: 99, padding: '2px 7px' }}>
                {h.ip}{h.hostname ? ` · ${h.hostname}` : ''}
              </span>
            ))}
            {rec.hosts.length > 14 && <span style={{ fontSize: 10, color: 'var(--text-mute)' }}>+{rec.hosts.length - 14}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
