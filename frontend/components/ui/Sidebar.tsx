'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Bug, FileText, Settings, LogOut, Crosshair, Users } from 'lucide-react'
import { User } from '@/lib/api'

const NAV_ALL = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', adminOnly: false },
  { href: '/findings', icon: Bug, label: 'Findings', adminOnly: false },
  { href: '/reports', icon: FileText, label: 'Relatórios', adminOnly: false },
  { href: '/admin/users', icon: Users, label: 'Usuários', adminOnly: true },
  { href: '/admin', icon: Settings, label: 'Admin', adminOnly: true },
]

export function Sidebar({ user, onLogout }: { user: User; onLogout: () => void }) {
  const path = usePathname()
  const NAV = NAV_ALL.filter(n => !n.adminOnly || user.role === 'admin')

  return (
    <aside style={{
      width: 220, minHeight: '100vh', background: 'var(--surface)',
      borderRight: '1px solid var(--border)', display: 'flex',
      flexDirection: 'column', padding: '1.5rem 0', flexShrink: 0,
    }}>
      <div style={{ padding: '0 1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Crosshair size={20} color="var(--purple)" />
          <span style={{ color: 'var(--purple-light)', fontWeight: 700, fontSize: 18 }}>Rift</span>
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>AI Pentest Platform</div>
      </div>

      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '0 0.75rem' }}>
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = path === href || (href !== '/dashboard' && path.startsWith(href))
          return (
            <Link key={href} href={href} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '0.6rem 0.75rem', borderRadius: 6,
              color: active ? 'var(--purple-light)' : 'var(--muted)',
              background: active ? 'var(--purple-glow)' : 'transparent',
              fontWeight: active ? 600 : 400, fontSize: 14,
              transition: 'all 0.15s', textDecoration: 'none',
            }}>
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>

      <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
        <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>{user.name}</div>
        <div style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 8 }}>{user.role}</div>
        <button onClick={onLogout} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          color: 'var(--muted)', fontSize: 12,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        }}>
          <LogOut size={13} />
          Sair
        </button>
      </div>
    </aside>
  )
}
