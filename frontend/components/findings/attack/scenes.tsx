'use client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'
import { MotionPathPlugin } from 'gsap/MotionPathPlugin'

gsap.registerPlugin(useGSAP, DrawSVGPlugin, MotionPathPlugin)

/**
 * As 5 cenas de "Anatomia do ataque".
 *
 * Cada cena monta uma timeline GSAP **pausada** e o player a arrasta com
 * `progress`. Isso é o que faz voltar/avançar/pular capítulo ficar coerente:
 * a cena não tem relógio próprio, ela é uma função do tempo do ato. Trocar
 * transição CSS por timeline foi o que permitiu escalonamento com easing real,
 * traçado de path (DrawSVG) e pacote correndo pela curva (MotionPath).
 *
 * `prefers-reduced-motion` fixa a timeline em progress=1 (tudo visível, parado).
 */

export interface SceneProps {
  act: any
  progress: number
  reduced: boolean
  sevColor: string
}

const MONO = 'var(--mono)'

/**
 * Liga uma timeline pausada ao progresso do ato.
 * `janela` comprime a animação nos primeiros N% do ato, deixando o resto do
 * tempo para o operador ler a cena já montada.
 */
function useCena(construir: () => gsap.core.Timeline | void, progress: number, reduced: boolean, deps: any[] = [], janela = 0.8) {
  const raiz = useRef<HTMLDivElement>(null)
  const tl = useRef<gsap.core.Timeline | null>(null)

  useGSAP(() => {
    const t = construir()
    tl.current = t || null
    if (t) t.pause(reduced ? t.duration() : 0)
    return () => { tl.current = null }
  }, { scope: raiz, dependencies: deps })

  useEffect(() => {
    const t = tl.current
    if (!t) return
    t.progress(reduced ? 1 : Math.min(1, progress / janela))
  }, [progress, reduced, janela])

  return raiz
}

function Palco({ inner, children, pad = 18 }: { inner: React.Ref<HTMLDivElement>; children: React.ReactNode; pad?: number }) {
  return (
    <div ref={inner} style={{ height: '100%', padding: pad, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden', minHeight: 0 }}>
      {children}
    </div>
  )
}

function Etiqueta({ children, color = 'var(--text-mute)' }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color, marginBottom: 6 }}>
      {children}
    </div>
  )
}

/* ─────────────────────────── O fio (SVG + GSAP) ───────────────────────────
 * Trocou o canvas por SVG: DrawSVG traça a rota do atacante até o alvo e
 * MotionPath faz o pacote correr exatamente sobre a curva. O viewBox segue a
 * largura medida em px, então nada distorce ao redimensionar.
 * ------------------------------------------------------------------------ */

function Fio({ dir = 1, ativo, cor = '#F04452' }: { dir?: 1 | -1; ativo: boolean; cor?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(600)
  const H = 54

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const medir = () => setW(Math.max(240, el.getBoundingClientRect().width))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const x0 = 22, x1 = w - 22, y = H / 2
  const rota = `M${x0},${y} C${x0 + (x1 - x0) * 0.3},${y - 20} ${x0 + (x1 - x0) * 0.7},${y + 20} ${x1},${y}`

  useGSAP(() => {
    gsap.fromTo('.as-rota', { drawSVG: dir === 1 ? '0% 0%' : '100% 100%' }, { drawSVG: '0% 100%', duration: 1.1, ease: 'power2.inOut' })
    if (!ativo) return
    gsap.set('.as-pacote', { opacity: 1 })
    gsap.to('.as-pacote', {
      motionPath: { path: '.as-rota', align: '.as-rota', alignOrigin: [0.5, 0.5], start: dir === 1 ? 0 : 1, end: dir === 1 ? 1 : 0 },
      duration: 1.6, ease: 'none', repeat: -1, stagger: { each: 0.4, repeat: -1 },
    })
    gsap.fromTo('.as-eco', { scale: 0.4, opacity: 0.5 }, { scale: 3.2, opacity: 0, duration: 1.8, ease: 'power1.out', repeat: -1 })
  }, { scope: box, dependencies: [w, dir, ativo] })

  return (
    <div ref={box} style={{ width: '100%', height: H, flexShrink: 0 }}>
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
        <path d={rota} className="as-rota" fill="none" stroke="rgba(140,120,225,.35)" strokeWidth={1.2} strokeDasharray="3 5" />
        <circle className="as-eco" cx={dir === 1 ? x0 : x1} cy={y} r={7} fill="none" stroke={cor} strokeWidth={1} style={{ transformOrigin: `${dir === 1 ? x0 : x1}px ${y}px` }} />
        <circle cx={x0} cy={y} r={6.5} fill="none" stroke={cor} strokeWidth={1.3} />
        <circle cx={x1} cy={y} r={8.5} fill="none" stroke="#A78BFA" strokeWidth={1.3} />
        <circle cx={x1} cy={y} r={3.2} fill="rgba(167,139,250,.6)" />
        {[0, 1, 2].map((i) => (
          <circle key={i} className="as-pacote" r={2.8} fill={cor} opacity={0} />
        ))}
      </svg>
    </div>
  )
}

/* ───────────────────────── 01 · Reconhecimento ───────────────────────── */

export function CenaRecon({ act, progress, reduced }: SceneProps) {
  const probes: string[] = act.probes || []
  const raiz = useCena(() => gsap.timeline()
    .from('.as-probe', { opacity: 0, y: 10, duration: 0.4, stagger: 0.22, ease: 'power2.out' })
    .from('.as-achou', { opacity: 0, scale: 0.94, duration: 0.45, ease: 'back.out(1.6)' }, '+=0.25')
    .to('.as-achou', { boxShadow: '0 0 0 3px color-mix(in srgb, var(--critical) 22%, transparent)', duration: 0.3, yoyo: true, repeat: 1 }, '<'),
    progress, reduced, [act])

  return (
    <Palco inner={raiz}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>
        <span style={{ color: 'var(--critical)' }}>Atacante</span>
        <span style={{ color: 'var(--purple-light)' }}>Seu ativo</span>
      </div>
      <Fio dir={1} ativo={!reduced} />
      <div style={{ display: 'grid', gap: 6 }}>
        {probes.map((p, i) => (
          <div key={i} className="as-probe" style={{
            display: 'flex', alignItems: 'center', gap: 9, fontFamily: MONO, fontSize: 11.5,
            padding: '7px 11px', borderRadius: 6, background: 'var(--surface)',
            border: '1px solid var(--border)', color: 'var(--muted)',
          }}>
            <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>{String(i + 1).padStart(2, '0')}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p}</span>
          </div>
        ))}
      </div>
      <div className="as-achou" style={{
        marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 7,
        background: 'color-mix(in srgb, var(--critical) 12%, transparent)',
        border: '1px solid color-mix(in srgb, var(--critical) 34%, transparent)',
      }}>
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', color: 'var(--critical)' }}>ENCONTROU</span>
        <span style={{ fontSize: 12.5, color: 'var(--text)' }}>{act.hit}</span>
      </div>
    </Palco>
  )
}

/* ───────────────────────── 02 · A brecha (HTTP) ───────────────────────── */

function BlocoHttp({ titulo, linhas, cor, destaque, classe }: {
  titulo: string; linhas: string[]; cor: string; destaque: number | null; classe: string
}) {
  return (
    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Etiqueta color={cor}>{titulo}</Etiqueta>
      <div style={{
        flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7,
        padding: '10px 12px', fontFamily: MONO, fontSize: 11, lineHeight: 1.85, overflow: 'auto',
      }}>
        {linhas.map((l, i) => {
          const marcada = destaque === i
          return (
            <div key={i} className={marcada ? `${classe} as-flag` : classe} style={{
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              color: marcada ? 'var(--critical)' : 'var(--muted)',
              borderLeft: marcada ? '2px solid var(--critical)' : '2px solid transparent',
              paddingLeft: 7, marginLeft: -7, borderRadius: 3,
              fontWeight: marcada ? 600 : 400,
            }}>{l || ' '}</div>
          )
        })}
      </div>
    </div>
  )
}

export function CenaBrecha({ act, progress, reduced }: SceneProps) {
  const req: string[] = act.request || []
  const res: string[] = act.response || []
  const flag = act.flag || {}

  const raiz = useCena(() => gsap.timeline()
    .from('.as-req', { opacity: 0, x: -8, duration: 0.28, stagger: 0.13, ease: 'power1.out' })
    .from('.as-res', { opacity: 0, x: 8, duration: 0.28, stagger: 0.13, ease: 'power1.out' }, '+=0.15')
    .fromTo('.as-flag', { backgroundColor: 'rgba(240,68,82,0)' },
      { backgroundColor: 'rgba(240,68,82,.16)', duration: 0.35, repeat: 3, yoyo: true, ease: 'power1.inOut' }, '+=0.1')
    .to('.as-flag', { backgroundColor: 'rgba(240,68,82,.11)', duration: 0.25 })
    .from('.as-nota', { opacity: 0, y: 10, duration: 0.4, ease: 'power2.out' }, '-=0.3'),
    progress, reduced, [act])

  return (
    <Palco inner={raiz}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flex: 1, minHeight: 0 }}>
        <BlocoHttp titulo="Requisição do atacante" linhas={req} cor="var(--critical)" classe="as-req"
          destaque={flag.side === 'request' ? flag.line : null} />
        <BlocoHttp titulo="Resposta do seu servidor" linhas={res} cor="var(--purple-light)" classe="as-res"
          destaque={flag.side === 'response' ? flag.line : null} />
      </div>
      <div className="as-nota" style={{
        display: 'flex', gap: 9, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 7,
        background: 'color-mix(in srgb, var(--critical) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--critical) 30%, transparent)',
      }}>
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', color: 'var(--critical)', flexShrink: 0, marginTop: 2 }}>AQUI</span>
        <span style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.55 }}>{flag.note}</span>
      </div>
    </Palco>
  )
}

/* ───────────────────────── 03 · Por que existe (código) ───────────────────────── */

function BlocoCodigo({ linhas, tipo, classe }: { linhas: string[]; tipo: 'bad' | 'good'; classe: string }) {
  const cor = tipo === 'bad' ? 'var(--critical)' : 'var(--low)'
  return (
    <div className={classe} style={{
      position: 'absolute', inset: 0,
      background: 'var(--bg)', border: `1px solid color-mix(in srgb, ${cor} 26%, transparent)`,
      borderLeft: `2.5px solid ${cor}`, borderRadius: 7, padding: '11px 13px',
      fontFamily: MONO, fontSize: 11.5, lineHeight: 1.9, overflow: 'auto',
    }}>
      {linhas.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          <span style={{ color: 'var(--text-dim)', flexShrink: 0, userSelect: 'none', width: 14, textAlign: 'right' }}>{i + 1}</span>
          <span style={{ color: l.includes('←') ? cor : 'var(--muted)' }}>{l || ' '}</span>
        </div>
      ))}
    </div>
  )
}

export function CenaCausa({ act, progress, reduced }: SceneProps) {
  const temCodigo = Array.isArray(act.bad) && act.bad.length > 0

  const raiz = useCena(() => {
    if (!temCodigo) return gsap.timeline().from('.as-texto', { opacity: 0, y: 12, duration: 0.5, ease: 'power2.out' })
    return gsap.timeline()
      .from('.as-ruim', { opacity: 0, y: 10, duration: 0.4, ease: 'power2.out' })
      .from('.as-nota', { opacity: 0, duration: 0.3 }, '<0.2')
      .addLabel('lendo', '+=1.4')
      .to('.as-ruim', { opacity: 0, y: -14, duration: 0.45, ease: 'power2.in' }, 'lendo')
      .fromTo('.as-bom', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }, 'lendo+=0.2')
      .to('.as-selo', { color: 'var(--low)', duration: 0.3 }, 'lendo+=0.2')
  }, progress, reduced, [act, temCodigo])

  if (!temCodigo) {
    return (
      <Palco inner={raiz}>
        <Etiqueta color="var(--info)">Causa raiz</Etiqueta>
        <div className="as-texto" style={{
          flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24,
          background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
        }}>
          <div style={{ maxWidth: 620, fontSize: 14, lineHeight: 1.7, color: 'var(--muted)' }}>{act.note}</div>
        </div>
      </Palco>
    )
  }

  const corrigido = reduced ? false : progress > 0.52
  return (
    <Palco inner={raiz}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-mute)' }}>{act.file}</span>
        <span className="as-selo" style={{
          fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', padding: '3px 8px', borderRadius: 99,
          color: 'var(--critical)', background: 'color-mix(in srgb, currentColor 14%, transparent)',
          border: '1px solid color-mix(in srgb, currentColor 32%, transparent)',
        }}>{corrigido ? 'COMO DEVERIA SER' : 'COMO ESTÁ HOJE'}</span>
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <BlocoCodigo linhas={act.bad} tipo="bad" classe="as-ruim" />
        <BlocoCodigo linhas={act.good} tipo="good" classe="as-bom" />
      </div>

      <div className="as-nota" style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, borderLeft: '2px solid var(--border-mid)', paddingLeft: 11 }}>
        {act.note}
      </div>
    </Palco>
  )
}

/* ───────────────────────── 04 · A invasão ───────────────────────── */

export function CenaInvasao({ act, progress, reduced, sevColor }: SceneProps) {
  const steps: { label: string; detail: string }[] = act.steps || []
  const loot: string[] = act.loot || []

  const raiz = useCena(() => gsap.timeline()
    .from('.as-passo', { opacity: 0, x: -12, duration: 0.35, stagger: 0.3, ease: 'power2.out' })
    .from('.as-loot', { opacity: 0, y: 8, scale: 0.96, duration: 0.3, stagger: 0.22, ease: 'back.out(2)' }, '-=0.6'),
    progress, reduced, [act])

  return (
    <Palco inner={raiz}>
      <Fio dir={-1} ativo={!reduced} />
      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 12, flex: 1, minHeight: 0 }}>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Etiqueta color="var(--critical)">O que o atacante faz</Etiqueta>
          <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
            {steps.map((s, i) => (
              <div key={i} className="as-passo" style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7,
                padding: '9px 11px', borderLeft: '2px solid var(--critical)',
              }}>
                <div style={{ fontFamily: MONO, fontSize: 11.5, color: 'var(--text)', wordBreak: 'break-word' }}>
                  <span style={{ color: 'var(--critical)' }}>$ </span>{s.label}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-mute)', marginTop: 3 }}>{s.detail}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Etiqueta color={sevColor}>O que sai daqui</Etiqueta>
          <div style={{
            flex: 1, minHeight: 0, background: 'var(--bg)', borderRadius: 7,
            border: `1px solid color-mix(in srgb, ${sevColor} 26%, transparent)`,
            padding: '10px 11px', display: 'grid', gap: 7, alignContent: 'start', overflow: 'auto',
          }}>
            {loot.map((l, i) => (
              <div key={i} className="as-loot" style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12, color: 'var(--text)' }}>
                <span style={{ color: sevColor, fontSize: 13, lineHeight: 1 }}>▸</span>
                <span>{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Palco>
  )
}

/* ───────────────────────── 05 · O estrago ───────────────────────── */

export function CenaEstrago({ act, progress, reduced, sevColor }: SceneProps) {
  const colunas = [
    { titulo: 'Na aplicação', itens: act.app || [], cor: 'var(--purple-light)' },
    { titulo: 'No negócio', itens: act.business || [], cor: sevColor },
    { titulo: 'Legal e regulatório', itens: act.legal || [], cor: 'var(--medium)' },
  ]

  const raiz = useCena(() => gsap.timeline()
    .from('.as-col', { opacity: 0, y: 16, duration: 0.4, stagger: 0.18, ease: 'power2.out' })
    .from('.as-item', { opacity: 0, x: -8, duration: 0.28, stagger: 0.1, ease: 'power1.out' }, '-=0.5'),
    progress, reduced, [act])

  return (
    <Palco inner={raiz}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, flex: 1, minHeight: 0 }}>
        {colunas.map((c) => (
          <div key={c.titulo} className="as-col" style={{
            minWidth: 0, display: 'flex', flexDirection: 'column',
            background: 'var(--bg)', borderRadius: 8, padding: '12px 13px',
            border: `1px solid color-mix(in srgb, ${c.cor} 22%, transparent)`,
            borderTop: `2px solid ${c.cor}`,
          }}>
            <Etiqueta color={c.cor}>{c.titulo}</Etiqueta>
            <div style={{ display: 'grid', gap: 9, alignContent: 'start', overflow: 'auto', minHeight: 0 }}>
              {c.itens.map((item: string, i: number) => (
                <div key={i} className="as-item" style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12, lineHeight: 1.55, color: 'var(--muted)' }}>
                  <span style={{ color: c.cor, fontSize: 12, lineHeight: 1.4 }}>■</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Palco>
  )
}

export const CENAS: Record<string, (p: SceneProps) => JSX.Element> = {
  recon: CenaRecon,
  breach: CenaBrecha,
  cause: CenaCausa,
  exploit: CenaInvasao,
  impact: CenaEstrago,
}
