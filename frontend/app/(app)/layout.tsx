'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Sidebar } from '@/components/ui/Sidebar'

const GRID_BG = {
  backgroundImage: 'linear-gradient(rgba(124,58,237,0.024) 1px,transparent 1px),linear-gradient(90deg,rgba(124,58,237,0.024) 1px,transparent 1px)',
  backgroundSize: '40px 40px',
}

const PAGE_NAMES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dominios': 'Domínios',
  '/vazamentos': 'Vazamentos',
  '/mapa': 'Mapa de Superfície',
  '/findings': 'Findings',
  '/reports': 'Relatórios',
  '/admin/users': 'Usuários',
  '/admin': 'Admin',
}

function TopBar({ pageName }: { pageName: string }) {
  return (
    <div style={{
      height: 52, flexShrink: 0,
      background: 'var(--panel)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      padding: '0 1.75rem',
      gap: 12,
      zIndex: 9,
    }}>
      {/* Breadcrumb */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-mute)', letterSpacing: '0.04em' }}>Rift</span>
        {pageName && (
          <>
            <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>›</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{pageName}</span>
          </>
        )}
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 5, height: 5, borderRadius: '50%', background: 'var(--low)',
            animation: 'pulse 2.5s ease-in-out infinite',
            boxShadow: '0 0 5px color-mix(in srgb, var(--low) 60%, transparent)',
          }} />
          <span style={{ fontSize: 10.5, color: 'var(--text-mute)', letterSpacing: '0.06em' }}>Sistema online</span>
        </div>
      </div>
    </div>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth()
  const router = useRouter()
  const path = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const pageName = PAGE_NAMES[path] ?? ''

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--bg)', color: 'var(--text-mute)', fontSize: 12,
        letterSpacing: '0.1em',
      }}>
        LOADING...
      </div>
    )
  }

  if (!user) return null

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
      <Sidebar
        user={user}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        onLogout={() => { logout(); router.replace('/login') }}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar pageName={pageName} />
        <main style={{ flex: 1, overflow: 'auto', ...GRID_BG }}>
          {children}
        </main>
      </div>
    </div>
  )
}
