'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, LeakAssessment, LeakedCredential } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { SEV_COLOR, safeHref } from '@/lib/severity'
import { ArrowLeft, Loader2, Search, Trash2, Bug, ShieldAlert, Users, Database, Archive, Info, Globe } from 'lucide-react'

function rc(level: string) { return SEV_COLOR[level] || SEV_COLOR.info }
const fmt = (n: number) => n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'K' : String(n)
const PROV_LABEL: Record<string, string> = { mock: 'demo', leakcheck_public: 'leakcheck', leakcheck: 'leakcheck pro', hibp: 'hibp', dehashed: 'dehashed', hudsonrock: 'hudson rock' }
const HR_ENDPOINT = 'https://cavalier.hudsonrock.com/api/json/v2/osint-tools/search-by-domain?domain='

export default function ExposurePage() {
  const { domain: raw } = useParams<{ domain: string }>()
  const domain = decodeURIComponent(raw)
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [data, setData] = useState<LeakAssessment | null>(null)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [hr, setHr] = useState(false)
  const [hrOpen, setHrOpen] = useState(false)
  const [hrText, setHrText] = useState('')

  const load = useCallback(() => api.leaks.get(domain).then(setData).catch(() => router.replace('/vazamentos')).finally(() => setLoading(false)), [domain, router])
  useEffect(() => { load() }, [load])

  async function reSearch() {
    setSearching(true)
    try { await api.leaks.search(domain); await load() } catch (e) { alert(e instanceof Error ? e.message : 'Erro') } finally { setSearching(false) }
  }
  async function doDelete() {
    if (!confirm('Excluir este assessment e as credenciais coletadas?')) return
    try { await api.leaks.delete(domain); router.push('/vazamentos') } catch (e) { alert(e instanceof Error ? e.message : 'Erro') }
  }
  // A Hudson Rock bloqueia fetch() cross-origin (CORS) e o IP do servidor. Mas o
  // navegador CONSEGUE abrir a URL da API direto (navegação não sofre CORS). Então
  // o operador abre o link, copia o JSON e cola aqui — nós normalizamos/mascaramos.
  function trimHr(raw: Record<string, unknown>) {
    const d = (raw.data as Record<string, unknown>) || {}
    const slice = (k: string) => Array.isArray(d[k]) ? (d[k] as unknown[]).slice(0, 500) : []
    return {
      total: raw.total, totalStealers: raw.totalStealers, employees: raw.employees, users: raw.users,
      totalUrls: raw.totalUrls, third_parties: raw.third_parties, logo: raw.logo,
      last_employee_compromised: raw.last_employee_compromised, last_user_compromised: raw.last_user_compromised,
      stealerFamilies: raw.stealerFamilies,
      thirdPartyDomains: Array.isArray(raw.thirdPartyDomains) ? (raw.thirdPartyDomains as unknown[]).slice(0, 100) : [],
      data: { employees_urls: slice('employees_urls'), clients_urls: slice('clients_urls'), all_urls: slice('all_urls') },
    }
  }
  async function importHudsonRock() {
    let raw: Record<string, unknown>
    try { raw = JSON.parse(hrText) } catch { alert('JSON inválido. Cole o conteúdo exato que aparece ao abrir o link da Hudson Rock.'); return }
    setHr(true)
    try {
      const r = await api.leaks.ingest(domain, 'hudsonrock', trimHr(raw))
      await load()
      setHrOpen(false); setHrText('')
      alert(`Hudson Rock importado ✓ — ${r.ingested} URL(s) de infostealer + ${(r as { thirdParties?: number }).thirdParties || 0} domínio(s) de terceiros.`)
    } catch (e) { alert(e instanceof Error ? e.message : 'Erro ao importar') } finally { setHr(false) }
  }

  if (loading || !data) return <div style={{ padding: '3rem', color: 'var(--text-mute)', fontSize: 12, letterSpacing: '0.1em' }}>CARREGANDO...</div>

  const { assessment: a, credentials } = data
  const malware = credentials.filter((c) => c.category === 'malware')
  const breaches = dedupeBreaches(credentials.filter((c) => c.category !== 'malware'))
  const searched = !!data.summary?.lastSearchAt
  const providers = data.summary?.providersRan || []

  if (!searched && credentials.length === 0) {
    return (
      <div style={{ padding: '1.5rem 1.75rem', maxWidth: 1180, margin: '0 auto' }}>
        <Link href="/vazamentos" style={{ color: 'var(--purple-light)', fontSize: 13, display: 'inline-flex', gap: 6, alignItems: 'center', marginBottom: 20 }}><ArrowLeft size={15} /> Nova busca</Link>
        <div style={{ background: 'var(--surface)', border: '1px dashed var(--border-mid)', borderRadius: 12, padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
          <Database size={32} style={{ color: 'var(--text-mute)', marginBottom: 12 }} />
          <p style={{ fontSize: 15, margin: 0, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{domain}</p>
          <p style={{ fontSize: 12.5, margin: '6px 0 18px' }}>Nenhuma busca feita para este domínio ainda.</p>
          <button onClick={reSearch} disabled={searching} style={btnPrimary}>{searching ? <Loader2 size={15} className="spin" /> : <Search size={15} />} Rodar assessment</button>
        </div>
        <style jsx global>{`.spin { animation: spin 0.9s linear infinite; }`}</style>
      </div>
    )
  }

  const M = a.metrics
  return (
    <div style={{ padding: '1.5rem 1.75rem', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1180, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/vazamentos" style={{ color: 'var(--purple-light)', fontSize: 13, display: 'inline-flex', gap: 6, alignItems: 'center' }}><ArrowLeft size={15} /> Nova busca</Link>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={reSearch} disabled={searching} style={btnGhost}>{searching ? <Loader2 size={13} className="spin" /> : <Search size={13} />} Buscar de novo</button>
          <button onClick={() => setHrOpen(true)} disabled={hr} style={btnGhost} title="Importar dados da Hudson Rock (grátis, via colagem)">{hr ? <Loader2 size={13} className="spin" /> : <Database size={13} />} Hudson Rock</button>
          {isAdmin && <button onClick={doDelete} style={{ ...btnGhost, color: 'var(--text-mute)' }}><Trash2 size={13} /></button>}
        </div>
      </div>

      {/* Header do assessment (risco + domínio + senhas) */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.4rem 1.6rem', display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
        <RiskRing score={a.riskScore} level={a.riskLevel} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Exposure assessment</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 10px' }}>
            {safeHref(data.summary?.logo) && <img src={safeHref(data.summary?.logo)!} alt="" width={28} height={28} referrerPolicy="no-referrer" style={{ borderRadius: 6, objectFit: 'contain', background: '#fff', flexShrink: 0 }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />}
            <span style={{ fontSize: 30, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>{domain}</span>
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, color: rc(a.riskLevel), fontFamily: 'var(--mono)', lineHeight: 1 }}>{fmt(M.leakedPasswords)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>Senhas vazadas (total)</div>
        </div>
        <div style={{ minWidth: 200, alignSelf: 'stretch', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, background: 'rgba(2,2,8,0.35)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem 1.15rem' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center' }}><Info size={13} /> Fontes usadas</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {providers.length === 0 ? <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>—</span> : providers.map((p) => {
              const isDemo = p === 'mock'
              const col = isDemo ? 'var(--medium)' : 'var(--low)'
              return <span key={p} style={{ fontSize: 10, fontFamily: 'var(--mono)', textTransform: 'uppercase', color: col, background: `color-mix(in srgb, ${col} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${col} 30%, transparent)`, borderRadius: 99, padding: '2px 8px' }}>{PROV_LABEL[p] || p}</span>
            })}
          </div>
          {providers.length === 1 && providers[0] === 'mock' && (
            <p style={{ fontSize: 10, color: 'var(--text-mute)', margin: 0, lineHeight: 1.45 }}>Dados de demonstração. Autorize o domínio em <b style={{ color: 'var(--muted)' }}>Domínios</b> e configure uma chave para fontes reais.</p>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        <Kpi icon={<Archive size={18} />} value={M.malwareCompromises} label="Malware compromises" sub="Via infostealer" color="var(--high)" />
        <Kpi icon={<Database size={18} />} value={M.leakedPasswords} label="Senhas vazadas" sub="De listas de credenciais" color="var(--medium)" />
        <Kpi icon={<Users size={18} />} value={M.employeesAtRisk} label="Funcionários em risco" sub="Credenciais corporativas expostas" color="var(--critical)" />
        <Kpi icon={<ShieldAlert size={18} />} value={M.affectedUsers} label="Usuários afetados" sub="Encontrados em vazamentos" color="var(--info)" />
      </div>

      {/* Timeline + Famílias */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 12 }}>
        <Panel title="Exposure timeline" sub="Exposição mensal de credenciais (infostealer)">
          <Timeline points={a.timeline} />
        </Panel>
        <Panel title="Stealer families" sub="Malware responsável pelos comprometimentos">
          {a.stealerFamilies.length === 0 ? <NoSource /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
              {a.stealerFamilies.slice(0, 7).map((f) => (
                <div key={f.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>{f.name}</span>
                    <span style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{f.pct}% <span style={{ color: 'var(--text-mute)' }}>({f.count})</span></span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: 'rgba(2,2,8,0.6)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${f.pct}%`, background: 'var(--purple-light)', borderRadius: 99 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Employees (malware) */}
      <Panel title="Funcionários (malware)" sub="Credenciais corporativas em logs de infostealer">
        {malware.length === 0 ? <NoSource text="Nenhuma credencial de infostealer para este domínio." /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-mute)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <th style={th}>URL</th><th style={th}>Login</th><th style={th}>Senha</th><th style={th}>Stealer</th><th style={th}>Visto em</th>
                </tr>
              </thead>
              <tbody>
                {malware.slice(0, 100).map((c: LeakedCredential) => (
                  <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ ...td, fontFamily: 'var(--mono)', color: 'var(--text)', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sourceUrl || '—'}</td>
                    <td style={{ ...td, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{c.account || '—'}</td>
                    <td style={{ ...td, color: c.hasPassword ? 'var(--critical)' : 'var(--text-mute)', letterSpacing: 2 }}>{c.hasPassword ? '••••••••' : '—'}</td>
                    <td style={td}><span style={{ fontSize: 10.5, color: 'var(--high)', fontFamily: 'var(--mono)' }}>{c.stealerFamily || '—'}</span></td>
                    <td style={{ ...td, color: 'var(--text-mute)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{c.seenDate || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {malware.length > 100 && <div style={{ fontSize: 11, color: 'var(--text-mute)', padding: '8px 4px 0' }}>+{malware.length - 100} não exibidas</div>}
          </div>
        )}
      </Panel>

      {/* Breaches */}
      {breaches.length > 0 && (
        <Panel title="Aparições em vazamentos" sub="Bases de dados públicas onde o domínio apareceu">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {breaches.map((b) => (
              <div key={b.breachName} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.6rem 0.2rem', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, minWidth: 160 }}>{b.breachTitle || b.breachName}</span>
                <span style={{ fontSize: 11, color: 'var(--text-mute)', fontFamily: 'var(--mono)' }}>{b.breachDate || '—'}</span>
                {b.pwnCount ? <span style={{ fontSize: 11, color: 'var(--muted)' }}>{b.pwnCount.toLocaleString('pt-BR')} contas</span> : null}
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginLeft: 'auto' }}>
                  {(b.dataClasses || []).slice(0, 5).map((d) => <span key={d} style={{ fontSize: 9.5, fontFamily: 'var(--mono)', background: 'rgba(2,2,8,0.5)', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 99, padding: '2px 7px' }}>{d}</span>)}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Credenciais em domínios de terceiros (Hudson Rock) — exposição de cadeia */}
      {data.summary?.thirdPartyDomains && data.summary.thirdPartyDomains.length > 0 && (() => {
        const tp = data.summary.thirdPartyDomains
        const totalOcc = tp.reduce((s, t) => s + (t.occurrence || 0), 0) || 1
        return (
          <Panel title="Credenciais em domínios de terceiros" sub="Serviços/fornecedores onde os funcionários deste domínio vazaram credencial — exposição de cadeia (Hudson Rock)">
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-mute)', marginBottom: 10 }}>
              <span>{tp.length} domínio(s) único(s)</span><span>{totalOcc} ocorrências</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {tp.slice(0, 40).map((t) => (
                <div key={t.domain} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.5rem 0.2rem', borderBottom: '1px solid var(--border)' }}>
                  <Globe size={13} color="var(--text-mute)" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, color: 'var(--text)', fontFamily: 'var(--mono)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.domain}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-mute)', minWidth: 34, textAlign: 'right' }}>{Math.round((t.occurrence / totalOcc) * 100)}%</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--high)', fontFamily: 'var(--mono)', minWidth: 26, textAlign: 'right' }}>{t.occurrence}</span>
                </div>
              ))}
            </div>
          </Panel>
        )
      })()}

      {/* Modal de importação da Hudson Rock */}
      {hrOpen && (
        <div onClick={() => setHrOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border-mid)', borderRadius: 14, padding: '1.4rem 1.6rem', width: 'min(680px, 100%)', maxHeight: '86vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
              <Database size={17} color="var(--purple-light)" />
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Importar Hudson Rock (grátis)</span>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 10px', lineHeight: 1.55 }}>
              A Hudson Rock bloqueia consulta automática do nosso servidor, mas o seu navegador acessa. Faça:
            </p>
            <ol style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 12px', paddingLeft: 18, lineHeight: 1.8 }}>
              <li><a href={HR_ENDPOINT + encodeURIComponent(domain)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--purple-light)', fontWeight: 600 }}>Abrir a consulta da Hudson Rock ↗</a> (abre o JSON numa aba nova)</li>
              <li>Selecione tudo (<b style={{ color: 'var(--muted)' }}>Ctrl+A</b>) e copie (<b style={{ color: 'var(--muted)' }}>Ctrl+C</b>)</li>
              <li>Cole abaixo e clique <b style={{ color: 'var(--muted)' }}>Importar</b></li>
            </ol>
            <textarea value={hrText} onChange={(e) => setHrText(e.target.value)} placeholder="Cole aqui o JSON da Hudson Rock…"
              style={{ width: '100%', minHeight: 150, boxSizing: 'border-box', background: 'rgba(2,2,8,0.6)', border: '1px solid var(--border-mid)', borderRadius: 8, color: 'var(--text)', fontSize: 11.5, fontFamily: 'var(--mono)', padding: 10, outline: 'none', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={() => { setHrOpen(false); setHrText('') }} style={btnGhost}>Cancelar</button>
              <button onClick={importHudsonRock} disabled={hr || !hrText.trim()} style={{ ...btnPrimary, opacity: hr || !hrText.trim() ? 0.6 : 1 }}>{hr ? <Loader2 size={14} className="spin" /> : <Database size={14} />} Importar</button>
            </div>
          </div>
        </div>
      )}

      {/* Atribuição exigida por licença das fontes */}
      {(providers.includes('leakcheck_public') || providers.includes('hibp') || providers.includes('hudsonrock')) && (
        <div style={{ fontSize: 10.5, color: 'var(--text-mute)', textAlign: 'right', paddingTop: 4 }}>
          {providers.includes('leakcheck_public') && <>Dados de exposição · Powered by <b style={{ color: 'var(--muted)' }}>LeakCheck</b>. </>}
          {providers.includes('hibp') && <>Breach data · <b style={{ color: 'var(--muted)' }}>Have I Been Pwned</b> (CC BY 4.0).</>}
        </div>
      )}

      <style jsx global>{`.spin { animation: spin 0.9s linear infinite; }`}</style>
    </div>
  )
}

// ── helpers de UI ─────────────────────────────────────────────────────────────
const th: React.CSSProperties = { padding: '6px 10px', fontWeight: 600 }
const td: React.CSSProperties = { padding: '8px 10px' }
const btnPrimary: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: 'var(--purple)', border: 'none', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 0 18px var(--purple-glow)' }
const btnGhost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--bg)', border: '1px solid var(--border-mid)', borderRadius: 7, color: 'var(--purple-light)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }

function dedupeBreaches(creds: LeakedCredential[]) {
  const map: Record<string, LeakedCredential> = {}
  for (const c of creds) { const k = c.breachName || c.breachTitle || '?'; if (!map[k]) map[k] = c }
  return Object.values(map)
}

function RiskRing({ score, level }: { score: number; level: string }) {
  const color = rc(level)
  const r = 52, circ = 2 * Math.PI * r
  const off = circ * (1 - Math.min(100, score) / 100)
  return (
    <div style={{ position: 'relative', width: 132, height: 132, flexShrink: 0 }}>
      <svg width="132" height="132" viewBox="0 0 132 132">
        <circle cx="66" cy="66" r={r} fill="none" stroke="rgba(124,58,237,0.12)" strokeWidth="9" />
        <circle cx="66" cy="66" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} transform="rotate(-90 66 66)" style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 38, fontWeight: 700, color, fontFamily: 'var(--mono)', lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 8, color: 'var(--text-mute)', letterSpacing: '0.12em', marginTop: 3 }}>RISK LEVEL</div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color, textTransform: 'capitalize' }}>{level}</div>
      </div>
    </div>
  )
}

function Kpi({ icon, value, label, sub, color }: { icon: React.ReactNode; value: number; label: string; sub: string; color: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem 1.15rem', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: color }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{label}</span>
        <span style={{ color, opacity: 0.85 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color, fontFamily: 'var(--mono)', lineHeight: 1 }}>{fmt(value)}</div>
      <div style={{ fontSize: 10.5, color: 'var(--text-mute)', marginTop: 4 }}>{sub}</div>
    </div>
  )
}

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.1rem 1.25rem' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
        {sub && <div style={{ fontSize: 11.5, color: 'var(--text-mute)', marginTop: 2 }}>{sub}</div>}
      </div>
      {children}
    </div>
  )
}

function NoSource({ text }: { text?: string }) {
  return <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-mute)', fontSize: 12, fontStyle: 'italic' }}>{text || 'Sem fonte para este dado — plugue uma fonte de infostealer para preencher.'}</div>
}

function Timeline({ points }: { points: Array<{ month: string; count: number }> }) {
  if (!points || points.length === 0) return <NoSource text="Sem dados de timeline." />
  const W = 620, H = 170, pad = 26
  const max = Math.max(...points.map((p) => p.count), 1)
  const n = points.length
  const x = (i: number) => pad + (i * (W - 2 * pad)) / Math.max(1, n - 1)
  const y = (v: number) => H - pad - (v / max) * (H - 2 * pad)
  const line = points.map((p, i) => `${x(i)},${y(p.count)}`).join(' ')
  const area = `${x(0)},${H - pad} ${line} ${x(n - 1)},${H - pad}`
  const labelIdx = n <= 4 ? points.map((_, i) => i) : [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1]
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="tlg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--purple)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--purple)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={pad} x2={W - pad} y1={pad + g * (H - 2 * pad)} y2={pad + g * (H - 2 * pad)} stroke="rgba(124,58,237,0.08)" strokeWidth="1" />)}
      <polygon points={area} fill="url(#tlg)" />
      <polyline points={line} fill="none" stroke="var(--purple-light)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.count)} r={n > 30 ? 0 : 2.5} fill="var(--purple-light)" />)}
      {labelIdx.map((i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#3A3A58" fontFamily="var(--mono)">{points[i].month}</text>)}
    </svg>
  )
}
