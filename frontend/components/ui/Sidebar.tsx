'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User } from '@/lib/api'
import { SI } from '@/components/ui/SI'
import { isActive } from '@/lib/nav'
import { can } from '@/lib/viewer'

const C = {
  bg: 'var(--bg)',
  surface: 'var(--panel)',
  panel: 'var(--panel)',
  border: 'var(--border)',
  borderMid: 'var(--border-mid)',
  purple: 'var(--purple)',
  purpleD: 'var(--purple-dark)',
  purpleL: 'var(--purple-light)',
  purpleDim: 'var(--purple-dim)',
  purpleGlowStrong: 'var(--purple-glow-strong)',
  text: 'var(--text)',
  textSub: 'var(--muted)',
  textMute: 'var(--text-mute)',
  green: 'var(--low)',
  red: 'var(--critical)',
}

const Ico = {
  crosshair: (s?: number, c?: string) => <SI s={s || 20} c={c || C.purple}><circle cx="12" cy="12" r="10" /><line x1="22" y1="12" x2="18" y2="12" /><line x1="6" y1="12" x2="2" y2="12" /><line x1="12" y1="6" x2="12" y2="2" /><line x1="12" y1="22" x2="12" y2="18" /></SI>,
  grid:      (s?: number, c?: string) => <SI s={s || 14} c={c}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></SI>,
  globe:     (s?: number, c?: string) => <SI s={s || 14} c={c}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></SI>,
  database:  (s?: number, c?: string) => <SI s={s || 14} c={c}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5" /><path d="M3 12a9 3 0 0 0 18 0" /></SI>,
  network:   (s?: number, c?: string) => <SI s={s || 14} c={c}><rect x="9" y="2" width="6" height="6" rx="1" /><rect x="2" y="16" width="6" height="6" rx="1" /><rect x="16" y="16" width="6" height="6" rx="1" /><path d="M12 8v4" /><path d="M12 12H5v4" /><path d="M12 12h7v4" /></SI>,
  share2:    (s?: number, c?: string) => <SI s={s || 14} c={c}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></SI>,
  alert:     (s?: number, c?: string) => <SI s={s || 14} c={c}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></SI>,
  file:      (s?: number, c?: string) => <SI s={s || 14} c={c}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></SI>,
  users:     (s?: number, c?: string) => <SI s={s || 14} c={c}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></SI>,
  settings:  (s?: number, c?: string) => <SI s={s || 14} c={c}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></SI>,
  logout:    (s?: number, c?: string) => <SI s={s || 13} c={c}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></SI>,
  chevLeft:  (s?: number, c?: string) => <SI s={s || 14} c={c || C.textMute} sw={2}><polyline points="15 18 9 12 15 6" /></SI>,
  chevRight: (s?: number, c?: string) => <SI s={s || 14} c={c || C.textMute} sw={2}><polyline points="9 18 15 12 9 6" /></SI>,
  plus:      (s?: number, c?: string) => <SI s={s || 14} c={c} sw={2.5}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></SI>,
  cloud:     (s?: number, c?: string) => <SI s={s || 14} c={c}><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" /></SI>,
  directory: (s?: number, c?: string) => <SI s={s || 14} c={c}><path d="M12 2l9 4.5v11L12 22l-9-4.5v-11L12 2z" /><circle cx="12" cy="10" r="2.4" /><path d="M8.5 16a3.5 3.5 0 017 0" /></SI>,
  sap:       (s?: number, c?: string) => <SI s={s || 14} c={c}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 15V9l3 6 3-6v6M17 9v6" /></SI>,
}

// Navegação por AMBIENTE TESTADO (Fase 1 do roadmap de legibilidade, 2026-08-10).
// A divisão antiga (Superfície / Resultados / Sistema) descrevia o PROCESSO
// interno do Rift; ninguém abre o menu pensando "vou na superfície". O eixo certo
// é o que o cliente contratou: o alvo. "Domínios" deixou de ser item — virou a
// lista de entrada de "Web / API" (a rota segue /dominios). "Mapa" saiu de alvo:
// é uma LENTE sobre tudo, então foi para Resultado. Cloud/AD/SAP entram como
// `soon` — o menu vira o roadmap visível, e isso vende. "Novo Pentest" segue
// como ação primária no topo (não é um alvo, é uma ação sobre um alvo).
type NavItem = { href: string; icon: keyof typeof Ico; label: string; adminOnly?: boolean; soon?: boolean }
type NavGroup = { title: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Alvos',
    items: [
      { href: '/dominios',     icon: 'globe',     label: 'Web / API' },
      { href: '/rede-interna', icon: 'network',   label: 'Rede Interna' },
      { href: '/cloud',        icon: 'cloud',     label: 'Cloud', soon: true },
      { href: '/ad',           icon: 'directory', label: 'Active Directory', soon: true },
      { href: '/sap',          icon: 'sap',       label: 'SAP', soon: true },
    ],
  },
  {
    title: 'Resultado',
    items: [
      { href: '/findings', icon: 'alert',  label: 'Achados' },
      { href: '/reports',  icon: 'file',   label: 'Relatórios' },
      { href: '/mapa',     icon: 'share2', label: 'Mapa' },
    ],
  },
  {
    title: 'Conta',
    items: [
      { href: '/admin/users', icon: 'users',    label: 'Usuários',       adminOnly: true },
      { href: '/admin',       icon: 'settings', label: 'Configurações',  adminOnly: true },
    ],
  },
]

// `isActive` mora em lib/nav.js (testado em test/nav.test.js) — o `startsWith`
// cru que existia aqui acendia DOIS itens em `/admin/users`, porque
// "/admin/users".startsWith("/admin") é verdadeiro.

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
  const groups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((n) => !n.adminOnly || user.role === 'admin') }))
    .filter((g) => g.items.length > 0)
  const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href))
  const novoActive = path.startsWith('/novo-pentest')
  // Frente 0: disparar pentest é ação da operação. O cliente acompanha o
  // resultado do trabalho contratado — não opera a ferramenta.
  const showNovoPentest = can(user.role, 'viewAgentInternals')

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
          background: `linear-gradient(140deg, ${C.purple}, ${C.purpleD})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, boxShadow: `0 0 14px ${C.purpleGlowStrong}`,
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

      {/* Ação primária — sempre acessível, de qualquer tela (só operação) */}
      {showNovoPentest && <div style={{ padding: collapsed ? '0.6rem 0.5rem 0.2rem' : '0.75rem 0.6rem 0.3rem', flexShrink: 0 }}>
        <Link href="/novo-pentest" title={collapsed ? 'Novo Pentest' : undefined} style={{ textDecoration: 'none' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: collapsed ? 0 : 8, padding: collapsed ? '0.5rem 0' : '0.55rem 0.75rem',
            borderRadius: 8,
            background: novoActive ? C.purpleD : C.purple,
            color: 'white', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            boxShadow: `0 0 16px ${C.purpleGlowStrong}`, transition: 'filter 0.12s',
          }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
          >
            {Ico.plus(14, 'white')}
            {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>Novo Pentest</span>}
          </div>
        </Link>
      </div>}

      {/* Nav */}
      <nav style={{
        flex: 1, overflowY: 'auto',
        padding: collapsed ? '0.4rem 0' : '0.4rem 0.5rem',
        display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        {groups.map((group, gi) => (
          <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: gi === 0 ? 0 : 14 }}>
            {collapsed
              ? gi > 0 && <div style={{ height: 1, background: C.border, margin: '4px 0.6rem 6px' }} />
              : (
                <div style={{
                  fontSize: 8.5, fontWeight: 700, color: C.textMute, letterSpacing: '0.16em',
                  textTransform: 'uppercase', padding: '0 0.875rem', marginBottom: 4, whiteSpace: 'nowrap',
                }}>
                  {group.title}
                </div>
              )}
            {group.items.map(({ href, icon, label, soon }) => {
              const active = isActive(path, href, allHrefs)
              // Item "em breve": não navega (a rota não existe — link seria quebrado).
              // Fica visível e esmaecido para comunicar o roadmap do produto.
              if (soon) {
                return (
                  <div key={href} aria-disabled="true" title={collapsed ? `${label} — em breve` : undefined}
                    style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      gap: collapsed ? 0 : 10,
                      padding: collapsed ? '0.5rem 0' : '0.5rem 0.875rem',
                      borderRadius: collapsed ? 0 : 5, borderLeft: collapsed ? 'none' : '2px solid transparent',
                      color: C.textMute, fontSize: 12.5, opacity: 0.5, cursor: 'default',
                    }}>
                    <span style={{ color: C.textMute, flexShrink: 0 }}>{Ico[icon](14)}</span>
                    {!collapsed && (
                      <>
                        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>{label}</span>
                        <span style={{
                          fontSize: 7.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                          color: C.textMute, border: `1px solid ${C.border}`, borderRadius: 4, padding: '1px 4px', whiteSpace: 'nowrap',
                        }}>em breve</span>
                      </>
                    )}
                  </div>
                )
              }
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
                  </div>
                </Link>
              )
            })}
          </div>
        ))}
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
