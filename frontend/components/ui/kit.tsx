'use client'
/**
 * Kit de UI compartilhado do Rift.
 *
 * Motivação (ciclo de coesão 2026-08-01): cada tela redefinia o seu próprio
 * `Card`, `Chip`, `Badge`, `Kpi`, `SectionTitle` e `inputStyle` inline — o
 * mesmo elemento tinha raio 8 numa tela e 12 na outra, padding 0.9rem aqui e
 * 1.4rem ali. O resultado é um app que parece seis produtos diferentes.
 * Estes primitivos são a fonte única; telas novas devem consumir daqui em vez
 * de recriar.
 *
 * Convenção do repo: estilo inline (`style={{}}`) + variáveis CSS de
 * `globals.css`. Não introduzir CSS modules nem classes utilitárias aqui.
 */
import { useState, useId } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { EASE, useCountUp, useMounted, usePrefersReducedMotion } from '@/lib/motion'

// ── Escala de design ─────────────────────────────────────────────────────────
// Um único lugar define raio/espaçamento. Mudar aqui muda o app inteiro.
export const R = { card: 12, row: 8, pill: 99, ctl: 7 } as const
export const SP = { pageX: '1.75rem', pageY: '1.5rem', card: '1.1rem 1.3rem', gap: 14 } as const
export const PAGE_MAX = 1240

/** Mistura uma cor de token com transparência sem quebrar `var(--…)`.
 *  (o bug clássico do repo era `${cor}22`, que não funciona com var()) */
export function tint(color: string, pct: number) {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`
}

// ── Movimento ────────────────────────────────────────────────────────────────

/**
 * Entrada suave (fade + subida) ao montar. `delay` escalona uma sequência —
 * dê índices crescentes a irmãos para revelar em cascata. Respeita
 * `prefers-reduced-motion` (aparece sem animar) e não quebra SSR.
 */
export function Reveal({ children, delay = 0, y = 12, style }: {
  children: React.ReactNode; delay?: number; y?: number; style?: React.CSSProperties
}) {
  const mounted = useMounted()
  const reduced = usePrefersReducedMotion()
  const shown = mounted || reduced
  return (
    <div style={{
      opacity: shown ? 1 : 0,
      transform: shown ? 'none' : `translateY(${y}px)`,
      transition: reduced ? 'none' : `opacity .5s ${EASE} ${delay}ms, transform .5s ${EASE} ${delay}ms`,
      ...style,
    }}>
      {children}
    </div>
  )
}

// ── Container de página ──────────────────────────────────────────────────────

export function Page({ children, max = PAGE_MAX, gap = 18 }: {
  children: React.ReactNode; max?: number; gap?: number
}) {
  return (
    <div style={{
      padding: `${SP.pageY} ${SP.pageX} 3rem`, display: 'flex', flexDirection: 'column',
      gap, maxWidth: max, margin: '0 auto', width: '100%', animation: 'fadeIn .18s ease',
    }}>
      {children}
    </div>
  )
}

/** Cabeçalho de página: título grande, subtítulo curto, ações à direita.
 *  `eyebrow` é o link de volta (contexto de onde se veio). */
export function PageHeader({ icon, title, subtitle, actions, eyebrow }: {
  icon?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  eyebrow?: { href: string; label: string }
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {eyebrow && (
        <Link href={eyebrow.href} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
          color: 'var(--text-mute)', fontSize: 12, textDecoration: 'none',
        }}>
          <ChevronRight size={13} style={{ transform: 'rotate(180deg)' }} /> {eyebrow.label}
        </Link>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{
            fontSize: 21, fontWeight: 700, color: 'var(--text)', margin: 0,
            letterSpacing: '-0.015em', display: 'flex', alignItems: 'center', gap: 10,
          }}>
            {icon}{title}
          </h1>
          {subtitle && (
            <div style={{ fontSize: 13, color: 'var(--muted)', margin: '5px 0 0', maxWidth: 720, lineHeight: 1.5 }}>
              {subtitle}
            </div>
          )}
        </div>
        {actions && <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>{actions}</div>}
      </div>
    </div>
  )
}

// ── Superfícies ──────────────────────────────────────────────────────────────

export function Card({ children, pad = SP.card, accent, hover = false, style }: {
  children: React.ReactNode
  pad?: string
  /** faixa colorida de 3px na esquerda (severidade/estado) */
  accent?: string
  hover?: boolean
  style?: React.CSSProperties
}) {
  const [h, setH] = useState(false)
  return (
    <div
      onMouseEnter={hover ? () => setH(true) : undefined}
      onMouseLeave={hover ? () => setH(false) : undefined}
      style={{
        background: 'var(--surface)',
        border: `1px solid ${h ? 'var(--border-mid)' : 'var(--border)'}`,
        borderLeft: accent ? `3px solid ${accent}` : undefined,
        borderRadius: R.card, padding: pad, position: 'relative',
        transition: 'border-color .13s, box-shadow .13s, transform .13s',
        boxShadow: h ? '0 6px 24px rgba(124,58,237,0.13)' : 'none',
        transform: h ? 'translateY(-1px)' : 'none',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** Título de seção — caixa alta, discreto. Não compete com o `PageHeader`. */
export function SectionTitle({ children, icon, color = 'var(--muted)', right }: {
  children: React.ReactNode; icon?: React.ReactNode; color?: string; right?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 20 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color, textTransform: 'uppercase',
        letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {icon}{children}
      </div>
      {right}
    </div>
  )
}

/**
 * Seção colapsável — a peça central do "menos poluição".
 * Detalhe fica atrás de um clique; o resumo (`meta`) fica sempre visível para
 * que colapsado ainda informe. `defaultOpen=false` é o padrão de propósito:
 * a tela abre com a leitura de alto nível, não com tudo expandido.
 */
export function Collapsible({ title, icon, meta, children, defaultOpen = false, color = 'var(--muted)', count }: {
  title: React.ReactNode
  icon?: React.ReactNode
  /** resumo curto mostrado à direita mesmo quando fechado */
  meta?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  color?: string
  count?: number
}) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: R.card, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '0.85rem 1.3rem', background: 'transparent', border: 'none',
          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <span style={{ color: 'var(--text-mute)', display: 'flex', flexShrink: 0 }}>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600, color, textTransform: 'uppercase',
          letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {icon}{title}
          {count != null && (
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-mute)', fontWeight: 500 }}>({count})</span>
          )}
        </span>
        <span style={{ flex: 1 }} />
        {meta && <span style={{ fontSize: 11.5, color: 'var(--text-mute)', flexShrink: 0 }}>{meta}</span>}
      </button>
      {open && (
        <div id={panelId} style={{ padding: '0 1.3rem 1.2rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── Indicadores ──────────────────────────────────────────────────────────────

/** KPI de destaque. `href` transforma o card em porta de entrada navegável —
 *  um número que não leva a lugar nenhum é decoração, não informação. */
export function Kpi({ label, value, color = 'var(--purple-light)', icon, hint, href, countUp = false }: {
  label: string
  value: React.ReactNode
  color?: string
  icon?: React.ReactNode
  hint?: string
  href?: string
  /** anima a contagem de 0 até o valor (só quando `value` é número) */
  countUp?: boolean
}) {
  const isNum = typeof value === 'number'
  const animated = useCountUp(isNum ? (value as number) : 0, { enabled: countUp && isNum })
  const display = countUp && isNum ? animated.toLocaleString('pt-BR') : value
  const body = (
    <Card hover={!!href} pad="0.95rem 1.15rem" style={{ overflow: 'hidden', height: '100%' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: color }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {icon && (
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', color,
            background: tint(color, 14), border: `1px solid ${tint(color, 35)}`,
          }}>{icon}</div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: 'var(--mono)', lineHeight: 1 }}>{display}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontWeight: 600 }}>{label}</div>
          {hint && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{hint}</div>}
        </div>
      </div>
    </Card>
  )
  return href ? <Link href={href} style={{ textDecoration: 'none' }}>{body}</Link> : body
}

export function KpiRow({ children, min = 190 }: { children: React.ReactNode; min?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: SP.gap }}>
      {children}
    </div>
  )
}

/** Número + rótulo, sem moldura. Para linhas de estatística dentro de um Card. */
export function Stat({ label, value, color = 'var(--text)' }: {
  label: string; value: React.ReactNode; color?: string
}) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: 'var(--mono)', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 9.5, color: 'var(--text-mute)', marginTop: 4, letterSpacing: '0.08em' }}>
        {label.toUpperCase()}
      </div>
    </div>
  )
}

export function StatRow({ children, gap = 26 }: { children: React.ReactNode; gap?: number }) {
  return <div style={{ display: 'flex', gap, flexWrap: 'wrap' }}>{children}</div>
}

// ── Etiquetas ────────────────────────────────────────────────────────────────

/** Pílula colorida — estado, severidade, categoria. */
export function Badge({ children, color = 'var(--purple-light)', icon, title }: {
  children: React.ReactNode; color?: string; icon?: React.ReactNode; title?: string
}) {
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 700,
      borderRadius: R.pill, padding: '2px 8px', letterSpacing: '0.03em', whiteSpace: 'nowrap',
      background: tint(color, 12), border: `1px solid ${tint(color, 30)}`, color,
    }}>
      {icon}{children}
    </span>
  )
}

/** Chip neutro e monoespaçado — dado técnico (IP, tech, porta). */
export function Chip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span title={title} style={{
      fontSize: 9.5, fontFamily: 'var(--mono)', background: 'var(--bg)',
      border: '1px solid var(--border)', color: 'var(--muted)',
      borderRadius: R.pill, padding: '2px 7px', whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

// ── Ações ────────────────────────────────────────────────────────────────────

type BtnVariant = 'primary' | 'ghost' | 'subtle'

export function btnStyle(variant: BtnVariant = 'ghost', color = 'var(--purple-light)'): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 0.95rem',
    borderRadius: R.ctl, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit', textDecoration: 'none', whiteSpace: 'nowrap',
    transition: 'opacity .12s, border-color .12s',
  }
  if (variant === 'primary') {
    return { ...base, background: 'var(--purple)', border: 'none', color: 'white', boxShadow: '0 0 18px var(--purple-glow-strong)' }
  }
  if (variant === 'subtle') {
    return { ...base, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)' }
  }
  return { ...base, background: tint(color, 12), border: `1px solid ${tint(color, 35)}`, color }
}

export function Btn({ children, variant = 'ghost', color, href, onClick, disabled, title, type = 'button' }: {
  children: React.ReactNode
  variant?: BtnVariant
  color?: string
  href?: string
  onClick?: () => void
  disabled?: boolean
  title?: string
  type?: 'button' | 'submit'
}) {
  const s = { ...btnStyle(variant, color), opacity: disabled ? 0.55 : 1, cursor: disabled ? 'default' : 'pointer' }
  if (href && !disabled) return <Link href={href} title={title} style={s}>{children}</Link>
  return <button type={type} onClick={onClick} disabled={disabled} title={title} style={s}>{children}</button>
}

// ── Vazio / carregando ───────────────────────────────────────────────────────

export function EmptyState({ icon, title, hint, action }: {
  icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode
}) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px dashed var(--border-mid)', borderRadius: R.card,
      padding: '2.75rem 1.5rem', textAlign: 'center', color: 'var(--muted)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    }}>
      {icon && <div style={{ color: 'var(--text-dim)', display: 'flex' }}>{icon}</div>}
      <div style={{ fontSize: 14, color: 'var(--muted)' }}>{title}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--text-mute)', maxWidth: 420, lineHeight: 1.5 }}>{hint}</div>}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  )
}

export function Skeleton({ h = 120, count = 3, min = 300 }: { h?: number; count?: number; min?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: SP.gap }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{
          height: h, background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: R.card, animation: 'pulse 1.4s ease-in-out infinite',
        }} />
      ))}
    </div>
  )
}

// ── Formulário ───────────────────────────────────────────────────────────────

export const inputStyle: React.CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--border-mid)', borderRadius: R.ctl,
  color: 'var(--text)', fontSize: 12.5, padding: '7px 10px', fontFamily: 'inherit', outline: 'none',
}
