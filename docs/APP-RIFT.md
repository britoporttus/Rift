# Rift — Documentação da Aplicação (visual + features)

> Doc vivo. Inventário completo do que a aplicação Rift é hoje: telas, features,
> design system, componentes, dados e APIs. Objetivo: não perder nada sobre a app
> (especialmente com trabalho paralelo em andamento). Atualizado: 2026-07-07.
> Docs irmãos: [DIRECAO-PRODUTO.md](DIRECAO-PRODUTO.md), [ARQUITETURA-AGENTES.md](ARQUITETURA-AGENTES.md).

---

## 1. Visão geral e stack

Plataforma web que expõe o `pentest-framework-v2` (agente de IA sobre Claude Code)
por uma interface moderna. O backend spawna o `claude` e transmite o resultado ao
frontend por WebSocket.

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript. Estilo majoritariamente
  **inline** (`style={{}}`), poucas variáveis CSS globais. Servido em produção por
  `frontend/server.js` (Next custom server + proxy para o backend). PM2: `rift-frontend`.
- **Backend**: Node + Express + `ws` (WebSocket) + Mongoose (MongoDB). Auth JWT +
  SSO Microsoft. PM2: `rift-backend` (porta 3001).
- **Paleta/tema**: dark "operator/hacker HUD" — preto-azulado + roxo neon. Fonte UI
  `Space Grotesk`, dados/mono `JetBrains Mono`.

---

## 2. Mapa de rotas e telas

| Rota | Arquivo | Função | Estado visual |
|---|---|---|---|
| `/` | `app/page.tsx` | **só `redirect('/dashboard')`** — não há home real | ⚠️ inexistente |
| layout raiz | `app/layout.tsx` | HTML pt-BR, metadata, fontes, globals.css | ok |
| layout app | `app/(app)/layout.tsx` | shell autenticado: guarda de auth + Sidebar + TopBar + main | ok |
| `/dashboard` | `app/(app)/dashboard/page.tsx` | KPIs, distribuição de severidade, filtros, grid de engagements, criar escopo, apagar | 👍 bom (tem bug no delete) |
| `/findings` | `app/(app)/findings/page.tsx` | lista global de findings, filtro, export CSV | 🔧 cru |
| `/reports` | `app/(app)/reports/page.tsx` | accordion de relatórios por engagement + preview iframe | 🔧 cru |
| `/admin` | `app/(app)/admin/page.tsx` | métricas de infra (CPU/RAM/disco) + uso de tokens/custo | ok (não no handoff) |
| `/admin/users` | `app/(app)/admin/users/page.tsx` | CRUD de usuários | ok |
| `/engagement/[id]` | `app/(app)/engagement/[id]/page.tsx` | workspace: abas **Execução / Chat / Findings / Relatório** | 👍 Execução nova e polida |
| `/login` | `app/(auth)/login/page.tsx` | login "terminal HUD" + SSO Microsoft | 👍 estilizado |

---

## 3. Design system (visual)

`frontend/app/globals.css` (~94 linhas) só define variáveis + reset + scrollbar +
keyframes. **Todo o resto é inline** — cores frequentemente hard-coded/duplicadas.

**Paleta (`:root`):**
- Fundos: `--bg:#080810`, `--surface:rgba(4,4,12,0.97)`, `--panel:rgba(5,5,14,0.95)`
- Bordas roxas: `--border:rgba(124,58,237,0.13)`, `--border-mid:0.28`, `--border-hi:0.45`
- Roxo: `--purple:#7C3AED`, `--purple-light:#A78BFA`, `--purple-glow:rgba(124,58,237,0.15)`
- Severidades: `--critical:#EF4444`, `--high:#F59E0B`, `--medium:#EAB308`, `--low:#22C55E`, `--info:#3B82F6`
- Texto: `--text:#E2E8F0`, `--muted:#94A3B8`, `--text-mute:#3A3A58`, `--text-dim:#252545`

**Tipografia:** `Space Grotesk` (UI), `JetBrains Mono` (`--mono`, para números/domínios/código).

**Padrões repetidos (ainda NÃO extraídos como componentes):**
- Card: fundo surface, borda roxa fraca, raio 8px, padding ~1rem.
- Chip/pill: raio 99px, fundo `{cor}18`, borda `{cor}44`.
- Botão primário: roxo `#7C3AED`, `box-shadow:0 0 18px rgba(124,58,237,0.35)`.
- Botão ghost: transparente + borda roxa.
- Cada página redefine sua própria função de ícone SVG (`SI`/`Ico`) e constantes
  (`SEV_COLOR`, `SEVERITIES`, `inputStyle`) → **muita duplicação**.

**Dívida de design (a corrigir):** (1) sem biblioteca de componentes compartilhados;
(2) `FindingsReport` usa `#f97316` para high divergindo de `--high:#F59E0B`;
(3) sidebar começa expandida no código, handoff pede recolhida.

---

## 4. Componentes (`frontend/components/`)

| Componente | Função |
|---|---|
| `ui/Sidebar.tsx` | sidebar colapsável (56/224px), nav por role, logo, footer de usuário/logout |
| `chat/ChatInput.tsx` | textarea + autocomplete de slash-commands; bloqueia envio enquanto o agente roda |
| `chat/MessageFeed.tsx` | feed do agente com Markdown; bolhas de operador; render de `agent_question` (botões) |
| `chat/FindingsSidebar.tsx` | painel direito do chat: findings ao vivo + fase/progresso + custo |
| `engagement/ExecutionPanel.tsx` | **aba Execução**: hero + timeline recon→enum→vuln + findings ao vivo + decisão + feed + CTA |
| `engagement/ScheduleSettings.tsx` | modal de agendamento de scans recorrentes |
| `findings/FindingsReport.tsx` | relatório de findings por engagement (donut, stats, remediação, instâncias) — **tela mais polida, é o padrão a seguir** |

Hooks: `hooks/useAuth`, `hooks/useEngagementWS` (WebSocket ao vivo: `messages`,
`agentRunning`, `contextUsage`, `send`).

---

## 5. Modelo de dados (`backend/src/models/`)

**Engagement** (`_id:String`): `name`, `target`, `scope`(Mixed), `status`
(idle/active/completed), `phase`, `progress`, `findingsCount`, `slug`, `date`,
`schedule`{enabled, frequency, phases, autoExploit, costCeilingUsd, nextRunAt…}, timestamps.

**Finding** (timestamps): `engagementId`, `engagementName`, `severity`, `title`, `type`,
`location`, `parameter`, `payload`, `evidence`, `impact`, `description`, `recommendation`,
`cvss`. **Taxonomia (anti-FP)**: `state`(confirmed/probable/informational/false_positive),
`confidence`, `reproducible`, `poc`, `needsToConfirm`, `ruledOutReason`. **Classificação**:
`cvssVector`, `owasp`, `owaspApi`, `cwe`, `mitre`, `discoveredBy`. **Regressão**:
`fingerprint`, `remediationStatus`(open/fixed/regressed/accepted_risk), `firstSeen`, `lastSeen`.

Outros: `User`, `ChatSession` (com `claudeSessionId`, `contextTokens`), `ChatMessage`, `Usage`.

> Nota: o tipo `Finding` do frontend (`lib/api.ts`) expõe só um subconjunto; campos
> ricos (`cwe`, `owasp`, `solution`, `instances`) são tratados como extensão local no
> `FindingsReport` → serialização backend→frontend ainda incompleta.

---

## 6. API consumida pelo frontend (`lib/api.ts`)

Cliente `fetch` base `/api`, injeta `Authorization: Bearer` do localStorage, redireciona a `/login` em 401.
- **auth**: `POST /auth/login`, `GET /auth/me`, `POST /auth/exchange` (SSO)
- **engagements**: `GET/POST /engagements`, `GET/PATCH/DELETE /engagements/:id`, `PATCH :id/schedule`, `POST :id/run-now`, `GET :id/messages`, **sessions** (`GET/POST :id/sessions`, `PATCH/DELETE :id/sessions/:sid`)
- **findings**: `GET /findings?engagementId&severity&remediationStatus`, `PATCH /findings/:id/status`
- **reports**: `GET /reports/:engagementId`
- **admin**: `GET /admin/metrics`, `/admin/usage`, `/admin/usage/by-user`
- **users**: `GET/POST /users`, `PATCH/DELETE /users/:id`, `PATCH /users/:id/reset-password`

---

## 7. Navegação

- **Sidebar** (`ui/Sidebar.tsx`): Dashboard, Findings, Relatórios, Usuários (admin), Admin (admin).
  Item ativo com borda-esquerda roxa. Footer com avatar/iniciais + logout. Badge de findings existe mas **nunca é populado**.
- **TopBar** (no layout): breadcrumb "Rift › {página}", "Sistema online", botão "Novo Engagement" (linka pro dashboard).

---

## 8. Handoff de design v3 (fonte de verdade do redesign)

Na raiz do repo:
- **`design_handoff_rifit_v3/README.md`** — spec de design completa (tokens, tipografia,
  espaçamentos, sombras, layout, spec componente-a-componente de **Dashboard, Findings,
  Relatórios, Usuários**). Pede recriação **pixel-perfect**.
- **`design_handoff_rifit_v3/App Dashboard v3.html`** + `rifit-v3.jsx` + `rifit-v3-pages.jsx`
  — protótipos React executáveis dessas 4 telas.
- **`Login Page v4.html`** (raiz) — protótipo do login (origem da tela atual; tem um
  "threat feed ticker" que foi removido na versão React).
- **`relatorio-full.html`** (raiz) — exemplo de relatório gerado (OWASP ZAP), referência
  de **conteúdo/estilo do output** que a tela de Relatórios exibe no iframe.

Cobertura do handoff: Dashboard/Findings/Relatórios/Usuários (login em v4). **Não cobre**
`/admin` nem uma home. Marca no handoff é "RIFIT"; o produto é "RIFT".

---

## 9. Bugs e gaps conhecidos (backlog de UI)

1. ✅ **[CORRIGIDO 2026-07-07] Botão de apagar engagement pisca/some** — hover movido do
   card interno para o wrapper externo (que engloba card + botão), então o botão não
   desmonta mais ao passar o mouse. Também gated em `isAdmin` (o backend já exige admin).
   `dashboard/page.tsx`. (precisa de rebuild do frontend p/ valer em produção)
2. **[FALTA] Home** — `/` só redireciona; não há landing/overview.
3. **[CRU] `/findings`** — sem KPIs/resumo, `<select>` nativo, sem badges de tipo/CWE/
   remediação, não reaproveita o `FindingCard`. Deve adotar o visual do `FindingsReport`.
4. **[CRU] `/reports`** — sem header, ícone genérico, sem metadados (data/tipo/formato).
5. **[DÍVIDA] Design fragmentado** — extrair tokens + componentes compartilhados
   (Card, Chip, Button, SI, SEV_COLOR) e alinhar cores ao `globals.css` e ao handoff v3.

---

## 10. Roadmap de UI (pedidos do operador — 2026-07-07)

Priorização atual (frontend only; backend/segurança é de outro agente):
1. **Corrigir o botão de apagar engagement** (bug concreto). ← rápido
2. **Página home** (net-new; definir conceito — não está no handoff).
3. **Repaginar `/findings` e `/reports`** seguindo o handoff v3 (pixel-perfect) e o
   padrão do `FindingsReport`.
4. (transversal) **Extrair design-system** compartilhado para acabar com a duplicação.
