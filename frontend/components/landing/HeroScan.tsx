'use client'
import { useEffect, useRef, useState } from 'react'
import { GridScan, type GridScanHandle } from './GridScan'

/**
 * Primeiro bloco da home: o túnel infinito com a varredura, RIFT no centro e
 * uma frase curta embaixo. Ao rolar, a câmera MERGULHA no corredor — como se o
 * visitante entrasse junto com o scan — e a página segue normalmente.
 *
 * Mesma mecânica do ato orbital: uma seção alta com um palco `sticky` dentro.
 * O progresso do scroll dentro dela vira `uZoom` no shader e a escala/opacidade
 * do texto. Nada disso passa por state do React — seriam 60 renders por segundo
 * para animar duas propriedades.
 */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const easeIn = (t: number) => t * t

export function HeroScan() {
  const secRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const copyRef = useRef<HTMLDivElement>(null)
  const cueRef = useRef<HTMLDivElement>(null)
  const scan = useRef<GridScanHandle | null>(null)
  const [scanColor, setScanColor] = useState('#CCFF00')

  // a cor da varredura segue o tom escolhido. WebGL não lê `var(--accent)`, então
  // o valor é resolvido aqui e reenviado quando o seletor de tom troca o atributo.
  useEffect(() => {
    const root = secRef.current?.closest('.rl') as HTMLElement | null
    if (!root) return
    const sync = () => {
      const v = getComputedStyle(root).getPropertyValue('--accent').trim()
      if (v.startsWith('#')) setScanColor(v)
    }
    sync()
    const mo = new MutationObserver(sync)
    mo.observe(root, { attributes: true, attributeFilter: ['data-tom'] })
    return () => mo.disconnect()
  }, [])

  useEffect(() => {
    const sec = secRef.current
    const copy = copyRef.current
    if (!sec || !copy) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

    let prog = 0
    const read = () => {
      const total = sec.offsetHeight - innerHeight
      if (total <= 0) return 0
      return clamp01(-sec.getBoundingClientRect().top / total)
    }

    let raf = 0
    const apply = () => {
      raf = 0
      const p = reduced ? 0 : prog

      /* A abertura tem quatro tempos:
         0.00–0.12  parado — dá tempo de ler RIFT antes de qualquer coisa
         0.12–0.72  arranque — a câmera acelera corredor adentro, os pontos
                    viram rastro e a lente abre
         0.62–0.92  o estouro — a varredura ultrapassa a câmera e a tela lava
         0.92–1.00  a luz decai e a página entrega o conteúdo             */
      const dive = clamp01((p - 0.12) / 0.60)
      const zoom = easeIn(dive)                    // aceleração, não velocidade constante
      const speed = Math.pow(dive, 1.35)
      // Expoente 3 e não 2: o estouro vira um lampejo curto em vez de um platô.
      // Com pico alto e curva larga a tela ficava lavada de cor por um terço da
      // rolagem — vira bloco de cor, que é o oposto do efeito.
      const burst = clamp01((p - 0.66) / 0.24)
      const flash = Math.pow(Math.sin(Math.PI * burst), 3) * 0.52

      scan.current?.setDive(zoom, speed, flash)

      // o texto vem em direção ao leitor e some — ele "atravessa" a câmera
      copy.style.setProperty('--copyScale', String(1 + easeIn(dive) * 2.6))
      copy.style.setProperty('--copyFade', String(clamp01(1 - dive * 2.6)))
      cueRef.current?.style.setProperty('--cueFade', String(clamp01(1 - p * 6)))

      /* O palco NÃO desvanece. Ele é `sticky` e ocupa a última tela da seção:
         apagá-lo deixava um viewport inteiro de preto entre o mergulho e a
         abertura — era o vão vazio. Sem o fade, o túnel fica até o fim e a
         próxima seção sobe por cima dele, como qualquer outra rolagem. */
    }
    const onScroll = () => {
      prog = read()
      if (!raf) raf = requestAnimationFrame(apply)
    }
    onScroll()
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('resize', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('scroll', onScroll)
      removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <section className="scanhero" id="topo" ref={secRef}>
      <div className="scanhero-stage" ref={stageRef} onClick={() => scan.current?.pulse()}>
        <GridScan handleRef={scan} linesColor="#2F293A" scanColor={scanColor} />
        <div className="scanhero-vig" />
        <div className="scanhero-copy" ref={copyRef}>
          <h1 className="scanhero-h1">RIFT</h1>
          <p className="scanhero-sub">Poucos achados. Todos verdadeiros.</p>
        </div>
        <div className="scanhero-cue" ref={cueRef}><i />Role para entrar</div>
      </div>
    </section>
  )
}
