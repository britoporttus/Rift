'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api, LeakDomainSummary, LeakProvider } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { SEV_COLOR } from '@/lib/severity'
import { clickableDivProps } from '@/lib/a11y'
import { Database, Search, Loader2, ShieldAlert, KeyRound, Check, X, Users, Bug, Server } from 'lucide-react'

function rc(level: string) { return SEV_COLOR[level] || SEV_COLOR.info }
const inputStyle: React.CSSProperties = {
  background: 'rgba(2,2,8,0.6)', border: '1px solid var(--border-mid)', borderRadius: 8,
  color: 'var(--text)', fontSize: 14, padding: '10px 14px', fontFamily: 'var(--mono)', outline: 'none',
}
function miniBtn(color: string): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, background: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`, color, cursor: 'pointer' }
}

// Painel de chaves de API (admin) — vive no módulo Vazamentos.
function ProvidersPanel() {
  const [providers, setProviders] = useState<LeakProvider[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [key, setKey] = useState(''); const [user, setUser] = useState(''); const [saving, setSaving] = useState(false)
  const load = useCallback(() => { api.leaks.providers().then(setProviders).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  async function save(id: string) {
    setSaving(true)
    try { await api.leaks.setProviderKey(id, { apiKey: key, ...(id === 'dehashed' ? { apiUser: user } : {}) }); setEditing(null); setKey(''); setUser(''); load() }
    catch (e) { alert(e instanceof Error ? e.message : 'Erro') } finally { setSaving(false) }
  }
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem 1.15rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <KeyRound size={14} color="var(--purple-light)" />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Fontes de dados (chaves de API)</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {providers.map((p) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 200 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: p.configured ? 'var(--low)' : 'var(--text-dim)' }} />
              <span style={{ fontSize: 12.5, color: 'var(--text)' }}>{p.label}</span>
              <span style={{ fontSize: 9.5, color: 'var(--text-mute)', fontFamily: 'var(--mono)' }}>{p.configured ? 'configurado' : (p.needsKey ? 'sem chave' : 'sempre disponível')}</span>
            </div>
            {p.needsKey && (editing === p.id ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>
                {p.id === 'dehashed' && <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="e-mail da conta" style={{ ...inputStyle, fontSize: 12, padding: '5px 9px' }} />}
                <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="chave de API" type="password" style={{ ...inputStyle, fontSize: 12, padding: '5px 9px', flex: 1 }} />
                <button onClick={() => save(p.id)} disabled={saving} style={miniBtn('var(--low)')}>{saving ? <Loader2 size={12} className="spin" /> : <Check size={13} />}</button>
                <button onClick={() => { setEditing(null); setKey(''); setUser('') }} style={miniBtn('var(--muted)')}><X size={13} /></button>
              </div>
            ) : (
              <button onClick={() => { setEditing(p.id); setKey(''); setUser('') }} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border-mid)', color: 'var(--purple-light)', cursor: 'pointer', fontFamily: 'inherit' }}>{p.configured ? 'Trocar chave' : 'Adicionar chave'}</button>
            ))}
          </div>
        ))}
      </div>
      <p style={{ fontSize: 10.5, color: 'var(--text-mute)', margin: '10px 0 0', lineHeight: 1.5 }}>
        <b style={{ color: 'var(--muted)' }}>LeakCheck público</b> (agregado, sem chave) roda sempre. Fontes <b style={{ color: 'var(--muted)' }}>record-level</b> (HIBP/DeHashed) só rodam em domínio <b style={{ color: 'var(--muted)' }}>autorizado</b> no módulo Domínios (base contratual). O <b style={{ color: 'var(--muted)' }}>demo</b> é fallback quando nenhuma fonte real responde.
      </p>
    </div>
  )
}

export default function VazamentosPage() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [searches, setSearches] = useState<LeakDomainSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)

  const load = useCallback(() => api.leaks.list().then(setSearches).catch(console.error).finally(() => setLoading(false)), [])
  useEffect(() => { load() }, [load])

  async function doSearch() {
    const d = query.trim()
    if (!d) return
    setSearching(true)
    try { await api.leaks.search(d); router.push(`/vazamentos/${encodeURIComponent(d.toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, ''))}`) }
    catch (e) { alert(e instanceof Error ? e.message : 'Erro na busca'); setSearching(false) }
  }

  return (
    <div style={{ padding: '1.5rem 1.75rem', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1180, margin: '0 auto', width: '100%' }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
          <Database size={18} color="var(--purple-light)" /> Vazamentos
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '3px 0 0' }}>
          Exposição de credenciais por domínio — infostealer, breaches e combolists. Busque um domínio para o assessment.
        </p>
      </div>

      {/* Barra de busca */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={16} color="var(--text-mute)" style={{ position: 'absolute', left: 13, top: 13 }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            placeholder="penso.com.br" style={{ ...inputStyle, width: '100%', paddingLeft: 38 }} />
        </div>
        <button onClick={doSearch} disabled={searching || !query.trim()}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px', background: 'var(--purple)', border: 'none', borderRadius: 8, color: 'white', fontSize: 13.5, fontWeight: 700, cursor: searching ? 'default' : 'pointer', opacity: searching || !query.trim() ? 0.6 : 1, fontFamily: 'inherit', boxShadow: '0 0 18px var(--purple-glow-strong)' }}>
          {searching ? <Loader2 size={15} className="spin" /> : <Search size={15} />} Buscar
        </button>
      </div>

      {/* Histórico de buscas */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
          Buscas recentes <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>({searches.length})</span>
        </div>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {[0, 1].map((i) => <div key={i} style={{ height: 110, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, animation: 'pulse 1.4s ease-in-out infinite' }} />)}
          </div>
        ) : searches.length === 0 ? (
          <div style={{ background: 'var(--surface)', border: '1px dashed var(--border-mid)', borderRadius: 12, padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ margin: '0 auto 1rem', display: 'flex', justifyContent: 'center', color: 'var(--text-mute)' }}><Database size={32} /></div>
            <p style={{ fontSize: 14, margin: 0 }}>Nenhuma busca ainda.</p>
            <p style={{ fontSize: 12, margin: '6px 0 0', color: 'var(--text-mute)' }}>Digite um domínio acima para o primeiro assessment de exposição.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {searches.map((s) => {
              const isH = hovered === s.id
              return (
                <div key={s.id} {...clickableDivProps(() => router.push(`/vazamentos/${encodeURIComponent(s.domain)}`))}
                  onMouseEnter={() => setHovered(s.id)} onMouseLeave={() => setHovered(null)}
                  style={{ background: 'var(--surface)', border: `1px solid ${isH ? 'var(--border-mid)' : 'var(--border)'}`, borderRadius: 12, padding: '1rem', cursor: 'pointer', transition: 'all 0.13s', boxShadow: isH ? '0 6px 24px var(--purple-glow-strong)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.domain}</div>
                    <div style={{ textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ fontSize: 24, fontWeight: 700, color: rc(s.riskLevel), fontFamily: 'var(--mono)', lineHeight: 1 }}>{s.riskScore}</div>
                      <div style={{ fontSize: 7.5, color: 'var(--text-mute)', letterSpacing: '0.1em', marginTop: 2 }}>RISK</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 14 }}>
                    <MiniStat icon={<Bug size={12} />} label="malware" value={s.malwareCompromises} color="var(--high)" />
                    <MiniStat icon={<ShieldAlert size={12} />} label="senhas" value={s.leakedPasswords} color="var(--critical)" />
                    <MiniStat icon={<Users size={12} />} label="funcionários" value={s.employeesAtRisk} color="var(--medium)" />
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {(s.providersRan || []).map((p) => (
                      <span key={p} style={{ fontSize: 8.5, fontFamily: 'var(--mono)', color: p === 'mock' ? 'var(--text-mute)' : 'var(--low)', background: 'rgba(2,2,8,0.5)', border: '1px solid var(--border)', borderRadius: 99, padding: '2px 7px', textTransform: 'uppercase' }}>{p === 'mock' ? 'demo' : p}</span>
                    ))}
                    {s.lastSearchAt && <span style={{ fontSize: 9.5, color: 'var(--text-mute)', marginLeft: 'auto' }}>{new Date(s.lastSearchAt).toLocaleDateString('pt-BR')}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {isAdmin && <ProvidersPanel />}
      <style jsx global>{`.spin { animation: spin 0.9s linear infinite; }`}</style>
    </div>
  )
}

function MiniStat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 15, fontWeight: 700, color, fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: 5 }}>{icon}{value}</span>
      <span style={{ fontSize: 9, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
    </div>
  )
}
