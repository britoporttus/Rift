'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { X, ArrowRight } from 'lucide-react'
import { MODULES, MODULE_LABEL } from './modules'

/**
 * O ato orbital da home: a órbita entra crescendo e girando rápido, trava para
 * leitura, e volta a se afastar quando o scroll continua.
 *
 * Decisões que valem lembrar:
 *
 * - O painel do módulo abre AO LADO da órbita, não por cima. A referência
 *   original ancorava o card no centro, e na prática ele cobria o núcleo e
 *   metade dos nós. Aqui a órbita desliza para a esquerda e o módulo escolhido
 *   gira até o lado direito — o raio dele passa a apontar para o painel.
 *
 * - O título vive numa faixa própria do flex (não é absolute). Foi o que
 *   resolveu o título encostando nos nós de cima em telas baixas.
 *
 * - Posição/rotação são escritas direto no DOM via variáveis CSS dentro do
 *   rAF. Passar isso por state re-renderizaria 6 nós a 60fps sem necessidade.
 */

/* fases ao longo do scroll da seção */
const P_IN = 0.30            // termina de entrar
const P_OUT = 0.74           // começa a sair
const Z_MIN = 0.24           // escala mínima (longe)
const R_ORBIT = 42           // raio dos nós, em % da caixa da órbita
const SPIN_FAST = 3.6        // graus por frame durante o zoom
const SPIN_IDLE = 0.15       // graus por frame com a órbita acoplada

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const easeIn = (t: number) => t * t * t
/** menor giro equivalente, para o nó não dar a volta longa */
const wrapDelta = (d: number) => ((d + 180) % 360 + 360) % 360 - 180

export function OrbitalAct() {
  const [openId, setOpenId] = useState<string | null>(null)

  const actRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const orbRef = useRef<HTMLDivElement>(null)
  const sweepRef = useRef<HTMLDivElement>(null)
  const hintRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([])
  const lineRefs = useRef<(SVGLineElement | null)[]>([])
  const pulseRefs = useRef<(SVGCircleElement | null)[]>([])

  // espelhos para o rAF ler sem re-render
  const openIdRef = useRef<string | null>(null)
  const rotRef = useRef(0)
  const rotTargetRef = useRef<number | null>(null)
  const progRef = useRef(0)

  const open = useCallback((id: string | null) => {
    setOpenId((prev) => {
      const next = prev === id ? null : id
      openIdRef.current = next
      if (next) {
        // gira o módulo escolhido até a direita (0°), onde o painel abre
        const idx = MODULES.findIndex((m) => m.id === next)
        const want = -((idx / MODULES.length) * 360)
        rotTargetRef.current = rotRef.current + wrapDelta(want - rotRef.current)
      }
      return next
    })
  }, [])

  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const act = actRef.current
    const orb = orbRef.current
    if (!act || !orb) return

    const readProgress = () => {
      const total = act.offsetHeight - innerHeight
      if (total <= 0) return 0
      return clamp01(-act.getBoundingClientRect().top / total)
    }

    const onScroll = () => {
      progRef.current = readProgress()
      // saiu da doca (por cima ou por baixo): fecha o painel
      if (openIdRef.current && (progRef.current < P_IN * 0.9 || progRef.current >= P_OUT)) {
        open(null)
      }
    }

    progRef.current = readProgress()
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('resize', onScroll, { passive: true })

    let raf = 0
    const loop = (now: number) => {
      const prog = progRef.current
      let zoom: number, presence: number, spinBoost: number

      if (prog < P_IN) {                                   // entrando
        const t = easeOut(clamp01(prog / P_IN))
        zoom = Z_MIN + t * (1 - Z_MIN); presence = t; spinBoost = 1 - t
      } else if (prog < P_OUT) {                           // acoplado
        zoom = 1; presence = 1; spinBoost = 0
      } else {                                             // saindo
        const u = easeIn(clamp01((prog - P_OUT) / (1 - P_OUT)))
        zoom = 1 - u * (1 - Z_MIN); presence = 1 - u; spinBoost = u
      }
      if (reduced) { zoom = 1; presence = 1; spinBoost = 0 }

      const isOpenPanel = openIdRef.current !== null
      const docked = prog >= P_IN * 0.92 && prog < P_OUT

      orb.style.setProperty('--zoom', zoom.toFixed(4))
      orb.style.setProperty('--orbIn', (0.25 + 0.75 * presence).toFixed(3))
      // com o painel aberto a órbita cede espaço para a direita
      orb.style.setProperty('--orbX', isOpenPanel ? '-40px' : '0px')
      stageRef.current?.style.setProperty('--bgFade', presence.toFixed(3))
      titleRef.current?.style.setProperty('--titleIn', presence.toFixed(3))
      sweepRef.current?.style.setProperty('--sweepIn', docked ? '1' : '0')
      hintRef.current?.style.setProperty('--hintIn', docked && !isOpenPanel ? '1' : '0')

      if (rotTargetRef.current !== null) {
        const d = rotTargetRef.current - rotRef.current
        if (Math.abs(d) < 0.12) { rotRef.current = rotTargetRef.current; rotTargetRef.current = null }
        else rotRef.current += d * 0.11
      } else if (!isOpenPanel && !reduced) {
        rotRef.current += SPIN_IDLE + (SPIN_FAST - SPIN_IDLE) * spinBoost
      }

      const box = orb.clientWidth || 1
      const coreU = (34 / box) * 100          // borda do núcleo, em unidades do viewBox
      const nodeU = (26 / box) * 100          // borda do disco do módulo
      const r1 = coreU + 1.5
      const r2 = R_ORBIT - nodeU - 1
      const rot = rotRef.current
      const t01 = now / 1000
      const n = MODULES.length

      // laço `for` e sem alocação: isto roda a cada frame
      for (let i = 0; i < n; i++) {
        const a = ((i / n) * 360 + rot) * Math.PI / 180
        const ca = Math.cos(a)
        const sa = Math.sin(a)
        const isOpen = MODULES[i].id === openIdRef.current
        const depth = 0.45 + 0.55 * ((1 + sa) / 2)

        const el = nodeRefs.current[i]
        if (el) {
          el.style.setProperty('--x', (ca * (R_ORBIT / 100) * box).toFixed(1))
          el.style.setProperty('--y', (sa * (R_ORBIT / 100) * box).toFixed(1))
          el.style.setProperty('--o', isOpen ? '1' : depth.toFixed(3))
          el.style.zIndex = String(Math.round(20 + 10 * ca) + (isOpen ? 40 : 0))
          el.style.pointerEvents = docked ? 'auto' : 'none'
        }

        const ln = lineRefs.current[i]
        if (ln) {
          ln.setAttribute('x1', (ca * r1).toFixed(2))
          ln.setAttribute('y1', (sa * r1).toFixed(2))
          ln.setAttribute('x2', (ca * r2).toFixed(2))
          ln.setAttribute('y2', (sa * r2).toFixed(2))
          ln.setAttribute('opacity', (isOpen ? 1 : depth * 0.55).toFixed(3))
          ln.setAttribute('data-on', isOpen ? '1' : '0')
        }

        const pl = pulseRefs.current[i]
        if (pl) {
          if (docked && !reduced) {
            const ph = (t01 * 0.42 + i * 0.17) % 1
            const rp = r1 + (r2 - r1) * ph
            pl.setAttribute('cx', (ca * rp).toFixed(2))
            pl.setAttribute('cy', (sa * rp).toFixed(2))
            pl.setAttribute('opacity', (Math.sin(ph * Math.PI) * depth * 0.9).toFixed(3))
          } else {
            pl.setAttribute('opacity', '0')
          }
        }
      }

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') open(null) }
    addEventListener('keydown', onKey)

    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('scroll', onScroll)
      removeEventListener('resize', onScroll)
      removeEventListener('keydown', onKey)
    }
  }, [open])

  const active = openId ? MODULES.find((m) => m.id === openId) : null
  const related = active ? active.pairs : []

  return (
    <section className="act" id="modulos" ref={actRef}>
      <div className="stage" ref={stageRef}>
        <div className="stage-bg" />

        <div className="act-title" ref={titleRef}>
          <p>O que o Rift cobre</p>
          <h2>Seis superfícies.<br />Um painel.</h2>
        </div>

        <div
          className="orb-row"
          onClick={(e) => {
            const t = e.target as HTMLElement
            if (!t.closest('.node') && !t.closest('.detail')) open(null)
          }}
        >
          <div className="orb" ref={orbRef}>
            {/* só o anel interno — o externo passava rente aos nós */}
            <div className="o-ring o-2" />
            <div className="tick" />
            <div className="sweep" ref={sweepRef} />

            <svg className="spokes" viewBox="-50 -50 100 100" aria-hidden="true">
              {MODULES.map((m, i) => (
                <g key={m.id}>
                  <line ref={(el) => { lineRefs.current[i] = el }} />
                  <circle r="0.9" opacity="0" ref={(el) => { pulseRefs.current[i] = el }} />
                </g>
              ))}
            </svg>

            <div className="core"><b>R</b></div>

            {MODULES.map((m, i) => {
              const Icon = m.icon
              const isOpen = openId === m.id
              return (
                <div
                  key={m.id}
                  className="node"
                  ref={(el) => { nodeRefs.current[i] = el }}
                  role="button"
                  tabIndex={0}
                  aria-label={m.title + (m.live ? '' : ' — em breve')}
                  aria-pressed={isOpen}
                  data-open={isOpen ? '1' : '0'}
                  data-rel={!isOpen && related.includes(m.id) ? '1' : '0'}
                  data-soon={m.live ? '0' : '1'}
                  onClick={(e) => { e.stopPropagation(); open(m.id) }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(m.id) }
                  }}
                >
                  <div className="node-d">
                    <Icon size={19} />
                    {!m.live && <span className="node-soon">EM BREVE</span>}
                  </div>
                  <div className="node-t">{m.title}</div>
                </div>
              )
            })}
          </div>

          {active && (
            <div className="detail" role="dialog" aria-label={active.title}>
              <button className="d-close" onClick={() => open(null)} aria-label="Fechar">
                <X size={14} />
              </button>
              <div className="d-head">
                <span className={`pill ${active.live ? 'on' : 'soon'}`}>
                  {active.live ? 'Disponível' : 'Em breve'}
                </span>
                <span className="d-mode">{active.mode}</span>
              </div>
              <h3>{active.title}</h3>
              <p>{active.desc}</p>

              <div className="d-sec">O que cobre</div>
              <div className="d-chips">
                {active.covers.map((c) => <span className="d-chip" key={c}>{c}</span>)}
              </div>

              {active.pairs.length > 0 && (
                <>
                  <div className="d-sec">Combina com</div>
                  <div className="d-links">
                    {active.pairs.map((p) => (
                      <button className="d-link" key={p} onClick={() => open(p)}>
                        {MODULE_LABEL[p] || p}<ArrowRight size={9} />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="hint" ref={hintRef}>Clique em um módulo</div>
      </div>
    </section>
  )
}
