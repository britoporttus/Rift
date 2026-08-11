'use client'
// Badge de monitoramento (#2b / A4) — sino no topbar com a contagem de eventos
// não-vistos (novo subdomínio, exposição alta, CVE…). Clicar leva ao feed na home
// de Domínios e marca como visto. Só aparece para quem tem acesso a Domínios.
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { effectiveDepth } from '@/lib/depth'
import { Bell } from 'lucide-react'

export function MonitorBadge() {
  const { user } = useAuth()
  const router = useRouter()
  const [unseen, setUnseen] = useState(0)

  // Domínios (ASM) só é acessível a interno ou cliente-técnico — o sino segue essa regra.
  const canSee = !!user && (user.role !== 'client' || effectiveDepth(user) === 'tecnico')

  const load = useCallback(() => {
    if (!canSee) return
    api.monitor.events(1, true).then((r) => setUnseen(r.unseen)).catch(() => {})
  }, [canSee])

  useEffect(() => {
    load()
    const iv = setInterval(() => { if (!document.hidden) load() }, 60000)
    return () => clearInterval(iv)
  }, [load])

  if (!canSee) return null

  async function go() {
    if (unseen > 0) { api.monitor.markSeen().catch(() => {}); setUnseen(0) }
    router.push('/dominios')
  }

  return (
    <button onClick={go} title={unseen > 0 ? `${unseen} evento(s) de monitoramento` : 'Monitoramento'}
      aria-label="Monitoramento"
      style={{ position: 'relative', display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 7, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
      <Bell size={16} />
      {unseen > 0 && (
        <span style={{
          position: 'absolute', top: -2, right: -2, minWidth: 15, height: 15, padding: '0 3px',
          borderRadius: 8, background: 'var(--critical)', color: '#fff', fontSize: 9, fontWeight: 700,
          display: 'grid', placeItems: 'center', border: '2px solid var(--panel)', fontFamily: 'var(--mono)',
        }}>{unseen > 9 ? '9+' : unseen}</span>
      )}
    </button>
  )
}
