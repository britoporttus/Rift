'use client'
// Correlação leve de credenciais (#4) — pessoas/e-mails do domínio, cruzados com
// vazamentos. LAZY: só busca (e só então dispara requests ao alvo) quando o
// operador abre a seção. E-mails vêm mascarados do backend (LGPD).
import { useState } from 'react'
import { api, DomainPeople } from '@/lib/api'
import { Collapsible, tint } from '@/components/ui/kit'
import { Users, Mail, ShieldAlert, Loader2, UserRound } from 'lucide-react'

export function PeoplePanel({ domainId }: { domainId: string }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<DomainPeople | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function onToggle() {
    const next = !open
    setOpen(next)
    if (next && !data && !loading) {
      setLoading(true); setErr(null)
      api.domains.people(domainId)
        .then(setData)
        .catch((e) => setErr(e instanceof Error ? e.message : 'falha'))
        .finally(() => setLoading(false))
    }
  }

  const meta = data ? `${data.counts.people} pessoa(s)${data.counts.leaked ? ` · ${data.counts.leaked} em vazamento` : ''}` : 'buscar na superfície pública'

  return (
    <Collapsible title="Pessoas & e-mails" icon={<Users size={12} />} open={open} onToggle={onToggle} meta={meta}
      count={data ? data.people.length : undefined}>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--muted)', padding: '6px 0' }}>
          <Loader2 size={14} className="spin" /> Buscando e-mails publicados no domínio…
        </div>
      ) : err ? (
        <div style={{ fontSize: 12.5, color: 'var(--high)' }}>{err}</div>
      ) : data ? (
        <>
          {data.pattern && (
            <div style={{ fontSize: 11.5, color: 'var(--text-mute)', marginBottom: 10 }}>
              Padrão de e-mail provável: <span style={{ fontFamily: 'var(--mono)', color: 'var(--purple-light)' }}>{data.pattern}</span>@{data.domain}
            </div>
          )}
          {data.people.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Nenhum e-mail encontrado na superfície pública do domínio.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {data.people.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                  <span style={{ color: p.role ? 'var(--text-dim)' : 'var(--purple-light)', flexShrink: 0 }}>
                    {p.role ? <Mail size={13} /> : <UserRound size={13} />}
                  </span>
                  <span style={{ fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.masked}</span>
                  {p.role && <span style={{ fontSize: 9.5, color: 'var(--text-mute)', fontFamily: 'var(--mono)' }}>papel</span>}
                  {p.inLeak && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 700, color: 'var(--critical)', background: tint('var(--critical)', 13), border: `1px solid ${tint('var(--critical)', 30)}`, borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                      <ShieldAlert size={10} /> em vazamento
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 12, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            Fonte: superfície pública do próprio alvo (e-mails que a empresa publica). Hunter.io entra quando houver chave. E-mails mascarados (LGPD).
          </div>
        </>
      ) : null}
    </Collapsible>
  )
}
