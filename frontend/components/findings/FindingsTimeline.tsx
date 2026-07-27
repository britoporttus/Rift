'use client'
import { useEffect, useRef, useState } from 'react'
import { api, Finding } from '@/lib/api'
import { SEV_COLOR } from '@/lib/severity'
import { ChevronDown, ChevronRight, Waypoints } from 'lucide-react'

// PROTÓTIPO — usa amCharts 5 (licença SaaS necessária p/ produção, app tem login;
// ver memória rift_visual_reformulation_2026_07 / decisão do operador 2026-07-23).
// Antes de virar produção "de verdade": comprar licença OU reescrever em SVG puro
// (como os outros gráficos do Rift: Donut/Gauge/ScoreSlider/HBars).

interface Milestone {
  type: string
  ts?: number
  kind?: string
  label?: string
  phase?: string
  source?: string
  items?: string[]
}

const PHASE_LABEL: Record<string, string> = {
  recon: 'Recon', enum: 'Enumeração', vuln: 'Vulnerabilidades',
  exploit: 'Exploração', post: 'Pós-exploração', report: 'Relatório',
}
const PHASE_ORDER = ['recon', 'enum', 'vuln', 'exploit', 'post', 'report']
const FINDINGS_LANE = 'Achados'

function normalizePhase(p: string): string {
  const s = (p || '').toLowerCase()
  for (const key of PHASE_ORDER) if (s.includes(key)) return key
  return ''
}

export function FindingsTimeline({ engagementId, findings }: { engagementId: string; findings: Finding[] }) {
  const [open, setOpen] = useState(false)
  const [milestones, setMilestones] = useState<Milestone[] | null>(null)
  const chartDivRef = useRef<HTMLDivElement>(null)

  // Carrega o histórico de mensagens (marcos com timestamp real + ferramenta de origem)
  // só quando a seção é aberta pela 1ª vez — evita puxar isso à toa em toda visita à aba.
  useEffect(() => {
    if (!open || milestones !== null) return
    let cancelled = false
    api.engagements.messages(engagementId)
      .then((msgs) => {
        if (cancelled) return
        const ms = (msgs as unknown as Milestone[]).filter((m) => m.type === 'milestone' && typeof m.ts === 'number' && m.phase)
        setMilestones(ms)
      })
      .catch(() => { if (!cancelled) setMilestones([]) })
    return () => { cancelled = true }
  }, [open, milestones, engagementId])

  // Monta o gráfico amCharts 5 (dynamic import — só carrega a lib quando a seção abre).
  useEffect(() => {
    if (!open || milestones === null || !chartDivRef.current) return
    let disposed = false
    let root: any = null

    const findingsWithDate = findings.filter((f) => f.firstSeen)
    const lanes = PHASE_ORDER.filter((p) => milestones.some((m) => normalizePhase(m.phase || '') === p))
    if (findingsWithDate.length) lanes.push('__findings__')
    if (lanes.length === 0) { setMilestones([]); return } // nada pra desenhar

    ;(async () => {
      const [am5, am5xy, am5timeline, { default: am5themes_Animated }, { default: am5themes_Dark }] = await Promise.all([
        import('@amcharts/amcharts5'),
        import('@amcharts/amcharts5/xy'),
        import('@amcharts/amcharts5/timeline'),
        import('@amcharts/amcharts5/themes/Animated'),
        import('@amcharts/amcharts5/themes/Dark'),
      ])
      if (disposed || !chartDivRef.current) return

      root = am5.Root.new(chartDivRef.current)
      root.setThemes([am5themes_Animated.new(root), am5themes_Dark.new(root)])
      root._logo?.dispose()

      const chart = root.container.children.push(
        am5timeline.SerpentineChart.new(root, {
          orientation: 'vertical',
          levelCount: Math.max(2, Math.ceil(lanes.length / 2)),
          yAxisRadius: am5.percent(46),
        })
      )

      const yRenderer = am5timeline.AxisRendererCurveY.new(root, {})
      const xRenderer = am5timeline.AxisRendererCurveX.new(root, { yRenderer })

      const yAxis = chart.yAxes.push(am5xy.CategoryAxis.new(root, {
        categoryField: 'lane',
        renderer: yRenderer,
        tooltip: am5.Tooltip.new(root, {}),
      }))
      yAxis.data.setAll(lanes.map((l) => ({ lane: l === '__findings__' ? FINDINGS_LANE : PHASE_LABEL[l] })))

      const xAxis = chart.xAxes.push(am5xy.DateAxis.new(root, {
        baseInterval: { timeUnit: 'minute', count: 1 },
        renderer: xRenderer,
        tooltip: am5.Tooltip.new(root, {}),
      }))

      // ── Tarefas: marcos reais (ferramenta + achado), uma barra por marco na raia da fase ──
      const taskSeries = chart.series.push(am5timeline.CurveColumnSeries.new(root, {
        name: 'Ações do agente',
        xAxis, yAxis,
        categoryYField: 'lane',
        openValueXField: 'start',
        valueXField: 'end',
        tooltip: am5.Tooltip.new(root, {
          labelText: '[bold]{source}[/] · {lane}\n{taskLabel}',
        }),
      }))
      taskSeries.columns.template.setAll({ height: am5.percent(50), cornerRadiusTL: 4, cornerRadiusTR: 4, cornerRadiusBL: 4, cornerRadiusBR: 4 })
      taskSeries.columns.template.adapters.add('fill', (fill: any, target: any) => {
        const lane = target.dataItem?.dataContext?.lane
        const idx = lanes.indexOf(PHASE_ORDER.find((p) => PHASE_LABEL[p] === lane) || '')
        return idx >= 0 ? chart.get('colors').getIndex(idx) : fill
      })
      taskSeries.columns.template.states.create('hover', { fillOpacity: 0.8 })

      const taskData = milestones.map((m) => {
        const phase = normalizePhase(m.phase || '')
        const start = m.ts as number
        return {
          lane: PHASE_LABEL[phase] || phase,
          start,
          end: start + 5 * 60 * 1000, // marco é instantâneo; largura nominal só p/ visibilidade da barra
          source: m.source || m.kind || '—',
          taskLabel: m.label || '',
        }
      })
      taskSeries.data.setAll(taskData)

      taskSeries.bullets.push(() => am5.Bullet.new(root, {
        locationX: 0,
        sprite: am5.Circle.new(root, { radius: 4, fill: am5.color(0xffffff), fillOpacity: 0.9 }),
      }))
      taskSeries.bullets.push(() => am5.Bullet.new(root, {
        locationX: 1,
        sprite: am5.Circle.new(root, { radius: 4, fill: am5.color(0xffffff), fillOpacity: 0.9 }),
      }))

      // ── Achados: um marco-bandeira por finding, colorido por severidade ──
      if (findingsWithDate.length) {
        const findingSeries = chart.series.push(am5timeline.CurveLineSeries.new(root, {
          name: 'Achados',
          xAxis, yAxis,
          categoryYField: 'lane',
          valueXField: 'date',
          tooltip: am5.Tooltip.new(root, { labelText: '[bold]{sev}[/]\n{title}' }),
        }))
        findingSeries.strokes.template.set('forceHidden', true)
        findingSeries.set('snapTooltip', true)

        findingSeries.data.setAll(findingsWithDate.map((f) => ({
          lane: FINDINGS_LANE,
          date: new Date(f.firstSeen as string).getTime(),
          title: f.title,
          sev: f.severity.toUpperCase(),
          color: SEV_COLOR[f.severity] || SEV_COLOR.info,
        })))

        findingSeries.bullets.push((_root: any, _series: any, dataItem: any) => {
          const dc = dataItem.dataContext
          const flagContainer = am5.Container.new(root, {})
          flagContainer.children.push(am5.Triangle.new(root, {
            width: 12, height: 12, rotation: 180,
            fill: am5.color(parseInt(String(dc.color).replace('#', ''), 16)),
            centerX: am5.percent(50), centerY: am5.percent(100),
          }))
          flagContainer.children.push(am5.Label.new(root, {
            text: dc.sev.slice(0, 1),
            fontSize: 9, fontWeight: '700', fill: am5.color(0x0a0a12),
            centerX: am5.percent(50), centerY: am5.percent(100), dy: -3,
            populateText: true,
          }))
          return am5.Bullet.new(root, { sprite: flagContainer })
        })
      }

      chart.set('scrollbarX', am5.Scrollbar.new(root, { orientation: 'horizontal' }))
      const cursor = chart.set('cursor', am5timeline.CurveCursor.new(root, { xAxis, behavior: 'zoomX' }))
      cursor.lineY.set('forceHidden', true)

      const legend = chart.children.push(am5.Legend.new(root, {
        centerX: am5.percent(50), x: am5.percent(50), layout: root.horizontalLayout,
      }))
      legend.data.setAll(chart.series.values)

      taskSeries.appear(1000)
      chart.appear(1200, 100)
    })()

    return () => {
      disposed = true
      root?.dispose()
    }
  }, [open, milestones, findings])

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.95rem 1.25rem', cursor: 'pointer' }}
      >
        {open ? <ChevronDown size={16} color="var(--text-mute)" /> : <ChevronRight size={16} color="var(--text-mute)" />}
        <Waypoints size={16} color="var(--purple-light)" />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>Linha do tempo (protótipo)</span>
        <span style={{ fontSize: 11, color: 'var(--text-mute)', fontFamily: 'var(--mono)' }}>
          ações do agente + achados, por fase
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dim)' }}>amCharts 5</span>
      </div>
      {open && (
        milestones !== null && milestones.length === 0 && !findings.some((f) => f.firstSeen) ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-mute)', fontSize: 12.5 }}>
            Sem marcos ou achados com data para desenhar a linha do tempo ainda.
          </div>
        ) : (
          <div ref={chartDivRef} style={{ width: '100%', height: 780 }} />
        )
      )}
    </div>
  )
}
