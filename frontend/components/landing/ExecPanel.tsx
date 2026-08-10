'use client'
import { SEV_COLOR } from '@/lib/severity'

/**
 * Ilustração do painel de execução — o que o operador vê enquanto a varredura
 * roda. Não é um print: é a mesma linguagem visual do produto redesenhada em
 * HTML, para acompanhar o tom escolhido e ficar nítida em qualquer tela.
 *
 * Os dados são de exemplo. As SEVERIDADES vêm de `lib/severity.ts`, a mesma
 * fonte que o app usa — se a escala mudar lá, esta ilustração muda junto em vez
 * de virar uma mentira colorida.
 */

const PHASES = [
  { n: 'recon', pct: 100, s: 'ok' },
  { n: 'enum', pct: 62, s: 'rodando' },
  { n: 'vuln', pct: 8, s: 'fila' },
]

const FINDS = [
  { t: 'Diretório .git/ acessível', sev: 'critical', label: 'Crítica' },
  { t: 'Swagger UI sem autenticação', sev: 'high', label: 'Alta' },
  { t: 'CORS com wildcard', sev: 'medium', label: 'Média' },
]

export function ExecPanel() {
  return (
    <div className="panel" aria-label="Exemplo do painel de execução">
      <div className="panel-hd">
        <span className="panel-dot" />
        <span className="panel-host">sispag-fornecedor.com.br</span>
        <span className="panel-st">varredura ativa</span>
      </div>

      <div className="panel-kpis">
        <div className="panel-kpi"><b>47</b><span>ativos</span></div>
        <div className="panel-kpi"><b>29</b><span>vivos</span></div>
        <div className="panel-kpi"><b>14</b><span>exposições</span></div>
      </div>

      <div className="panel-sec">Fases</div>
      <div className="phases">
        {PHASES.map((p) => (
          <div className="phase" key={p.n} data-s={p.s}>
            <span>{p.n}</span>
            <span className="phase-bar"><i style={{ width: `${p.pct}%` }} /></span>
            <span className="phase-s">{p.s}</span>
          </div>
        ))}
      </div>

      <div className="panel-finds">
        {FINDS.map((f) => {
          const c = SEV_COLOR[f.sev]
          return (
            <div className="find" key={f.t}>
              <span className="find-sev" style={{ background: c }} />
              <span className="find-t">{f.t}</span>
              <span
                className="find-b"
                style={{
                  color: c,
                  background: `color-mix(in srgb, ${c} 13%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${c} 32%, transparent)`,
                }}
              >
                {f.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
