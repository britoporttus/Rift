'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { Sidebar } from '@/components/ui/Sidebar'

const GRID_BG = {
  backgroundImage: 'linear-gradient(rgba(124,58,237,0.024) 1px,transparent 1px),linear-gradient(90deg,rgba(124,58,237,0.024) 1px,transparent 1px)',
  backgroundSize: '40px 40px',
}

const PAGE_NAMES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/findings': 'Findings',
  '/reports': 'Relatórios',
  '/admin/users': 'Usuários',
  '/admin': 'Admin',
}

function SI({ s = 15, c = 'currentColor', sw = 1.75, children }: { s?: number; c?: string; sw?: number; children: React.ReactNode }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'block' }}>
      {children}
    </svg>
  )
}

const PlusIco = (s?: number, c?: string) => <SI s={s || 12} c={c || '#A78BFA'} sw={2}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></SI>

function TopBar({ pageName, collapsed }: { pageName: string; collapsed: boolean }) {
  return (
    <div style={{
      height: 52, flexShrink: 0,
      background: '#050510',
      borderBottom: '1px solid rgba(124,58,237,0.13)',
      display: 'flex', alignItems: 'center',
      padding: '0 1.75rem',
      gap: 12,
      zIndex: 9,
    }}>
      {/* Breadcrumb */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: '#3A3A58', letterSpacing: '0.04em' }}>Rift</span>
        {pageName && (
          <>
            <span style={{ fontSize: 11, color: '#3A3A58' }}>›</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#E2E8F0' }}>{pageName}</span>
          </>
        )}
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 5, height: 5, borderRadius: '50%', background: '#22C55E',
            animation: 'pulse 2.5s ease-in-out infinite',
            boxShadow: '0 0 5px rgba(34,197,94,0.6)',
          }} />
          <span style={{ fontSize: 10.5, color: '#3A3A58', letterSpacing: '0.06em' }}>Sistema online</span>
        </div>

        <Link href="/dashboard" style={{ textDecoration: 'none' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '0.42rem 0.9rem',
            background: 'rgba(124,58,237,0.10)',
            border: '1px solid rgba(124,58,237,0.28)',
            borderRadius: 5,
            fontSize: 12, fontWeight: 600, color: '#A78BFA',
            cursor: 'pointer',
          }}>
            {PlusIco()}
            Novo Engagement
          </div>
        </Link>
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
        height: '100vh', background: '#080810', color: '#3A3A58', fontSize: 12,
        letterSpacing: '0.1em',
      }}>
        LOADING...
      </div>
    )
  }

  if (!user) return null

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#080810', overflow: 'hidden' }}>
      <Sidebar
        user={user}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        onLogout={() => { logout(); router.replace('/login') }}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar pageName={pageName} collapsed={collapsed} />
        <main style={{ flex: 1, overflow: 'auto', ...GRID_BG }}>
          {children}
        </main>
      </div>
    </div>
  )
}
