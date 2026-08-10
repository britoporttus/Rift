# design-sync — notas do repositório Rift

- **Rift é um app Next.js, não uma lib de design system.** `frontend/` é `@rift/frontend`
  (`private`, sem `main`/`module`/`exports`, sem `dist/` de componentes, sem Storybook).
  Sincronizado no shape `package` em **modo entry** (barrel + esbuild), não a partir de um dist.
- **Escopo sincronizado:** só o UI genuinamente reutilizável e autossuficiente — os 3 charts
  `Donut`, `HBars`, `ScoreSlider` (`frontend/components/ui/charts/`) + os tokens de
  `frontend/app/globals.css` (`:root`, 24 vars). Componentes de página (dominios, engagement,
  rede-interna, mapa…) são acoplados a dados/API/auth/WebSocket → fora de escopo (renderizam
  vazios isolados). Se um novo componente reutilizável surgir, adicione em `componentSrcMap`
  + no barrel + autore um preview.
- **`SI`** (wrapper de ícone SVG) fica **no bundle** (`window.RiftDS.SI`) mas SEM card de
  preview: a heurística de componente exige PascalCase e "SI" (tudo-maiúsculo) é classificado
  como não-componente. É esperado, não um erro.
- **Barrel de entrada:** o build usa `frontend/.ds-entry.tsx` (re-exporta os 3 componentes)
  como `--entry`, porque não há dist. Ele é **gitignored** (não polui o app). Numa clonagem
  nova, recrie antes do build:
  ```sh
  cat > frontend/.ds-entry.tsx <<'TSX'
  export { Donut } from './components/ui/charts/Donut'
  export { HBars } from './components/ui/charts/HBars'
  export { ScoreSlider } from './components/ui/charts/ScoreSlider'
  export { SI } from './components/ui/SI'
  TSX
  ```
  O walk-up do `--entry` precisa achar `frontend/package.json` (nome `@rift/frontend`), por
  isso o barrel fica DENTRO de `frontend/`. `componentSrcMap`/`cssEntry`/`tokensGlob` são
  relativos a `frontend/` (pkgRoot resolvido via walk-up do entry).
- **Comando do conversor** (a partir da raiz do repo; React resolve em `./node_modules`):
  ```sh
  node .ds-sync/package-build.mjs --config .design-sync/config.json \
    --node-modules ./node_modules --entry ./frontend/.ds-entry.tsx --out ./ds-bundle
  ```
  Re-sync (driver): trocar `package-build.mjs` por `resync.mjs` e acrescentar
  `--remote .design-sync/.cache/remote-sync.json` (buscar o `_ds_sync.json` do projeto antes).

## Known render warns (triados como legítimos)
- `[FONT_REMOTE] "Space Grotesk"` — a fonte da marca carrega por `@import` de font-host em
  runtime; não é empacotada. Esperado, não-bloqueante.

## Re-sync risks (o que pode envelhecer em silêncio)
- **Barrel gitignored:** some numa clonagem nova → recrie pelo heredoc acima antes do build.
- **DS é dark-first:** as convenções (`conventions.md`) dizem para usar os componentes sobre
  `var(--bg)`/`var(--surface)`; se a paleta de `globals.css` mudar de nome de token, revalidar
  o `conventions.md` (os nomes citados precisam existir em `_ds_bundle.css`).
- **Playwright/Chromium:** instalados em `~/.cache/ms-playwright/` (headless-shell build 1234)
  + `playwright` em `.ds-sync/node_modules`. Numa máquina nova, reinstalar para o render-check.
- **Novos componentes reutilizáveis:** se `components/ui/` ganhar peças novas, elas NÃO entram
  sozinhas — precisam de `componentSrcMap` + barrel + preview autorado.
