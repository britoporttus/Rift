'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { DepthSwitcher } from '@/components/ui/DepthSwitcher'
import { Sidebar } from '@/components/ui/Sidebar'
import { crumbsFor } from '@/lib/nav'
import { MotionProvider } from '@/components/ui/motion'

const GRID_BG = {
  backgroundImage: 'linear-gradient(rgba(124,58,237,0.024) 1px,transparent 1px),linear-gradient(90deg,rgba(124,58,237,0.024) 1px,transparent 1px)',
  backgroundSize: '40px 40px',
}

// Rótulo por prefixo de rota. O `novo` de cada módulo tem nome próprio para o
// breadcrumb não ficar "Domínios › novo".
const PAGE_NAMES: Record<string, string> = {
  '/dominios': 'Web / API',   // menu por ambiente (Fase 1): o inventário de domínios é o alvo Web/API
  '/novo-pentest': 'Novo Pentest',
  '/novo-pentest/web': 'Web / API',
  '/harness': 'Teste de conexão',
  '/rede-interna': 'Rede Interna',
  '/rede-interna/novo': 'Configurar',
  '/painel': 'Painel de correções',
  '/correcoes': 'Quadro de correções',
  '/executivo': 'Panorama executivo',
  '/engagement': 'Pentests',
  '/engagement/novo': 'Novo escopo',
  '/vazamentos': 'Vazamentos',
  '/mapa': 'Mapa de Superfície',
  '/findings': 'Achados',
  '/reports': 'Relatórios',
  '/admin/users': 'Usuários',
  '/admin': 'Configurações',
}

// `crumbsFor` mora em lib/nav.js (testado em test/nav.test.js). Antes era
// `PAGE_NAMES[path]` com match EXATO — então toda rota de detalhe
// (`/dominios/abc`, `/engagement/xyz`) caía no fallback vazio e o breadcrumb
// sumia justamente nas telas mais profundas, que são as que mais precisam de
// um caminho de volta.

function TopBar({ crumbs }: { crumbs: Array<{ href: string; label: string }> }) {
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
      {/* Breadcrumb navegável */}
      <nav aria-label="Trilha" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <Link href="/dominios" style={{ fontSize: 11, color: 'var(--text-mute)', letterSpacing: '0.04em', textDecoration: 'none' }}>
          Rift
        </Link>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <span key={c.href} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>›</span>
              {last ? (
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>{c.label}</span>
              ) : (
                <Link href={c.href} style={{ fontSize: 12.5, color: 'var(--muted)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  {c.label}
                </Link>
              )}
            </span>
          )
        })}
      </nav>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <DepthSwitcher />
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

  const crumbs = crumbsFor(path, PAGE_NAMES)

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
    <MotionProvider>
      <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
        <Sidebar
          user={user}
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          onLogout={() => { logout(); router.replace('/login') }}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <TopBar crumbs={crumbs} />
          <main style={{ flex: 1, overflow: 'auto', ...GRID_BG }}>
            {children}
          </main>
        </div>
      </div>
    </MotionProvider>
  )
}
