'use client'
// Badge de monitoramento (#2b / A4) — sino no topbar. Faz duas coisas:
//  1) Dropdown com os eventos recentes (novo subdomínio, exposição alta, CVE,
//     takeover, piora de exposição) — clicar no sino mostra O QUE mudou, sem
//     precisar sair da tela; abrir marca tudo como visto e limpa o badge.
//  2) Toast em tempo (quase) real: a cada poll, evento realmente novo vira um
//     toast — o operador é avisado mesmo em outra tela do app.
// Só aparece para quem tem acesso a Domínios (interno ou cliente-técnico).
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api, MonitorEvent } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { effectiveDepth } from '@/lib/depth'
import { useToast } from '@/components/ui/Toast'
import { SEV_COLOR } from '@/lib/severity'
import { R } from '@/components/ui/kit'
import { Bell } from 'lucide-react'

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m}min`
  const h = Math.round(m / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.round(h / 24)}d`
}

const TYPE_LABEL: Record<string, string> = {
  new_subdomain: 'novo subdomínio',
  new_exposure: 'nova exposição',
  new_cve: 'novo CVE',
  takeover_candidate: 'possível takeover',
  score_worsened: 'exposição piorou',
}

export function MonitorBadge() {
  const { user } = useAuth()
  const router = useRouter()
  const { push } = useToast()
  const [events, setEvents] = useState<MonitorEvent[]>([])
  const [unseen, setUnseen] = useState(0)
  const [open, setOpen] = useState(false)
  const knownIds = useRef<Set<string> | null>(null)   // null = ainda não semeado
  const wrapRef = useRef<HTMLDivElement>(null)

  // Domínios (ASM) só é acessível a interno ou cliente-técnico — o sino segue essa regra.
  const canSee = !!user && (user.role !== 'client' || effectiveDepth(user) === 'tecnico')

  const load = useCallback(() => {
    if (!canSee) return
    api.monitor.events(20, false).then((r) => {
      setEvents(r.events)
      setUnseen(r.unseen)
      // Primeira carga: semeia os ids conhecidos SEM notificar — não queremos um
      // toast retroativo de tudo que já existia. Nas cargas seguintes, só o que é
      // realmente novo (id inédito) e ainda não visto vira toast.
      if (knownIds.current === null) {
        knownIds.current = new Set(r.events.map((e) => e.id))
      } else {
        const fresh = r.events.filter((e) => !e.seen && !knownIds.current!.has(e.id))
        for (const e of fresh.slice(0, 3)) {
          push({
            severity: e.severity,
            title: e.title,
            detail: `${e.domain} · ${TYPE_LABEL[e.type] || e.type}`,
            onClick: () => router.push('/dominios'),
          })
        }
        for (const e of r.events) knownIds.current!.add(e.id)
      }
    }).catch(() => {})
  }, [canSee, push, router])

  useEffect(() => {
    load()
    const iv = setInterval(() => { if (!document.hidden) load() }, 60000)
    const onVis = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis) }
  }, [load])

  // Fecha o dropdown ao clicar fora.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (!canSee) return null

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && unseen > 0) {
      api.monitor.markSeen().catch(() => {})
      setUnseen(0)
      setEvents((es) => es.map((e) => ({ ...e, seen: true })))
    }
  }

  function goHome() { setOpen(false); router.push('/dominios') }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button onClick={toggle}
        title={unseen > 0 ? `${unseen} evento(s) de monitoramento` : 'Monitoramento'}
        aria-label="Monitoramento"
        style={{ position: 'relative', display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 7, background: open ? 'var(--surface2)' : 'transparent', border: 'none', cursor: 'pointer', color: unseen > 0 ? 'var(--purple-light)' : 'var(--muted)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface2)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = open ? 'var(--surface2)' : 'transparent')}>
        <Bell size={16} />
        {unseen > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, minWidth: 15, height: 15, padding: '0 3px',
            borderRadius: 8, background: 'var(--critical)', color: '#fff', fontSize: 9, fontWeight: 700,
            display: 'grid', placeItems: 'center', border: '2px solid var(--panel)', fontFamily: 'var(--mono)',
          }}>{unseen > 9 ? '9+' : unseen}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 40, right: 0, width: 344, zIndex: 60,
          background: 'var(--surface)', border: '1px solid var(--border-mid)', borderRadius: R.card,
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)', overflow: 'hidden',
        }}>
          <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>Monitoramento</div>
            <div style={{ fontSize: 10.5, color: 'var(--text-mute)', fontFamily: 'var(--mono)', marginTop: 1 }}>o que mudou que importa</div>
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {events.length === 0 ? (
              <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: 12, color: 'var(--text-mute)' }}>Nenhum evento recente.</div>
            ) : events.map((e) => {
              const color = SEV_COLOR[e.severity] || SEV_COLOR.info
              return (
                <div key={e.id} onClick={goHome}
                  style={{ display: 'flex', gap: 9, padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onMouseEnter={(ev) => (ev.currentTarget.style.background = 'var(--surface2)')}
                  onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: color, marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.35 }}>{e.title}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-mute)', marginTop: 2, fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {e.domain} · {TYPE_LABEL[e.type] || e.type} · {relTime(e.at)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <button onClick={goHome}
            style={{ width: '100%', padding: '10px', background: 'transparent', border: 'none', borderTop: '1px solid var(--border)', color: 'var(--purple-light)', fontSize: 11.5, cursor: 'pointer', fontWeight: 600 }}>
            Ver na home de Domínios →
          </button>
        </div>
      )}
    </div>
  )
}
