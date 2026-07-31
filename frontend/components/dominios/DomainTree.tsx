'use client'
import Link from 'next/link'
import { GraphNode, GraphResponse, Engagement } from '@/lib/api'
import { SEV_COLOR, SEV_ORDER } from '@/lib/severity'
import { findingType } from '@/lib/findingClassify'
import {
  ChevronRight, Bug, AlertTriangle, X,
  Network, Cpu, HardDrive, Target, Terminal,
} from 'lucide-react'
import { TraceView } from '@/components/findings/TraceView'

// Dados + modais de detalhe do domínio, compartilhados entre visualizações
// (hoje só DomainFlow, o mind-map que substituiu o mapa de bolhas antigo).
export const SEV_LABEL: Record<string, string> = { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo', info: 'Info' }
export const TYPE_LABEL: Record<string, string> = { vulnerability: 'Vulnerabilidade', weakness: 'Fraqueza', observation: 'Observação' }
export const RS_BADGE: Record<string, { t: string; c: string }> = {
  running:   { t: 'RODANDO',    c: 'var(--purple-light)' },
  completed: { t: 'CONCLUÍDO',  c: 'var(--low)' },
  failed:    { t: 'FALHOU',     c: 'var(--critical)' },
  stopped:   { t: 'PARADO',     c: 'var(--medium)' },
  idle:      { t: 'AGUARDANDO', c: 'var(--text-mute)' },
}

export interface TNode {
  g: GraphNode
  children: TNode[]
  vulns: GraphNode[]
  exposures: GraphNode[]
  ips: GraphNode[]
  techs: GraphNode[]
  webservers: GraphNode[]
  worstSev: string | null // rollup — pior severidade nesta subárvore inteira
  vulnCount: number       // rollup
}

const sevRank = (s: string) => SEV_ORDER.indexOf(s as (typeof SEV_ORDER)[number])
function bestSev(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return sevRank(a) <= sevRank(b) ? a : b
}

// Monta a árvore a partir do grafo já correlacionado pelo backend
// (graph/build.js) — não recalcula IP/tech/vuln aqui, só reorganiza os
// mesmos nós/arestas em hierarquia. O único trabalho novo é o NESTING real
// de subdomínio (ex.: staging.api.foo.com sob api.foo.com) — só quando o
// nível intermediário também foi escaneado; nunca fabrica um nó fantasma.
export function buildTree(graph: GraphResponse, rootId: string): TNode | null {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const root = byId.get(rootId)
  if (!root) return null

  const byType = new Map<string, Array<[string, string]>>()
  for (const e of graph.edges) {
    if (!byType.has(e.type)) byType.set(e.type, [])
    byType.get(e.type)!.push([e.source, e.target])
  }
  const targetsOf = (source: string, type: string) =>
    (byType.get(type) || []).filter(([s]) => s === source).map(([, t]) => byId.get(t)).filter(Boolean) as GraphNode[]

  const directSubs = targetsOf(rootId, 'has_subdomain')
  const hostToId = new Map(directSubs.map((n) => [n.label.toLowerCase(), n.id]))
  const parentOf = new Map<string, string>()
  for (const n of directSubs) {
    const labels = n.label.toLowerCase().split('.')
    let parent = rootId
    for (let i = 1; i < labels.length - 1; i++) {
      const candidate = labels.slice(i).join('.')
      if (candidate === root.label.toLowerCase()) break
      const cid = hostToId.get(candidate)
      if (cid && cid !== n.id) { parent = cid; break }
    }
    parentOf.set(n.id, parent)
  }
  const childrenOf = new Map<string, GraphNode[]>()
  for (const n of directSubs) {
    const p = parentOf.get(n.id)!
    if (!childrenOf.has(p)) childrenOf.set(p, [])
    childrenOf.get(p)!.push(n)
  }

  function build(g: GraphNode): TNode {
    const vulns = targetsOf(g.id, 'vulnerable_to')
    const exposures = targetsOf(g.id, 'exposes')
    const ips = targetsOf(g.id, 'resolves_to')
    const techs = targetsOf(g.id, 'runs')
    const webservers = targetsOf(g.id, 'served_by')
    const children = (childrenOf.get(g.id) || [])
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(build)

    let worstSev: string | null = null
    for (const v of vulns) worstSev = bestSev(worstSev, String(v.meta.severity))
    let vulnCount = vulns.length
    for (const c of children) { worstSev = bestSev(worstSev, c.worstSev); vulnCount += c.vulnCount }

    return { g, children, vulns, exposures, ips, techs, webservers, worstSev, vulnCount }
  }

  return build(root)
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(4,4,10,0.6)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--panel)', border: '1px solid var(--border-mid)', borderRadius: 14,
        padding: '1.4rem 1.5rem', width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}>
        {children}
      </div>
    </div>
  )
}

function ModalHeader({ title, subtitle, color, onClose }: { title: string; subtitle?: string; color?: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
      <div style={{ minWidth: 0 }}>
        {subtitle && <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: color || 'var(--muted)', marginBottom: 4 }}>{subtitle}</div>}
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', wordBreak: 'break-word', fontFamily: 'var(--mono)' }}>{title}</div>
      </div>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-mute)', flexShrink: 0 }}><X size={16} /></button>
    </div>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  if (v == null || v === '') return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-mute)', flexShrink: 0 }}>{k}</span>
      <span style={{ color: 'var(--muted)', textAlign: 'right', wordBreak: 'break-word' }}>{v}</span>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
        {icon}{title}
      </div>
      {children}
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 10.5, fontFamily: 'var(--mono)', background: 'rgba(2,2,8,0.5)', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 99, padding: '2px 8px' }}>{children}</span>
}

export function HostModal({ node, onClose, onSelectVuln, engagements = [] }: {
  node: TNode; onClose: () => void; onSelectVuln: (v: GraphNode) => void; engagements?: Engagement[]
}) {
  const m = node.g.meta
  const isDomain = node.g.type === 'domain'
  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title={node.g.label} subtitle={isDomain ? 'Domínio' : 'Subdomínio'} color="var(--purple-light)" onClose={onClose} />
      {isDomain && (
        <Section title="Engagements" icon={<Target size={12} />}>
          {engagements.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>Nenhum engagement rodado ainda para este alvo.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {engagements.map((e) => {
                const rs = e.runState ?? (e.status === 'completed' ? 'completed' : 'idle')
                const badge = RS_BADGE[rs] || RS_BADGE.idle
                return (
                  <Link key={e.id} href={`/engagement/${e.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}>
                      <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                      <span style={{
                        fontSize: 8.5, fontWeight: 700, borderRadius: 99, letterSpacing: '0.05em', padding: '2px 7px', flexShrink: 0,
                        background: `color-mix(in srgb, ${badge.c} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${badge.c} 30%, transparent)`, color: badge.c,
                      }}>{badge.t}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </Section>
      )}
      {!isDomain && (
        <div style={{ marginBottom: 4 }}>
          <Row k="Status" v={m.alive ? 'vivo' : 'sem resposta'} />
          <Row k="HTTP" v={m.statusCode as React.ReactNode} />
          <Row k="Título" v={m.title as React.ReactNode} />
          <Row k="Esquema" v={m.scheme as React.ReactNode} />
        </div>
      )}
      {node.ips.length > 0 && (
        <Section title="IPs & portas" icon={<Network size={12} />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {node.ips.map((ip) => {
              const ports = (ip.meta.ports as Array<{ port: number; service?: string | null; severity: string; thirdParty?: boolean; provider?: string | null }>) || []
              const prov = ports.find((p) => p.thirdParty)?.provider
              return (
                <div key={ip.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{ip.label}</span>
                    {prov && <span title="IP de provedor/CDN — infra de terceiro, não sua exposição" style={{ fontSize: 8.5, fontFamily: 'var(--mono)', color: 'var(--info)', background: 'color-mix(in srgb, var(--info) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--info) 30%, transparent)', borderRadius: 99, padding: '1px 7px' }}>SaaS · {prov}</span>}
                  </div>
                  {ports.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      {ports.map((p, i) => {
                        const risky = p.severity !== 'info'
                        const c = risky ? (SEV_COLOR[p.severity] || SEV_COLOR.info) : null
                        return (
                          <span key={i} title={p.service || ''} style={{
                            fontSize: 10, fontFamily: 'var(--mono)', borderRadius: 5, padding: '1px 7px', whiteSpace: 'nowrap',
                            color: risky ? c! : 'var(--muted)', fontWeight: risky ? 700 : 400,
                            background: risky ? `color-mix(in srgb, ${c} 12%, transparent)` : 'var(--surface2)',
                            border: `1px solid ${risky ? `color-mix(in srgb, ${c} 34%, transparent)` : 'var(--border)'}`,
                          }}>{p.port}{p.service ? `/${p.service}` : ''}</span>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Section>
      )}
      {node.techs.length > 0 && (
        <Section title="Tecnologias" icon={<Cpu size={12} />}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{node.techs.map((t) => <Chip key={t.id}>{t.label}</Chip>)}</div>
        </Section>
      )}
      {node.webservers.length > 0 && (
        <Section title="Servidor web" icon={<HardDrive size={12} />}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{node.webservers.map((w) => <Chip key={w.id}>{w.label}</Chip>)}</div>
        </Section>
      )}
      {node.exposures.length > 0 && (
        <Section title="Exposições" icon={<AlertTriangle size={12} />}>
          {node.exposures.map((e) => (
            <div key={e.id} style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 0' }}>
              <span style={{ color: SEV_COLOR[String(e.meta.severity)] || SEV_COLOR.info, fontWeight: 700, marginRight: 6 }}>●</span>{e.label}
            </div>
          ))}
        </Section>
      )}
      {node.vulns.length > 0 && (
        <Section title="Vulnerabilidades correlacionadas" icon={<Bug size={12} />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {node.vulns.map((v) => (
              <button key={v.id} onClick={() => onSelectVuln(v)} style={{
                display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', background: 'var(--surface2)',
                border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit', width: '100%',
              }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: SEV_COLOR[String(v.meta.severity)] || SEV_COLOR.info, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.label}</span>
                <ChevronRight size={13} color="var(--text-mute)" />
              </button>
            ))}
          </div>
        </Section>
      )}
      {!isDomain && node.ips.length === 0 && node.techs.length === 0 && node.webservers.length === 0 && node.exposures.length === 0 && node.vulns.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 10 }}>Sem detalhes adicionais coletados ainda.</div>
      )}
    </ModalShell>
  )
}

export function VulnModal({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  const m = node.meta
  const color = SEV_COLOR[String(m.severity)] || SEV_COLOR.info
  const type = findingType({ state: m.state, severity: m.severity } as any)
  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title={node.label} subtitle={`${SEV_LABEL[String(m.severity)] || m.severity} · ${TYPE_LABEL[type]}`} color={color} onClose={onClose} />
      <div style={{ marginBottom: 4 }}>
        <Row k="Local" v={m.location as React.ReactNode} />
        <Row k="CVSS" v={m.cvss as React.ReactNode} />
        <Row k="OWASP" v={m.owasp as React.ReactNode} />
        <Row k="CWE" v={m.cwe as React.ReactNode} />
        <Row k="Descoberto por" v={m.discoveredBy as React.ReactNode} />
        <Row k="Confiança" v={m.confidence as React.ReactNode} />
      </div>
      {m.description ? <Section title="Descrição"><p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>{String(m.description)}</p></Section> : null}
      {m.evidence ? <Section title="Evidência"><pre style={{ fontSize: 11, color: 'var(--muted)', background: 'rgba(2,2,8,0.5)', padding: 10, borderRadius: 8, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{String(m.evidence)}</pre></Section> : null}
      {m.recommendation ? <Section title="Recomendação"><p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>{String(m.recommendation)}</p></Section> : null}
      <Section title="Rastro" icon={<Terminal size={12} />}>
        <TraceView findingId={node.id.replace(/^vuln:/, '')} />
      </Section>
    </ModalShell>
  )
}
