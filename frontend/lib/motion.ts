'use client'
/**
 * Fundação de movimento do Rift.
 *
 * Motivação (ciclo de "talento visual" 2026-08-03): os gráficos e cards
 * apareciam prontos, sem vida. Estes utilitários dão entrada animada de forma
 * *segura* — respeitam `prefers-reduced-motion`, não causam mismatch de
 * hidratação (SSR e primeiro render do cliente batem) e têm um botão de
 * desligar (`enabled=false`) para contextos onde animação atrapalha, como a
 * geração de PDF por Chromium headless.
 *
 * Convenção do repo: estilo inline + variáveis CSS de globals.css.
 *
 * ATUALIZAÇÃO 2026-08-04 — a regra "nada de bibliotecas de animação" que estava
 * aqui foi revertida por decisão do operador. Entraram DUAS, cada uma com
 * escopo fechado:
 *   · Motion  → entrada/SAÍDA e layout de elementos no app, em
 *               [[components/ui/motion]]. Existe porque CSS não anima o que sai
 *               do DOM.
 *   · GSAP    → só dentro do modal "Anatomia do ataque", carregado sob demanda.
 *               Existe pela timeline com scrub e pelo DrawSVG/MotionPath.
 *
 * Este arquivo NÃO migrou: `useCountUp` e `useDrawProgress` produzem um número
 * por frame para o React desenhar, e aí rAF já é a resposta certa — Motion não
 * acrescentaria nada e só somaria indireção.
 */
import { useEffect, useRef, useState } from 'react'

/** Curva padrão de saída do Rift — desacelera no fim, sensação de "assentar". */
export const EASE = 'cubic-bezier(.2,.7,.2,1)'
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

/** `true` quando o usuário pediu menos movimento no sistema. Começa `false`
 *  (igual no servidor) e ajusta no cliente — sem mismatch de hidratação. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return reduced
}

/** `true` só depois de montar no cliente — para disparar entradas sem quebrar SSR. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return mounted
}

interface CountUpOpts {
  /** duração da contagem em ms (padrão 1100) */
  duration?: number
  /** casas decimais exibidas (padrão 0) */
  decimals?: number
  /** desligar a animação (ex.: PDF) — vai direto ao valor final */
  enabled?: boolean
}

/**
 * Conta de 0 até `target` com easing. Retorna o número já arredondado para
 * exibir. Em `prefers-reduced-motion` ou `enabled=false`, entrega o valor final
 * de imediato. SSR renderiza 0 (ou o alvo, se desligado) e converge no cliente.
 */
export function useCountUp(target: number, opts: CountUpOpts = {}): number {
  const { duration = 1100, decimals = 0, enabled = true } = opts
  const reduced = usePrefersReducedMotion()
  const [value, setValue] = useState(enabled ? 0 : target)
  const raf = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!enabled || reduced) { setValue(target); return }
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setValue(target * easeOutCubic(t))
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [target, duration, enabled, reduced])

  const f = Math.pow(10, decimals)
  return Math.round(value * f) / f
}

/**
 * Progresso 0→1 animado por rAF, para dirigir desenhos de gráfico (arco do
 * donut, área da linha). `enabled=false`/reduced entrega 1 na hora.
 */
export function useDrawProgress(opts: { duration?: number; enabled?: boolean } = {}): number {
  const { duration = 1000, enabled = true } = opts
  const reduced = usePrefersReducedMotion()
  const [p, setP] = useState(enabled ? 0 : 1)
  const raf = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!enabled || reduced) { setP(1); return }
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setP(t)
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [duration, enabled, reduced])

  return p
}
