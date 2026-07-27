# Handoff: RIFT — Tela de Login (v6, split + radar orbital)

## Overview
Nova tela de login da **RIFT — AI Pentest Platform**. Layout em duas colunas: à esquerda uma **visualização animada em Canvas** ("radar orbital") que ocupa o máximo do espaço e comunica a ideia de agentes de IA trabalhando continuamente; à direita um **painel de login limpo**. É a tela de entrada da plataforma — substitui o login atual mudando prioritariamente a camada visual, preservando a lógica de autenticação existente.

## About the Design Files
Os arquivos deste bundle são **referências de design feitas em HTML/React (via Babel no browser)** — protótipos que mostram aparência e comportamento pretendidos, **não código de produção para copiar direto**. A tarefa é **recriar este design no ambiente do codebase alvo** (React/TypeScript, Vue, etc.), usando os padrões, componentes e bibliotecas já estabelecidos ali. Preserve a autenticação e integrações existentes; troque apenas a camada visual e adicione os novos componentes de visualização.

## Fidelity
**High-fidelity (hifi).** Cores, tipografia, espaçamentos, raios, sombras e a animação estão definidos. Recriar fielmente. A animação do Canvas é a peça mais complexa — a Seção "Visualização (RadarStage)" traz o algoritmo completo.

## Screens / Views

### Tela única — Login
- **Purpose**: usuário autentica para entrar na plataforma.
- **Layout**: `display:flex`, altura `100vh`, `overflow:hidden`.
  - **Esquerda** `.stage`: `flex:1` (ocupa todo o espaço restante). `position:relative`, `overflow:hidden`, fundo `#05050d`. Contém o `<canvas>` full-bleed (`position:absolute; inset:0`), uma vinheta radial, o brandmark (topo-esq), a legenda curta e o chip de status (rodapé-esq).
  - **Direita** `.side`: largura fixa **480px**, `flex-shrink:0`, coluna centralizada verticalmente (`display:flex; flex-direction:column; justify-content:center`), `padding:2.5rem 3.4rem`, fundo `linear-gradient(180deg,#08060f,#06050c)`, `border-left:1px solid rgba(139,92,246,0.14)`, sombra `-30px 0 80px rgba(0,0,0,0.5)`. Uma linha vertical de glow (`::before`, gradiente roxo vertical) na borda esquerda. Conteúdo em `.inner` (`max-width:360px`, centralizado), com entrada `fadeUp .6s`.

#### Componentes — coluna esquerda (`.stage`)
- **Brandmark** `.vbrand` (top:2rem, left:2.2rem): ícone crosshair (roxo `#a78bfa`, 26px) + wordmark "RiFT" (Space Grotesk 700, 1.35rem, o "i" em `#a78bfa`) + divisor 1px + "AI PENTEST PLATFORM" (0.62rem, `letter-spacing:.3em`, `#71717a`).
- **Legenda** `.vcap` (left:2.2rem, bottom:3.6rem, max-width:340px): "Pentest contínuo por **agentes de IA**." — Space Grotesk 500, 1.05rem, line-height 1.35; "agentes de IA" em `#a78bfa`.
- **Chip status** `.statuschip` (left:2.2rem, bottom:1.8rem): ponto verde 7px (`#22c55e`, glow, pulsa) + "SISTEMA OPERACIONAL · ONLINE" (0.66rem, letter-spacing .2em, `#71717a`).
- **Vinheta** `.stage-vig`: `radial-gradient(120% 120% at 50% 50%, transparent 55%, rgba(5,5,13,0.7) 100%)`.

#### Componentes — coluna direita (`.side`)
- **Logo**: crosshair (34px, `#a78bfa`) + "RIFT" (Space Grotesk 700, 1.7rem, gradiente de texto `linear-gradient(120deg,#c4b5fd,#a78bfa 50%,#7c3aed)`). `margin-bottom:2rem`.
- **Título** `h2`: "Bem-vindo de volta" — Space Grotesk 600, 1.55rem, `#f5f5f5`, letter-spacing -.01em.
- **Subtítulo** `.sub`: "Faça login para continuar sua jornada." — 0.88rem, `#71717a`. `margin-bottom:1.8rem`.
- **Campo Email** `.field`: ícone envelope à esquerda (1rem, `#52525b`). Input altura **52px**, `padding:0 2.8rem`, `border-radius:.7rem`, fundo `rgba(6,6,16,0.65)`, borda `1px solid rgba(139,92,246,0.16)`, texto `#e5e7eb` 0.9rem (JetBrains Mono), placeholder `#52525b` "Email ou nome de usuário". **Focus**: borda `rgba(124,58,237,0.65)`, fundo `rgba(9,8,22,0.85)`, `box-shadow:0 0 0 3px rgba(124,58,237,0.12)`.
- **Campo Senha**: ícone cadeado à esquerda; botão olho (`.eye`) à direita (`#52525b`, hover `#a78bfa`) alterna `type` password/text. Placeholder "Senha".
- **Linha** `.rowline` (margin .4rem 0 1.5rem, font 0.82rem): checkbox custom "Lembrar de mim" (box 18px, `border-radius:6px`; marcado = fundo `#7c3aed` + check branco) — default marcado. À direita link "Esqueceu sua senha?" (`#a78bfa`).
- **Botão primário** `.btn`: largura 100%, altura **54px**, `border-radius:.75rem`, texto branco Space Grotesk 600 0.98rem, "Entrar na plataforma →". Fundo `linear-gradient(100deg,#6d28d9,#7c3aed 45%,#9563e8)`, `box-shadow:0 12px 32px rgba(124,58,237,0.42), inset 0 1px 0 rgba(255,255,255,0.15)`. **Hover**: `filter:brightness(1.08)`, sombra mais forte, seta desliza `translateX(4px)`. **Active**: `translateY(1px)`.
- **Divisor** `.or`: "ou continue com" (0.78rem, `#52525b`) entre duas linhas 1px `rgba(139,92,246,0.15)`. Margin 1.6rem 0 1.2rem.
- **Sociais** `.socials`: grid 3 colunas, gap .7rem. Cada `.soc`: altura 52px, `border-radius:.7rem`, fundo `rgba(6,6,16,0.6)`, borda `rgba(139,92,246,0.15)`, hover borda `rgba(124,58,237,0.5)` + fundo `rgba(124,58,237,0.08)`. Ícones: GitHub (monocromático), Google (colorido), Microsoft (4 quadrados coloridos).
- **Criar conta** `.createacc` (margin-top 1.7rem, 0.85rem, `#71717a`): "Novo por aqui? **Criar uma conta**" (link roxo).
- **Nota segurança** `.secure` (margin-top 1.8rem, 0.72rem, `#52525b`): ícone escudo + "Seus dados estão protegidos com segurança avançada".

## Visualização (RadarStage) — Canvas + requestAnimationFrame
Peça central. É um `<canvas>` full-bleed, redimensionado para `clientWidth/Height` com `DPR = min(devicePixelRatio, 2)` (`ctx.setTransform(DPR,0,0,DPR,0,0)`). Centro `cx=W/2, cy=H/2`; escala `S=min(W,H)`; raio base `R=S*0.44`. Cada frame limpa, pinta o fundo, e desenha (a maior parte com `globalCompositeOperation='lighter'` para glow aditivo):

1. **Glow central**: radial roxo `rgba(124,58,237,0.16)`→transparente, raio `R*1.25`.
2. **Starfield**: 40 estrelas fixas (posições aleatórias), alpha piscando por `sin(t*tw+ph)`.
3. **Partículas**: 46 pontos orbitando frouxamente o centro (raio 0.2R–1.3R), avançam em ângulo devagar.
4. **Anéis concêntricos**: raios `R*[1, 0.68, 0.4, 0.2]`, alpha decrescente. Mais 2 anéis **tracejados girando** (raios 0.86R e 0.54R) em sentidos opostos (`rotate(t*0.12)` e `rotate(-t*0.2)`).
5. **Varredura de radar (sweep)**: ângulo `sweep=t*0.5`. Leque de 32 linhas do centro à borda, `ang=sweep-k*0.022`, alpha decrescente (rastro). Linha líder brilhante em `sweep`.
6. **Pulsos**: 2 círculos expandindo do centro, período ~4.5s, alpha `(1-e)*0.4`.
7. **Órbitas + agentes**: 4 órbitas elípticas 3D. Cada órbita `{rxF, ryF, tilt, sp, n, col, beam}` — raios como fração de R, `tilt` = rotação da elipse, `sp` = velocidade angular, `n` = nº de agentes, `col` = RGB, `beam` = emite feixe ao núcleo. Projeção: ponto local `(rxF*R*cos θ, ryF*R*sin θ)` rotacionado por `tilt` e transladado ao centro. `depth = 0.5+0.5*sin θ` (frente/trás) controla tamanho e alpha. Cada agente: rastro de 8 pontos (θ − k*0.05), glow radial + ponto branco no núcleo. Agente líder de órbitas `beam:true` traça linha em gradiente até o centro, pulsando. Dois agentes usam cores de destaque: verde `[34,197,94]` e âmbar `[245,158,11]`.
   - Config usada: `[{rxF:1.00,ryF:0.34,tilt:-0.36,sp:0.13,n:2,beam:true},{rxF:0.70,ryF:0.70,tilt:0,sp:-0.19,n:3},{rxF:0.52,ryF:0.90,tilt:0.62,sp:0.26,n:2,beam:true},{rxF:0.86,ryF:0.58,tilt:2.4,sp:-0.11,n:2}]`.
8. **Crosshair central (marca RIFT)**: anel tracejado girando (`rotate(t*0.3)`, raio 0.13R); 4 braços de cruz em gradiente saindo do centro (gap 0.05R → 0.2R); 4 cantos em colchete (bracket) ao redor de um box 0.115R; núcleo pulsante (glow radial + ponto roxo 3.2px), pulso `0.6+0.4*sin(t*2)`.

**Performance / acessibilidade**: usar `requestAnimationFrame` + `useRef` (nunca setState por frame). Respeitar `prefers-reduced-motion: reduce` → renderizar **um** frame estático (no protótipo, `t=6` fixo, sem loop). Reanexar no `resize`. Cuidado: garantir `t = max(0, (now-t0)/1000)` para o primeiro frame do rAF não ficar negativo.

## Interactions & Behavior
- Toggle de senha (olho) mostra/oculta.
- Checkbox "Lembrar de mim" controlado (default: ativo).
- `onSubmit` faz `preventDefault` no protótipo — **ligar à autenticação real** no codebase.
- Botões sociais são `<a>` placeholders — ligar aos provedores reais (GitHub, Google, Microsoft SSO).
- Hovers: botão primário (brilho + seta desliza), sociais (borda/fundo roxo), links (roxo→roxo-claro), olho.
- Entrada: `.inner` faz `fadeUp .6s`; ponto de status pulsa (2.4s).

## Responsive
- **≤ 900px**: `#app` vira `flex-direction:column`. `.stage` vira faixa no topo (`height:34vh`, `min-height:220px`), `.side` ocupa o resto (`width:100%; flex:1`), borda superior no lugar da lateral. A animação é reduzida (menor área); em `prefers-reduced-motion` fica estática.

## State Management
- `show` (bool) — visibilidade da senha.
- `remember` (bool, default true).
- `email`, `pass` (strings controladas).
- Canvas gerencia seu próprio estado imperativo em refs (t0, arrays de estrelas/partículas/órbitas, id do rAF). Nada disso deve virar state do React.

## Design Tokens
- **Fundo**: `#05050d` (principal), `#08060f`/`#06050c` (painel).
- **Roxos**: `#6d28d9`, `#7c3aed` (primário), `#8b5cf6`, `#a78bfa` (claro), `#c084fc` (glow), `#c4b5fd`.
- **Texto**: `#f5f5f5`, `#e5e7eb`, `#a1a1aa`, `#71717a`, `#52525b`.
- **Status**: online `#22c55e`; warning `#f59e0b`; critical `#ef4444`.
- **Bordas/linhas**: `rgba(139,92,246,0.14–0.16)`.
- **Raios**: inputs/sociais `.7rem`, botão `.75rem`, checkbox `6px`.
- **Sombras**: painel `-30px 0 80px rgba(0,0,0,0.5)`; botão `0 12px 32px rgba(124,58,237,0.42)`.
- **Tipografia**: display **Space Grotesk** (400–700) — logos, título, botão, legenda; mono **JetBrains Mono** (300–600) — inputs, labels, chips, corpo.

## Assets
- Nenhuma imagem externa. Todos os ícones são **SVG inline** (crosshair, mail, lock, eye/eye-off, check, shield, GitHub, Google, Microsoft). O `favicon.svg` do projeto é o crosshair.
- Fontes via Google Fonts (Space Grotesk, JetBrains Mono).

## Files
- `Login Page v6.html` — protótipo desta tela (layout split + RadarStage + login). **É a referência principal.**
- (Versões anteriores no projeto, para contexto/comparação: `Login Page v5.html` = variante "flywheel" com herói/cards/stats.)
