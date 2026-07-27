# Handoff: Rift — Reformulação Visual (AI Pentest Platform)

## Overview
Rift é uma plataforma de pentest/ASM assistida por IA. Este pacote é a **reformulação visual completa** da aplicação: um sistema de design escuro ("dark cyber") organizado, com hierarquia forte, respiro e cor usada apenas com significado (severidade e status). Cobre Login, Dashboard, detalhe do Engagement (Execução/Findings/Relatório), Domínios (lista + detalhe), Mapa de Superfície, e telas auxiliares (Findings global, Vazamentos, Relatórios, Usuários, Admin).

## About the Design Files
Os arquivos deste bundle são **referências de design feitas em HTML/React (via Babel no navegador)** — protótipos que mostram a aparência e o comportamento pretendidos, **não** código de produção para copiar diretamente. A tarefa é **recriar estas telas no ambiente do codebase real do Rift** (React/Vue/etc.), usando os padrões, componentes e bibliotecas já estabelecidos no projeto. Se ainda não houver um design system no codebase, use estes tokens como base.

## Fidelity
**Alta fidelidade (hi-fi).** Cores, tipografia, espaçamentos e interações são finais. Recrie a UI fielmente usando as bibliotecas/padrões do codebase. Os dados exibidos são fictícios (baseados em screenshots reais do app) e servem só para ilustrar layout — substitua pelos dados reais.

---

## Design Tokens

### Cores — base
| Token | Hex | Uso |
|---|---|---|
| bg | `#0A0A12` | fundo da aplicação |
| panel | `#0B0B13` | sidebar / topbar |
| surface | `#111119` | cards |
| surface2 | `#16161F` | hover / elevado |
| raised | `#1A1A24` | elementos elevados |
| line | `rgba(140,120,225,0.09)` | borda sutil |
| line2 | `rgba(140,120,225,0.18)` | borda média |
| line3 | `rgba(140,120,225,0.30)` | borda forte |

### Cores — marca (roxo)
| Token | Hex |
|---|---|
| purple | `#7C3AED` |
| purpleL | `#A78BFA` |
| purpleD | `#6D28D9` |
| purpleDim | `rgba(124,58,237,0.10)` |
| purpleGlow | `rgba(124,58,237,0.35)` |

### Cores — texto
| Token | Hex |
|---|---|
| text | `#EBEDF4` (primário) |
| textSub | `#A6ACC0` (secundário) |
| textDim | `#71768C` (labels/meta) |
| textFaint | `#4A4F66` (muito sutil) |

### Cores — severidade / estado (cor de dado)
| Token | Hex |
|---|---|
| critical / red | `#F04452` |
| high / orange | `#F5892E` |
| medium / yellow | `#EAB308` |
| low / green | `#22C55E` |
| info / blue | `#3B82F6` |

> Helper `tint(hex, alpha)` gera versões translúcidas (ex.: fundo/borda de badges = `tint(cor, 0.12)` / `tint(cor, 0.30)`).

### Tipografia
- **Sans (UI):** `'Space Grotesk', sans-serif` — títulos, labels, corpo.
- **Mono (dados):** `'JetBrains Mono', monospace` — números, IPs, CVEs, domínios, timestamps, tags técnicas.
- Escala: h1 página 24px/700; título de card 15–16px/600; corpo 13–13.5px; label/meta 10.5–12px; valores KPI 30–34px/700 (mono); letter-spacing 0.1–0.14em em labels uppercase.

### Espaçamento & forma
- Raio: cards 12px; botões/inputs 8–9px; pills 99px; ícones-container 9–11px.
- Gap entre cards: 14–16px. Padding de card: 1.1–1.6rem. Container central: `max-width:1320px`, padding `26px 32px 60px`.
- Grid de fundo sutil (44×44px, roxo a ~2% de opacidade).
- Scrollbar 8px, thumb `rgba(124,58,237,0.22)`.

### Sombras / brilho
- Card hover: `0 8px 30px rgba(0,0,0,0.35)` + `translateY(-1px)`.
- Botão primário: `0 0 20px rgba(124,58,237,0.35)`.
- Pontos/nós ativos: `drop-shadow(0 0 8px tint(cor,0.7))`.

---

## Screens / Views

### 1. Login
- **Propósito:** autenticação (SSO Microsoft + local).
- **Layout:** tela cheia, fundo com grid + radar animado à direita (anéis concêntricos + varredura cônica `radarSweep 4s linear infinite` + nós de rede com labels). Card de auth (~400px) à esquerda; painéis de status (SISTEMA OPERACIONAL, THREAT LEVEL) à direita. Faixa superior com marca RIFT · versão · SECURE.
- **Card auth:** header estilo terminal (3 dots + "RIFT-AUTH · TLS 1.3" + SECURE), logo+"Rift", "Bem-vindo de volta", `// autenticação local`, botão SSO (comando `$ auth --provider microsoft --sso` + quadradinhos coloridos MS), divisor "local access", campos IDENT e AUTH-KEY (com olho), botão gradiente "RUN AUTHENTICATE", rodapé "Acesso restrito e monitorado" + selo VERIFICADO.
- **Interação:** RUN AUTHENTICATE → entra na app (Dashboard).

### 2. Dashboard
- **Layout (2 colunas em cima):**
  - **Panorama de risco** (1.35fr): **Donut** interativo de severidade (total no centro = 103 "findings") + legenda com contagem/percentual; hover realça segmento.
  - **Findings ao longo do tempo** (1fr): valor grande (103) + delta "+13% 30d" + **gráfico de área** com gradiente e **projeção tracejada** nos últimos pontos.
- **KPIs (4 cards):** Engagements 19 (roxo) · Críticos 4 (red) · Altos 14 (orange) · Total de findings 103 (blue). Cada card: ícone em quadrado colorido, valor mono grande, label, sub; borda de acento à esquerda.
- **Precisam de ação:** lista dos top engagements com findings>0 — dot colorido, nome+domínio, **barra de severidade empilhada** (StackBar), status pill, contagem, chevron. Clique abre o engagement.
- **Todos os engagements:** chips de filtro (Todos + por engagement, com dot+contagem) e grid de 4 col de EngCards (nome, status pill, domínio mono, "Findings" + número colorido, barra de progresso, pill "idle" + data).
- **Cor da contagem de findings:** ≥15 red · ≥8 orange · ≥4 yellow · ≥1 green · 0 dim.

### 3. Engagement — detalhe
- **Header:** botão voltar + nome + domínio (mono); à direita seletores (Web/API (externo), v2 consolidado (padrão), Sonnet 5), botão Agendar, indicador "conectado" (wifi verde).
- **Abas:** Execução · Findings · Relatório (borda inferior roxa na ativa).

**Aba Execução:**
- **Card resumo:** eyebrow "MAPEAMENTO EXTERNO · AGENTE 1 · BLACK-BOX", nome, domínio; stats à direita: 4 Achados, 13 Superfície, $19.48 Custo (verde), 7:49 Duração, status pill.
- **Card de retomada** (acento roxo): check verde + "Recon e enumeração concluídos" + descrição + botões Continuar testes (primário) / Gerar relatório (soft) / Começar do zero (ghost).
- **Pipeline de execução (vertical):** trilho vertical com nós de fase (Recon ✓, Enumeração ●ativo, Vulnerabilidades, Exploração, Relatório). Cada fase: nó colorido por estado (done=verde/active=roxo/pending=dim), título + badge de estado + "N marcos" + ferramentas (mono à direita) + subtítulo; sob fases done/active, grid 2-col de **marcos** (ícone, texto, ferramenta, timestamp).

**Aba Findings:**
- **Achados confirmados:** título + badges (1 HIGH, 3 MEDIUM); grid 2-col de cards com acento de severidade à esquerda, SevBadge + check verde, título (2 linhas), descrição (clamp 2 linhas).
- **Mapa de superfície:** título + "13 observações" + descrição; lista de observações (dot azul/amarelo + texto + tag INFORMATIVO/PROVÁVEL).
- **Atividade do agente:** card colapsável (40 eventos).
- **Histórico de runs:** cards com kind (CHAT), status, finds/custo/duração/data (mono), e trilha de fases (Recon→Report com dots verdes/dim).

**Aba Relatório:** estado de geração (ícone, título, descrição, botão Gerar relatório).

### 4. Domínios — lista
- **Header:** ícone globe + "Domínios" + subtítulo ASM.
- **KPIs (3):** 8 Domínios · 0 Em risco alto/crítico · 0 Credenciais vazadas.
- **Barra de adicionar:** input "fornecedor.com" (mono) + dropdown tipo (Fornecedor) + botão Adicionar (primário).
- **Grid 3-col de DomainCards:** nome + domínio mono; **score grande colorido** + "SEGURANÇA"; tags (Parceiro/Fornecedor/Interno + autorizado); MiniStats ATIVOS/VIVOS/EXPOSIÇÕES; "último: data" + botão Escanear (soft). Clique abre detalhe.
- **Cor do score:** ≥40 orange · ≥15 yellow · ≥5 green · <5 verde forte. Label: ≥40 MEDIUM · ≥15 LOW · resto BAIXO.

### 5. Domínio — detalhe
- **Header:** voltar + globe + nome; "domínio · tipo"; à direita Ver no mapa / Escanear / excluir (lixeira vermelha).
- **Score (2-col):**
  - **Score de segurança:** **ScoreSlider** horizontal (track gradiente red→green + knob branco na posição) + valor 40px + badge do nível; abaixo, stats ATIVOS/VIVOS/EXPOSIÇÕES.
  - **Composição do score:** **HBars** (Painéis de login +30, Hosts vivos +15, Headers ausentes 0, Credenciais 0) em pts.
- **Banners (2-col):** "Domínio autorizado" (acento verde, shield-check, botão Revogar) + "Exposição de credenciais" (key, chevron).
- **Superfície (tabela):** cabeçalho HOST · IP · STACK · STATUS; linhas com host mono (+título opcional), IP mono, tags de tecnologia (máx 3 + "+N"), código de status verde + dot. Toggle "só vivos".

### 6. Mapa de Superfície
- **Header:** share + "Mapa de Superfície" + subtítulo; à direita seletor de domínio + refresh.
- **Filtros:** pills (Domínios 1, Subdomínios 95, IPs 52, Tecnologias 62, Servidores 8) + busca de nó.
- **Grafo (flex):** SVG radial — nó raiz central (anchieta.br) + nós satélite (subdomínio=roxo, IP=azul, tecnologia=cinza) ligados por linhas; hover/seleção realça o nó e suas arestas; labels só em nós grandes/hover/raiz. Legenda flutuante (blur) no canto. Fundo com glow radial roxo.
- **Painel de detalhe (300px):** ao clicar num nó — badge de tipo + label mono + "Conectado a …" + tabela de atributos contextuais (por tipo: status/IP/stack/TLS/vulns; ASN/portas/hosts; CVEs; contagens) + botão "Ver findings". Estado vazio com ícone e instrução.

### 7. Telas auxiliares
- **Findings (global):** lista de todos os achados; filtros por severidade (pills com contagem); cards com acento de severidade, SevBadge, título, tag do engagement, data, chevron.
- **Vazamentos:** 3 KPIs + estado vazio (ícone, título, descrição, botão Iniciar busca).
- **Relatórios:** lista de relatórios gerados (ícone, nome, engagement · findings, status pill, data, botão Abrir).
- **Usuários:** tabela (avatar iniciais colorido por papel, nome+email, papel/tag, último acesso, chevron) + botão Convidar.
- **Admin:** 3 cards de grupos de config (Agentes de IA, Escopo & permissões, Integrações) com listas de itens.

---

## Componentes reutilizáveis (em `riftx-core.jsx` e `riftx-charts.jsx`)
- **Ico / IC** — wrapper SVG + conjunto de ícones (stroke, currentColor).
- **SevBadge** — badge de severidade (dot + label mono, cor por severidade).
- **Tag** — pill mono (contorno ou preenchida com `tint`).
- **StatusPill** — status com dot (Concluído/Parado/Rodando/idle/autorizado).
- **Card** — container com borda, hover opcional (elevação + sombra), acento lateral opcional.
- **StatCard** — KPI (ícone em quadrado colorido + valor mono + label + sub + acento).
- **Btn** — variantes: primary / soft / ghost / danger; tamanhos sm/md; ícone opcional.
- **SectionHead / PageHead** — cabeçalhos de seção e de página.
- **Sidebar / TopBar / Shell** — navegação recolhível + topbar com breadcrumbs + moldura da app.
- **Charts:** `Donut`, `Gauge` (semicírculo), `ScoreSlider` (red→green horizontal), `HBars`, `Trend` (área + projeção tracejada via `projFrom`), `StackBar` (severidade empilhada).

## Interactions & Behavior
- **Navegação:** estado `page` + `eng`/`dom` selecionados (SPA em memória; sem rota real). Sidebar troca de página; cards abrem detalhe; voltar limpa a seleção.
- **Hover:** cards elevam (translateY + sombra); linhas/nós do grafo realçam.
- **Donut/legenda:** hover sincronizado realça segmento.
- **Filtros:** chips/pills alternam o conjunto exibido (client-side).
- **Sidebar:** recolhível (62px ↔ 232px), transição 0.22s.
- **Animações:** `fadeIn` no conteúdo; `radarSweep` no login.

## State Management (sugerido no codebase)
- Rota/página ativa; engagement e domínio selecionados; estado de sidebar recolhida.
- Dados: engagements, findings (por severidade), domínios (score/superfície), nós do grafo. Substituir mocks por fetch real.
- Estados de UI: loading de scan, run em progresso (pipeline), toggles (só vivos, real-time).

## Assets
- **Fontes:** Google Fonts — Space Grotesk (400–700) e JetBrains Mono (300–700).
- **Ícones:** SVG inline (conjunto próprio em `IC`, estilo stroke tipo Feather). Nenhuma dependência de biblioteca de ícones.
- **Sem imagens externas** — tudo é CSS/SVG.

## Files
- `Rift App.html` — shell + roteamento em memória (ponto de entrada).
- `riftx-core.jsx` — tokens, ícones, primitivos, Sidebar/TopBar/Shell.
- `riftx-charts.jsx` — Donut, Gauge, ScoreSlider, HBars, Trend, StackBar.
- `riftx-dashboard.jsx` — Dashboard + detalhe do Engagement (Execução/Findings/Relatório).
- `riftx-asm.jsx` — Domínios (lista + detalhe) + Mapa de Superfície.
- `riftx-extra.jsx` — Login + Findings/Vazamentos/Relatórios/Usuários/Admin.

> Referências de linguagem visual: ProjectDiscovery Neo (near-black, gráficos de área com projeção, score em slider, breakdown empilhado), XBOW e Pentest-Tools ("prova, não ruído" — o que precisa de ação vem primeiro).
