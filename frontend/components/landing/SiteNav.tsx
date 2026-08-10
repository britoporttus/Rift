'use client'
import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Route, Package, ShieldCheck, ArrowRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { MODULES } from './modules'
import { CONTACT_HREF } from './site'

/**
 * Navegação do site público.
 *
 * Comportamento portado da referência (menu suspenso com grade de itens, botão
 * sanduíche animado, header que ganha borda ao rolar) — mas escrito na
 * convenção do repo: sem shadcn, sem Radix, sem classes utilitárias. Trazer
 * `@radix-ui/react-navigation-menu` + `cva` + `cn` custaria cinco dependências
 * e um segundo sistema de estilo para um menu de dois níveis.
 *
 * Acessibilidade preservada do original: `aria-expanded` no gatilho,
 * `aria-controls` apontando para o painel, ESC fecha, clique fora fecha, e o
 * foco sai do painel ao fechar. O que a referência ganha do Radix e aqui é
 * feito à mão: navegação por seta dentro do painel (o painel é uma lista de
 * links, o Tab dá conta).
 */

type PanelItem = {
  title: string
  href: string
  icon: LucideIcon
  desc: string
  soon?: boolean
}

const PLATAFORMA: PanelItem[] = [
  { title: 'Como funciona', href: '/metodo', icon: Route,
    desc: 'As seis etapas, do escopo ao relatório' },
  { title: 'O que você recebe', href: '/entrega', icon: Package,
    desc: 'Achados com evidência, mapa e relatórios' },
  { title: 'Segurança e escopo', href: '/seguranca', icon: ShieldCheck,
    desc: 'Autorização, credenciais e papéis' },
]

const MENUS = [
  { id: 'modulos', label: 'Módulos', href: '/modulos' },
  { id: 'plataforma', label: 'Plataforma', href: '/metodo' },
] as const

export function SiteNav() {
  const [stuck, setStuck] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [mobile, setMobile] = useState(false)
  const path = usePathname()
  const navRef = useRef<HTMLElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const panelId = useId()

  useEffect(() => {
    const onScroll = () => setStuck(scrollY > 12)
    onScroll()
    addEventListener('scroll', onScroll, { passive: true })
    return () => removeEventListener('scroll', onScroll)
  }, [])

  // navegou: fecha tudo (senão o painel fica aberto por cima da página nova)
  useEffect(() => { setOpenMenu(null); setMobile(false) }, [path])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpenMenu(null); setMobile(false)
    }
    const onDown = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpenMenu(null)
    }
    addEventListener('keydown', onKey)
    addEventListener('mousedown', onDown)
    return () => { removeEventListener('keydown', onKey); removeEventListener('mousedown', onDown) }
  }, [])

  // trava a rolagem do fundo com o menu mobile aberto
  useEffect(() => {
    if (!mobile) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [mobile])

  /** atraso ao sair: dá tempo de o cursor atravessar o vão até o painel */
  const hoverIn = (id: string) => {
    clearTimeout(closeTimer.current)
    setOpenMenu(id)
  }
  const hoverOut = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpenMenu(null), 140)
  }

  const isOn = (href: string) => path === href || path.startsWith(href + '/')

  return (
    <>
    <header className="nav" data-stuck={stuck ? '1' : '0'} ref={navRef} onMouseLeave={hoverOut}>
      <div className="wrap nav-row">
        <Link className="mark" href="/">
          <span className="mark-g">R</span>
          <span className="mark-t">RIFT</span>
        </Link>

        <div className="nav-menus">
          {MENUS.map((m) => (
            <div
              key={m.id}
              className="nav-slot"
              onMouseEnter={() => hoverIn(m.id)}
              onFocus={() => hoverIn(m.id)}
            >
              <button
                className="nav-trg"
                aria-expanded={openMenu === m.id}
                aria-controls={`${panelId}-${m.id}`}
                data-on={isOn(m.href) ? '1' : '0'}
                onClick={() => setOpenMenu((v) => (v === m.id ? null : m.id))}
              >
                {m.label}
                <svg className="chev" width="10" height="10" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
          ))}
          <Link className="nav-lnk" href="/seguranca" data-on={isOn('/seguranca') ? '1' : '0'}>
            Segurança
          </Link>
        </div>

        <div className="nav-acts">
          <a className="btn hide-sm" href={CONTACT_HREF}>Agendar demo</a>
          <Link className="btn btn-p hide-xs" href="/login">Entrar</Link>
          <button
            className="burger"
            onClick={() => setMobile((v) => !v)}
            aria-expanded={mobile}
            aria-controls={`${panelId}-mobile`}
            aria-label={mobile ? 'Fechar menu' : 'Abrir menu'}
          >
            <BurgerIcon open={mobile} />
          </button>
        </div>
      </div>

      {/* ── painéis suspensos (desktop) ─────────────────────────────────── */}
      {MENUS.map((m) => (
        <div
          key={m.id}
          id={`${panelId}-${m.id}`}
          className="nav-panel"
          data-open={openMenu === m.id ? '1' : '0'}
          aria-hidden={openMenu !== m.id}
          onMouseEnter={() => hoverIn(m.id)}
        >
          <div className="wrap">
            <div className="panel-box">
              {m.id === 'modulos' ? (
                <>
                  <div className="panel-grid">
                    {MODULES.map((mod) => (
                      <PanelLink
                        key={mod.id}
                        title={mod.title}
                        href={`/modulos/${mod.id}`}
                        icon={mod.icon}
                        desc={mod.tagline}
                        soon={!mod.live}
                      />
                    ))}
                  </div>
                  <div className="panel-foot">
                    <span>Seis superfícies, um painel só.</span>
                    <Link href="/modulos">Ver todos os módulos <ArrowRight size={12} /></Link>
                  </div>
                </>
              ) : (
                <>
                  <div className="panel-grid two">
                    {PLATAFORMA.map((it) => <PanelLink key={it.href} {...it} />)}
                  </div>
                  <div className="panel-foot">
                    <span>Quer ver rodando num alvo seu?</span>
                    <a href={CONTACT_HREF}>Agendar demo <ArrowRight size={12} /></a>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ))}

    </header>

      {/* ── menu mobile ──────────────────────────────────────────────────
          FORA do <header> de propósito: a nav tem `backdrop-filter`, e isso
          cria bloco contentor para descendentes `position: fixed`. Dentro dela,
          o `inset:62px 0 0` deste painel era resolvido contra os 62px da barra
          — o menu nascia com 1px de altura e parecia não existir. */}
      {mobile && (
        <div className="mob" id={`${panelId}-mobile`}>
          <div className="mob-in">
            <div className="mob-t">Módulos</div>
            {MODULES.map((mod) => (
              <PanelLink key={mod.id} title={mod.title} href={`/modulos/${mod.id}`}
                icon={mod.icon} desc={mod.tagline} soon={!mod.live} />
            ))}
            <div className="mob-t">Plataforma</div>
            {PLATAFORMA.map((it) => <PanelLink key={it.href} {...it} />)}
            <div className="mob-acts">
              <a className="btn" href={CONTACT_HREF}>Agendar demo</a>
              <Link className="btn btn-p" href="/login">Entrar</Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function PanelLink({ title, href, icon: Icon, desc, soon }: PanelItem) {
  return (
    <Link className="panel-lnk" href={href}>
      <span className="panel-ico"><Icon size={18} /></span>
      <span className="panel-txt">
        <span className="panel-h">
          {title}
          {soon && <em className="panel-soon">em breve</em>}
        </span>
        <span className="panel-d">{desc}</span>
      </span>
    </Link>
  )
}

/**
 * Sanduíche → X num traço só. O caminho é desenhado inteiro e recortado por
 * `stroke-dasharray`: fechado mostra o pedaço central (dois traços), aberto
 * revela o arco completo e a rotação de -45° fecha o X. Portado da referência,
 * que fazia o mesmo com classes utilitárias.
 */
function BurgerIcon({ open }: { open: boolean }) {
  return (
    <svg className="burger-svg" data-open={open ? '1' : '0'} viewBox="0 0 32 32"
      fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path className="burger-a" d="M27 10 13 10C10.8 10 9 8.2 9 6 9 3.5 10.8 2 13 2 15.2 2 17 3.8 17 6L17 26C17 28.2 18.8 30 21 30 23.2 30 25 28.2 25 26 25 23.8 23.2 22 21 22L7 22" />
      <path d="M7 16 27 16" />
    </svg>
  )
}
