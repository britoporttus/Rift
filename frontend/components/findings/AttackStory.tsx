'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import type { Finding } from '@/lib/api'
import { SEV_COLOR } from '@/lib/severity'
import { lessonFor } from '@/lib/vulnEducation'
import { usePrefersReducedMotion } from '@/lib/motion'
import { storyFor } from '@/lib/attackStory'
import { CENAS } from './attack/scenes'
import { X, Play, Pause, ChevronLeft, ChevronRight, RotateCcw, Crosshair } from 'lucide-react'

/**
 * "Anatomia do ataque" — o explicador cinematográfico de um finding.
 *
 * Cinco atos fixos (reconhecimento → brecha → causa → invasão → estrago) que
 * respondem, em ordem, o que o cliente pergunta quando lê um relatório: o que é
 * isso, por que aconteceu comigo, como me invadiriam e quanto isso custa.
 *
 * O conteúdo vem de `lib/attackStory` (dado curado por classe + alvo real do
 * finding). Este componente só orquestra tempo, navegação e acessibilidade —
 * nada de texto de segurança escrito aqui.
 */

const SEV_ROTULO: Record<string, string> = {
  critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo', info: 'Informativo',
}

export function AttackStory({ finding, onClose }: { finding: Finding; onClose: () => void }) {
  const reduced = usePrefersReducedMotion()
  const lesson = useMemo(() => lessonFor(finding), [finding])
  const story = useMemo(() => storyFor(lesson, finding), [lesson, finding])
  const sevColor = SEV_COLOR[finding.severity] || 'var(--high)'
  const ultimo = story.acts.length - 1

  const [ato, setAto] = useState(0)
  const [progresso, setProgresso] = useState(0)
  const [tocando, setTocando] = useState(!reduced)
  const boxRef = useRef<HTMLDivElement>(null)
  /** Relógio do ato: um tween GSAP sobre um objeto simples. É ele que dá
   *  pause/resume e, principalmente, `progress()` — a base do scrub. */
  const relogio = useRef<gsap.core.Tween | null>(null)

  const irPara = useCallback((i: number, autoplay = false) => {
    const alvo = Math.max(0, Math.min(ultimo, i))
    setAto(alvo)
    setProgresso(reduced ? 1 : 0)
    if (autoplay && !reduced) setTocando(true)
  }, [ultimo, reduced])

  // Movimento reduzido: sem autoplay e com a cena inteira revelada de uma vez.
  useEffect(() => {
    if (!reduced) return
    setTocando(false)
    setProgresso(1)
  }, [reduced])

  // Um tween por ato. Ao completar, avança; no último, para (e oferece "rever").
  useGSAP(() => {
    if (reduced) { relogio.current = null; setProgresso(1); return }
    const alvo = { v: 0 }
    relogio.current = gsap.to(alvo, {
      v: 1,
      duration: story.acts[ato]?.seconds || 8,
      ease: 'none',
      paused: true,
      onUpdate: () => setProgresso(alvo.v),
      onComplete: () => {
        if (ato < ultimo) { setProgresso(0); setAto(ato + 1) }
        else setTocando(false)
      },
    })
    return () => { relogio.current = null }
  }, { dependencies: [ato, ultimo, reduced, story] })

  useEffect(() => {
    const t = relogio.current
    if (!t || reduced) return
    if (tocando) t.play()
    else t.pause()
  }, [tocando, reduced, ato])

  /** Arrastar na trilha do ato atual busca no tempo; clicar em outro ato salta. */
  const scrub = useCallback((e: React.PointerEvent<HTMLElement>, i: number) => {
    if (i !== ato) { irPara(i, true); return }
    if (reduced) return
    const trilha = e.currentTarget as HTMLElement
    setTocando(false)
    const mover = (clientX: number) => {
      const r = trilha.getBoundingClientRect()
      const f = Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)))
      relogio.current?.progress(f)
      setProgresso(f)
    }
    mover(e.clientX)
    const onMove = (ev: PointerEvent) => mover(ev.clientX)
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [ato, irPara, reduced])

  // Foco e trava de rolagem: só na abertura. Se dependessem do ato, o foco
  // pularia do botão "próximo" para o diálogo a cada avanço.
  useEffect(() => {
    boxRef.current?.focus()
    const overflowAntes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflowAntes }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); irPara(ato + 1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); irPara(ato - 1) }
      else if (e.key === ' ') { e.preventDefault(); if (!reduced) setTocando((t) => !t) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, irPara, ato, reduced])

  const atoAtual = story.acts[ato]
  const Cena = CENAS[atoAtual.key]
  const acabou = ato === ultimo && progresso >= 1

  // Portal: o painel vive dentro do card do finding, que tem `overflow: hidden`
  // e é ele próprio um botão. Renderizar em document.body tira o modal do
  // recorte e de qualquer ancestral com `transform` (que quebraria o `fixed`).
  // Só monta após clique do operador, então `document` sempre existe aqui.
  return createPortal(
    <div
      // Portal move o DOM, mas evento React ainda sobe para a árvore React pai —
      // o card clicável. Sem barrar aqui, fechar (ou teclar) colapsa o finding.
      onClick={(e) => { e.stopPropagation(); onClose() }}
      onKeyDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(2,2,8,0.9)', backdropFilter: 'blur(3px)',
        zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        animation: 'fadeIn .15s ease',
      }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Anatomia do ataque: ${finding.title}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 1080, maxHeight: '92vh',
          background: 'var(--surface)', border: '1px solid var(--border-mid)', borderRadius: 12,
          display: 'flex', flexDirection: 'column', overflow: 'hidden', outline: 'none',
          boxShadow: '0 28px 90px rgba(0,0,0,0.86)',
        }}
      >
        {/* Cabeçalho */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px',
          background: 'var(--panel)', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <span style={{
            fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', padding: '4px 9px', borderRadius: 5,
            color: sevColor, background: `color-mix(in srgb, ${sevColor} 15%, transparent)`,
            border: `1px solid color-mix(in srgb, ${sevColor} 36%, transparent)`, flexShrink: 0,
          }}>{(SEV_ROTULO[finding.severity] || finding.severity || '').toUpperCase()}</span>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {finding.title}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--text-mute)', marginTop: 1 }}>
              <Crosshair size={10} />
              <span style={{ fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {story.target.resolved ? story.target.url : 'alvo não informado neste achado'}
              </span>
            </div>
          </div>

          <button onClick={onClose} aria-label="Fechar" style={{
            display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 6,
            background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)',
            cursor: 'pointer', flexShrink: 0,
          }}><X size={14} /></button>
        </div>

        {/* Capítulos */}
        <div style={{ display: 'flex', gap: 6, padding: '10px 14px 0', flexShrink: 0 }}>
          {story.acts.map((a: any, i: number) => {
            const ativo = i === ato
            const passado = i < ato
            const preenchimento = passado ? 1 : ativo ? progresso : 0
            return (
              <button
                key={a.key}
                onPointerDown={(e) => scrub(e, i)}
                // Teclado não arrasta: Enter/Espaço saltam para o início do ato.
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); irPara(i, true) } }}
                title={ativo ? `${a.headline} — arraste para procurar` : a.headline}
                style={{
                  flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent',
                  border: 'none', padding: 0, touchAction: 'none',
                  cursor: ativo && !reduced ? 'ew-resize' : 'pointer',
                }}
              >
                <div style={{ height: 2.5, borderRadius: 2, background: 'var(--border-mid)', overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{
                    height: '100%', width: `${Math.round(preenchimento * 100)}%`,
                    background: ativo ? sevColor : 'var(--purple)',
                    transition: ativo ? 'none' : 'width .3s ease',
                  }} />
                </div>
                <div style={{
                  fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
                  color: ativo ? 'var(--text)' : passado ? 'var(--text-mute)' : 'var(--text-dim)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  transition: 'color .25s ease',
                }}>
                  <span style={{ color: ativo ? sevColor : 'inherit' }}>{a.n}</span> {a.label}
                </div>
              </button>
            )
          })}
        </div>

        {/* Palco da cena — altura fixa para os atos não pularem */}
        <div style={{ flex: 1, minHeight: 0, padding: '4px 14px 0', display: 'flex' }}>
          <div key={atoAtual.key} style={{
            flex: 1, minHeight: 300, background: 'var(--surface2)',
            border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden',
            animation: reduced ? 'none' : 'fadeIn .3s ease both',
          }}>
            <Cena act={atoAtual} progress={progresso} reduced={reduced} sevColor={sevColor} />
          </div>
        </div>

        {/* Narração + controles */}
        <div style={{ padding: '12px 14px 14px', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: sevColor, marginBottom: 4 }}>
                {atoAtual.headline}
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--muted)', margin: 0 }}>
                {atoAtual.narration}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
              <Ctl onClick={() => irPara(ato - 1)} disabled={ato === 0} label="Ato anterior"><ChevronLeft size={15} /></Ctl>
              {acabou ? (
                <Ctl onClick={() => irPara(0, true)} label="Rever desde o início" destaque={sevColor}><RotateCcw size={14} /></Ctl>
              ) : (
                <Ctl onClick={() => setTocando((t) => !t)} disabled={reduced} label={tocando ? 'Pausar' : 'Continuar'} destaque={sevColor}>
                  {tocando ? <Pause size={14} /> : <Play size={14} />}
                </Ctl>
              )}
              <Ctl onClick={() => irPara(ato + 1)} disabled={ato === ultimo} label="Próximo ato"><ChevronRight size={15} /></Ctl>
            </div>
          </div>

          {!story.scripted && (
            <div style={{ marginTop: 10, fontSize: 10.5, color: 'var(--text-dim)', lineHeight: 1.5 }}>
              Roteiro genérico: esta classe de vulnerabilidade ainda não tem encenação própria — os textos vêm da base educativa do achado.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Ctl({ children, onClick, disabled, label, destaque }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; label: string; destaque?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 7,
        background: destaque ? `color-mix(in srgb, ${destaque} 14%, transparent)` : 'var(--raised)',
        border: `1px solid ${destaque ? `color-mix(in srgb, ${destaque} 34%, transparent)` : 'var(--border)'}`,
        color: disabled ? 'var(--text-dim)' : destaque || 'var(--muted)',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
      }}
    >{children}</button>
  )
}
