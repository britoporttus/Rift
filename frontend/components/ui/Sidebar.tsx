'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User } from '@/lib/api'

const C = {
  bg: '#080810',
  surface: '#050510',
  panel: '#050510',
  border: 'rgba(124,58,237,0.13)',
  borderMid: 'rgba(124,58,237,0.28)',
  purple: '#7C3AED',
  purpleL: '#A78BFA',
  purpleDim: 'rgba(124,58,237,0.10)',
  text: '#E2E8F0',
  textSub: '#94A3B8',
  textMute: '#3A3A58',
  green: '#22C55E',
  red: '#EF4444',
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

const Ico = {
  crosshair: (s?: number, c?: string) => <SI s={s || 20} c={c || C.purple}><circle cx="12" cy="12" r="10" /><line x1="22" y1="12" x2="18" y2="12" /><line x1="6" y1="12" x2="2" y2="12" /><line x1="12" y1="6" x2="12" y2="2" /><line x1="12" y1="22" x2="12" y2="18" /></SI>,
  grid:      (s?: number, c?: string) => <SI s={s || 14} c={c}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></SI>,
  alert:     (s?: number, c?: string) => <SI s={s || 14} c={c}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></SI>,
  file:      (s?: number, c?: string) => <SI s={s || 14} c={c}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></SI>,
  users:     (s?: number, c?: string) => <SI s={s || 14} c={c}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></SI>,
  settings:  (s?: number, c?: string) => <SI s={s || 14} c={c}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></SI>,
  logout:    (s?: number, c?: string) => <SI s={s || 13} c={c}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></SI>,
  chevLeft:  (s?: number, c?: string) => <SI s={s || 14} c={c || C.textMute} sw={2}><polyline points="15 18 9 12 15 6" /></SI>,
  chevRight: (s?: number, c?: string) => <SI s={s || 14} c={c || C.textMute} sw={2}><polyline points="9 18 15 12 9 6" /></SI>,
}

const NAV_ALL = [
  { href: '/dashboard',   icon: 'grid'     as const, label: 'Dashboard',  adminOnly: false },
  { href: '/findings',    icon: 'alert'    as const, label: 'Findings',   adminOnly: false },
  { href: '/reports',     icon: 'file'     as const, label: 'Relatórios', adminOnly: false },
  { href: '/admin/users', icon: 'users'    as const, label: 'Usuários',   adminOnly: true  },
  { href: '/admin',       icon: 'settings' as const, label: 'Admin',      adminOnly: true  },
]

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

interface SidebarProps {
  user: User
  collapsed: boolean
  onToggle: () => void
  onLogout: () => void
}

export function Sidebar({ user, collapsed, onToggle, onLogout }: SidebarProps) {
  const path = usePathname()
  const NAV = NAV_ALL.filter((n) => !n.adminOnly || user.role === 'admin')

  return (
    <aside style={{
      width: collapsed ? 56 : 224,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      background: C.surface,
      borderRight: `1px solid ${C.border}`,
      transition: 'width 0.22s ease',
      overflow: 'hidden',
      zIndex: 10,
      minHeight: '100vh',
    }}>
      {/* Logo area */}
      <div style={{
        height: 52, flexShrink: 0,
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        padding: collapsed ? '0' : '0 1rem',
        borderBottom: `1px solid ${C.border}`,
        gap: 10,
      }}>
        {/* Crosshair icon box */}
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: C.purple,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {Ico.crosshair(16, 'white')}
        </div>
        {!collapsed && (
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: C.purpleL, letterSpacing: '0.1em', lineHeight: 1, whiteSpace: 'nowrap' }}>RIFT</div>
            <div style={{ fontSize: 8, color: C.textMute, letterSpacing: '0.2em', marginTop: 2, whiteSpace: 'nowrap' }}>AI PENTEST</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{
        flex: 1, overflowY: 'auto',
        padding: collapsed ? '0.6rem 0' : '0.6rem 0.5rem',
        display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        {NAV.map(({ href, icon, label }) => {
          const active = path === href || (href !== '/dashboard' && path.startsWith(href))
          return (
            <Link key={href} href={href} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: collapsed ? 0 : 10,
                padding: collapsed ? '0.5rem 0' : '0.5rem 0.875rem',
                borderRadius: collapsed ? 0 : 5,
                borderLeft: collapsed ? 'none' : `2px solid ${active ? C.purple : 'transparent'}`,
                background: active ? C.purpleDim : 'transparent',
                color: active ? C.purpleL : C.textMute,
                fontSize: 12.5, fontWeight: active ? 500 : 400,
                cursor: 'pointer',
                transition: 'all 0.12s',
                position: 'relative',
              }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = 'rgba(124,58,237,0.05)'
                    e.currentTarget.style.color = C.textSub
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = C.textMute
                  }
                }}
                title={collapsed ? label : undefined}
              >
                <span style={{ color: active ? C.purple : C.textMute, transition: 'color 0.12s', flexShrink: 0 }}>
                  {Ico[icon](14)}
                </span>
                {!collapsed && (
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>{label}</span>
                )}
                {/* Findings badge — only when expanded and on findings nav */}
                {!collapsed && icon === 'alert' && (
                  <span style={{
                    background: C.red,
                    color: 'white',
                    fontSize: 8, fontWeight: 700,
                    borderRadius: 99,
                    padding: '1px 5px',
                    lineHeight: 1.4,
                  }}>
                    {/* badge count managed elsewhere */}
                  </span>
                )}
              </div>
            </Link>
          )
        })}
      </nav>

      {/* Toggle button */}
      <div style={{
        height: 34, flexShrink: 0,
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-end',
        paddingRight: collapsed ? 0 : '1rem',
        borderTop: `1px solid ${C.border}`,
        cursor: 'pointer',
      }} onClick={onToggle}>
        <button style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: C.textMute, display: 'flex', alignItems: 'center', padding: 4, borderRadius: 3,
          transition: 'color 0.12s',
        }}
          onMouseEnter={(e) => (e.currentTarget.style.color = C.textSub)}
          onMouseLeave={(e) => (e.currentTarget.style.color = C.textMute)}
          title={collapsed ? 'Expandir' : 'Colapsar'}
        >
          {collapsed ? Ico.chevRight(14) : Ico.chevLeft(14)}
        </button>
      </div>

      {/* User section */}
      <div style={{
        padding: collapsed ? '0.65rem 0' : '0.65rem 0.75rem',
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : 8,
        borderTop: `1px solid ${C.border}`,
        flexShrink: 0,
        position: 'relative',
      }}>
        {/* Avatar */}
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: C.purpleDim, border: `1px solid ${C.borderMid}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9.5, fontWeight: 700, color: C.purpleL, letterSpacing: '0.04em',
        }}>
          {initials(user.name)}
        </div>

        {!collapsed && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.name}
              </div>
              <div style={{ fontSize: 9.5, color: C.textMute, letterSpacing: '0.04em', marginTop: 1 }}>
                {`// ${user.role}`}
              </div>
            </div>
            <button
              onClick={onLogout}
              title="Sair"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 4, borderRadius: 3, color: C.textMute,
                display: 'flex', alignItems: 'center',
                transition: 'color 0.12s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = C.textSub)}
              onMouseLeave={(e) => (e.currentTarget.style.color = C.textMute)}
            >
              {Ico.logout(13)}
            </button>
          </>
        )}
      </div>
    </aside>
  )
}
