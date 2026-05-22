'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User } from '@/lib/api'

const C = {
  surface: 'rgba(3,3,10,0.99)',
  border: 'rgba(124,58,237,0.13)',
  purple: '#7C3AED',
  purpleL: '#A78BFA',
  text: '#E2E8F0',
  textSub: '#94A3B8',
  textMute: '#3A3A58',
  textDim: '#252545',
  green: '#22C55E',
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
}

const NAV_ALL = [
  { href: '/dashboard',   icon: 'grid',     label: 'Dashboard',  adminOnly: false },
  { href: '/findings',    icon: 'alert',    label: 'Findings',   adminOnly: false },
  { href: '/reports',     icon: 'file',     label: 'Relatórios', adminOnly: false },
  { href: '/admin/users', icon: 'users',    label: 'Usuários',   adminOnly: true  },
  { href: '/admin',       icon: 'settings', label: 'Admin',      adminOnly: true  },
]

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function Sidebar({ user, onLogout }: { user: User; onLogout: () => void }) {
  const path = usePathname()
  const NAV = NAV_ALL.filter((n) => !n.adminOnly || user.role === 'admin')

  return (
    <aside style={{
      width: 228, flexShrink: 0, display: 'flex', flexDirection: 'column',
      background: C.surface, borderRight: `1px solid ${C.border}`,
      minHeight: '100vh', zIndex: 10,
    }}>
      {/* top accent line */}
      <div style={{
        height: 2, flexShrink: 0,
        background: 'linear-gradient(to right, transparent 5%, rgba(124,58,237,0.55) 50%, transparent 95%)',
      }} />

      {/* logo */}
      <div style={{ padding: '1.25rem 1.2rem 1rem', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {Ico.crosshair(20)}
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.purpleL, letterSpacing: '0.14em', lineHeight: 1 }}>RIFT</div>
            <div style={{ fontSize: 7.5, color: C.textDim, letterSpacing: '0.22em', marginTop: 3 }}>AI PENTEST PLATFORM</div>
          </div>
        </div>
      </div>

      {/* divider */}
      <div style={{ height: 1, background: 'rgba(10,10,24,0.95)', margin: '0 0.8rem', flexShrink: 0 }} />

      {/* nav */}
      <nav style={{ flex: 1, padding: '0.65rem 0.55rem', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' }}>
        {NAV.map(({ href, icon, label }) => {
          const active = path === href || (href !== '/dashboard' && path.startsWith(href))
          return (
            <Link key={href} href={href} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '0.48rem 0.8rem', borderRadius: 3, cursor: 'pointer',
                borderLeft: active ? `2px solid ${C.purple}` : '2px solid transparent',
                background: active ? 'rgba(124,58,237,0.11)' : 'transparent',
                color: active ? C.purpleL : C.textMute,
                fontSize: 12.5, fontWeight: active ? 500 : 400,
                letterSpacing: '0.01em', transition: 'all 0.12s',
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
              >
                <span style={{ color: active ? C.purple : '#2A2A48', transition: 'color 0.12s' }}>
                  {Ico[icon as keyof typeof Ico](14)}
                </span>
                {label}
              </div>
            </Link>
          )
        })}
      </nav>

      {/* system status */}
      <div style={{ padding: '0.5rem 1.1rem 0.6rem', display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.green, animation: 'pulse 2.5s ease-in-out infinite' }} />
        <span style={{ fontSize: 8, color: '#252540', letterSpacing: '0.14em' }}>SISTEMA ONLINE</span>
      </div>

      {/* divider */}
      <div style={{ height: 1, background: 'rgba(10,10,24,0.95)', flexShrink: 0 }} />

      {/* user */}
      <div style={{ padding: '0.8rem 1rem', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(124,58,237,0.18)', border: '1px solid rgba(124,58,237,0.32)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9.5, fontWeight: 700, color: C.purpleL, letterSpacing: '0.04em',
        }}>
          {initials(user.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user.name}
          </div>
          <div style={{ fontSize: 8.5, color: C.textMute, letterSpacing: '0.05em', marginTop: 1 }}>{`// ${user.role}`}</div>
        </div>
        <button
          onClick={onLogout}
          title="Sair"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 3, color: '#2A2A48', transition: 'color 0.12s' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = C.textSub)}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#2A2A48')}
        >
          {Ico.logout(13)}
        </button>
      </div>
    </aside>
  )
}
