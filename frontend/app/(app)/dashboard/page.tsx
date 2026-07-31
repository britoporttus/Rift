'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Reforma de UX 2026-07: a entrada da plataforma passou a ser Domínios. O Dashboard
// saiu do menu; esta rota vira um redirect para não quebrar links/bookmarks antigos.
// As métricas de infra/tokens seguem no painel Admin.
export default function DashboardRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/dominios') }, [router])
  return (
    <div style={{ padding: '3rem', color: 'var(--text-mute)', fontSize: 12, letterSpacing: '0.1em' }}>
      REDIRECIONANDO PARA DOMÍNIOS...
    </div>
  )
}
