# Rift Design System — como construir com estes componentes

Design system **dark-first** do Rift (plataforma de pentest com IA). Componentes são
funções React autossuficientes que estilizam via **estilo inline + CSS custom properties**
(tokens em `:root`). Não há utility-classes, não há CSS-in-JS, não há provider/wrapper a
montar — basta o `styles.css` do DS estar carregado (o ambiente já o injeta).

## Regra que mais importa: fundo escuro
Os tokens de texto são claros (para superfície escura). **Coloque os componentes sobre
`var(--bg)` ou `var(--surface)`** — sobre fundo claro o texto e os números grandes (score,
total do donut) somem. Um cartão idiomático é:
`background: var(--surface); border: 1px solid var(--border); border-radius: 12px`.

## Idioma de estilo: CSS variables (nomes reais)
Estilize seu próprio layout com `var(--*)`; passe cores aos componentes pelas **props de
cor** (aceitam qualquer cor CSS — prefira os tokens abaixo a hex solto).

- **Superfícies:** `--bg` (#0A0A12, fundo), `--surface`, `--surface2`, `--raised`, `--panel`
- **Bordas:** `--border`, `--border-mid`, `--border-hi`
- **Acento (roxo, a marca):** `--purple` (#7C3AED), `--purple-light`, `--purple-dark`, `--purple-dim`, `--purple-glow`, `--purple-glow-strong`
- **Severidade (use nos gráficos):** `--critical` (#F04452), `--high` (#F5892E), `--medium` (#EAB308), `--low` (#22C55E), `--info` (#3B82F6)
- **Texto:** `--text` (quase branco), `--muted`, `--text-mute`, `--text-dim`
- **Fonte mono (números/IPs):** `--mono`

## Componentes (todos data-driven, estilo via props — sem className)
- **`Donut`** — rosca com total no centro. `data: {key,label,value,color}[]`, opcionais `size`, `thickness`, `total`, `caption`, `activeKey` (fatia em destaque).
- **`HBars`** — barras horizontais (ranking). `data: {label,value,color?}[]`, opcionais `max`, `unit`, `showVal`. Sem `color`, a barra usa `var(--purple)`.
- **`ScoreSlider`** — medidor 0–100 com trilha gradiente crítico→baixo fixa. Props `value`, `color` (do nível atual), opcionais `max`, `label` (pílula).
- **`SI`** — wrapper de ícone SVG (`{s,c,sw,children}`); exportado no bundle, sem card de preview.

## Onde está a verdade
- Tokens: o `styles.css` do DS e seu `@import "./_ds_bundle.css"` (o bloco `:root`).
- Uso por componente: `components/charts/<Nome>/<Nome>.prompt.md`.

## Exemplo idiomático
```tsx
import { Donut } from '@rift/frontend'

<div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', gap: 16, alignItems: 'center' }}>
  <Donut
    caption="findings"
    data={[
      { key: 'critical', label: 'Crítico', value: 2, color: 'var(--critical)' },
      { key: 'high',     label: 'Alto',    value: 5, color: 'var(--high)' },
      { key: 'medium',   label: 'Médio',   value: 9, color: 'var(--medium)' },
      { key: 'low',      label: 'Baixo',   value: 14, color: 'var(--low)' },
    ]}
  />
</div>
```
