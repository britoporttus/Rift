# Rift — Roadmap de Melhorias (consolidado e rastreável)

> Documento vivo. Consolida **segurança + confiabilidade + UX + produto** num
> único norte rastreável, priorizado por **risco** e **dependência**. Cada item
> tem um ID usado nos commits.
>
> Complementa — não substitui — o `docs/ROADMAP-HARDENING.md` (rodada de segurança
> já concluída e no ar) e as visões de `docs/DIRECAO-PRODUTO.md` e
> `docs/ARQUITETURA-AGENTES.md`. O hardening fechou o modelo de ameaça imediato
> (prompt injection + exfiltração + estado corrompido). **Este roadmap cobre o que
> sobrou:** o fluxo de deploy, bugs de estado do backend descobertos depois, a
> segurança diferida, a dívida de UX/qualidade do frontend, a higiene de
> infra/CI e os épicos de produto (painel de execução, anti-FP, Agente 2).
>
> Legenda de estado: ⏳ pendente · 🔨 em progresso · ✅ feito.
> Prioridade: **P0** (faça já / risco de produção) · **P1** (alto) · **P2** (médio)
> · **P3** (higiene/escala).

---

## ✅ Concluído (no ar)

Rodada de **hardening 2026-07-07** — validada (`node --check`, `node --test`,
`tsc --noEmit`, `next build`, smoke de boot/health/404/shutdown, handshake WS) e
em produção (`pm2 restart`). Commits: `ea58e04` (rift) + `9c35179` (framework).
Detalhe completo em `docs/ROADMAP-HARDENING.md`.

| ID | O quê | Estado |
|----|-------|--------|
| SEC-1 | Allowlist de env no spawn do `claude` (não vaza `JWT_SECRET`/`MONGO_URI`/`AZURE_*`) | ✅ |
| SEC-2 | Teto de custo interativo (`INTERACTIVE_COST_CEILING`, default 0=off) + rate limit no `/login` + seed recusa senha fraca | ✅ |
| SEC-3 | RBAC de fase agressiva (`rbac.js` + `RIFT_ALLOW_AGGRESSIVE` + regra dura no contexto do agente) | ✅ |
| SEC-4 | Token do WS via subprotocolo `rift-jwt` (fora da query string) | ✅ |
| SEC-5 | `safeHref` bloqueia URLs não-http em findings (anti-XSS) | ✅ |
| REL-1 | `express-async-errors` + middleware de erro global + 404 de API | ✅ |
| REL-2 | Shutdown gracioso (mata árvore de processos) + timeout de run + escalonamento SIGKILL | ✅ |
| REL-3 | Chave de sessão do runner `${engId}:${sessionId}` (fim da colisão `default`) | ✅ |
| REL-4 | `findingsCount` idempotente (count no DB) + watcher `awaitWriteFinish`/`change` | ✅ |
| REL-5 | `agent_status` na conexão + reload de histórico na reconexão | ✅ |
| TEST-1 / CFG-1/2 | Suíte `node --test` (`backend/test/`), CI com `npm ci`, `tsconfig` es2020 | ✅ |
| UX-0 | Dashboard reativo (refetch a cada 10s + no foco) | ✅ |
| ANTI-FP-5B | Framework: skill `finding-quality.md` (verificação adversarial), CLAUDE.md com esquema `state` (não `confirmed:true`), `pentest-report` separa confirmed/probable/informational | ✅ |
| A1 | Aba "Execução" — `components/engagement/ExecutionPanel.tsx` (hero, timeline recon→enum→vuln, decisão pendente, findings ao vivo, feed colapsável, CTA "Iniciar") | ✅ |

---

## Etapa 0 — Fluxo de deploy & Git (P0 — risco de produção)

> **Por que é P0:** a produção já rodou código **não-commitado** (a árvore de
> trabalho vive suja) e o `deploy.yml` faz `git pull` sobre essa árvore suja com
> `npm install` (não reprodutível), sem gate de CI e sem verificação pós-deploy.
> Um deploy pode subir código que ninguém revisou, ou falhar em silêncio e deixar
> o serviço quebrado. Fechar isto vem antes de qualquer melhoria de código.

| ID | O quê | Arquivo(s) | Prioridade | Estado |
|----|-------|------------|-----------|--------|
| DEP-1 | Commitar/limpar a árvore de trabalho e adotar disciplina de branch → PR → merge (parar de rodar código não-commitado em prod) | repo (`git`) | P0 | ⏳ |
| DEP-2 | `deploy.yml`: trocar `git pull` sobre árvore suja por `git fetch` + `git reset --hard origin/main` (ou **fail-fast** se `git status` sujo) | `.github/workflows/deploy.yml` | P0 | ⏳ |
| DEP-3 | `deploy.yml`: `npm install` → `npm ci` (instalação reprodutível a partir do lockfile) | `.github/workflows/deploy.yml` | P0 | ⏳ |
| DEP-4 | Push direto em `main` **não** dispara CI (`ci.yml` só roda em PR/`push develop`) → exigir CI verde antes do deploy (branch protection ou job de teste no próprio `deploy.yml`) | `.github/workflows/ci.yml`, `deploy.yml` | P0 | ⏳ |
| DEP-5 | Health-check pós-deploy (`curl /api/health` + `pm2 status`) com sinalização de falha (base para rollback) | `.github/workflows/deploy.yml` | P0 | ⏳ |

---

## Etapa 1 — Bugs de estado no backend + segurança diferida (P1)

> Bugs reais que corrompem estado em silêncio (findings órfãos, admin trancado,
> feed que não liga, mensagem perdida) + a segurança que ficou de fora do
> hardening por ser refactor maior (JWT em cookie, CSP).

### 1a. Bugs de estado

| ID | O quê | Arquivo(s) | Prioridade | Estado |
|----|-------|------------|-----------|--------|
| BUG-1 | Deletar engagement deixa **findings órfãos** e **watcher vazado**: o handler `DELETE` remove só `ChatMessage`/`ChatSession`; falta `Finding.deleteMany({engagementId})` e `findingsWatcher.unwatch(id)` (e `store.deleteEngagement` não toca em findings) | `api/engagements.js`, `store.js`, `findings-watcher.js` | P1 | ⏳ |
| BUG-2 | **Lockout de admin**: dá para rebaixar/deletar o último admin — ou a si mesmo. Sem guarda de *last-admin* nem de *self* no `PATCH /:id` (role) e `DELETE /:id` | `api/users.js` | P1 | ⏳ |
| BUG-3 | **Race do watcher**: `watch()` faz `if (watchers.has(id)) return` → o primeiro `onFinding` vence. Se o `scheduler` abre o watcher antes do WS, o feed ao vivo do operador nunca recebe eventos. Suportar múltiplos assinantes por engagement (ou re-registrar o callback do WS) | `findings-watcher.js`, `server.js`, `scheduler.js` | P1 | ⏳ |
| BUG-4 | **`sendInput` é no-op na prática**: o `claude` roda com `--print` (one-shot) e não consome `stdin`; a mensagem do operador enviada durante um run é perdida. Decidir: enfileirar até `idle`, dar feedback claro ("agente ocupado"), ou modo interativo | `agent-runner.js`, `server.js` | P1 | ⏳ |

### 1b. Segurança diferida (do hardening)

| ID | O quê | Arquivo(s) | Prioridade | Estado |
|----|-------|------------|-----------|--------|
| SEC-6 | JWT em cookie **HttpOnly** no lugar de `localStorage` (hoje em `hooks/useAuth.ts`, `hooks/useEngagementWS.ts`, `lib/api.ts`) — reduz superfície de XSS; refactor de auth ponta a ponta | `useAuth.ts`, `useEngagementWS.ts`, `lib/api.ts`, `auth.js`, `server.js` | P1 | ⏳ |
| SEC-7 | **CSP / security headers** — `next.config.js` só tem `rewrites`; adicionar `headers()` (CSP, `X-Frame-Options`, `X-Content-Type-Options`, HSTS) | `frontend/next.config.js` | P1 | ⏳ |

---

## Etapa 2 — Qualidade do frontend + testes (P2)

| ID | O quê | Arquivo(s) | Prioridade | Estado |
|----|-------|------------|-----------|--------|
| FE-1 | **Unificar cores de severidade**: ✅ `--high` no `globals.css` alinhado a `#F97316` (consumidores de `var(--high)` — MessageFeed/FindingsSidebar/ExecutionPanel — ficam corretos) e ✅ dashboard migrado para `lib/severity.ts`. FALTA migrar os mapas `SEV_COLOR` locais restantes (`findings/page.tsx`, `admin`) para importar da lib | `lib/severity.ts`, `findings/page.tsx`, `admin/*` | P2 | 🔨 parcial |
| FE-2 | `useAuth` vira **Context** (hoje é hook solto → `/auth/me` refetchado em múltiplos pontos) | `hooks/useAuth.ts`, layout `(app)` | P2 | ⏳ |
| FE-3 | **Error handling silencioso**: `catch {}` engole falhas em mutations de sessão (`engagement/[id]/page.tsx`) e em `admin/users` → mostrar toast/feedback | `engagement/[id]/page.tsx`, `admin/users/page.tsx` | P2 | ⏳ |
| FE-4 | **Acessibilidade + dedup**: `<div onClick>` sem `role`/teclado; extrair o SVG `SI()` duplicado em 7 arquivos (layout, reports, findings, dashboard, admin, admin/users, Sidebar) para um componente compartilhado | vários `app/`/`components/` | P2 | ⏳ |
| FE-5 | **Chat**: autoscroll não acompanha o streaming; falta `remark-gfm` para renderizar tabelas nas respostas do agente | `components/chat/MessageFeed.tsx`, `package.json` | P2 | ⏳ |
| FE-6 | Vazamentos menores: **blob URLs** de relatório não revogados no unmount; **badge de findings morto** no `Sidebar` | `reports/page.tsx`, `components/ui/Sidebar.tsx` | P2 | ⏳ |
| AUTHZ-1 | **RBAC por engagement**: hoje qualquer usuário abre o WS de qualquer engagement (aceitável no modelo 1-usuário; não escala). Validar posse/atribuição no `upgrade` do WS | `server.js` | P2 | ⏳ |
| TEST-2 | **Cobertura fina**: só existe `hardening.test.js`. Adicionar testes de auth, rotas (engagements/users/admin) e RBAC do WS | `backend/test/` | P2 | ⏳ |

---

## Etapa 3 — Escala & higiene (P3)

| ID | O quê | Arquivo(s) | Prioridade | Estado |
|----|-------|------------|-----------|--------|
| OPS-1 | Métricas admin agregadas **em memória**: `readUsage()` carrega toda a coleção `Usage` e agrega no Node → mover para `$group`/aggregate no Mongo (não escala com o histórico) | `api/admin.js`, `store.js` | P3 | ⏳ |
| OPS-2 | `.nvmrc` ausente (Node não pinado — o CLAUDE.md manda `source ~/.zshrc`) + `.gitignore` incompleto (`graphify-out/`, artefatos, `docs/` de handoff) | raiz do repo | P3 | ⏳ |
| OPS-3 | **CORS** aceita qualquer `*.trycloudflare.com` / `*.cloudflareaccess.com` — restringir para o(s) host(s) real(is) em produção | `server.js` | P3 | ⏳ |
| OPS-4 | `store.writeEngagements()` faz `Engagement.deleteMany({})` (bulk replace de migração) — perigoso se chamado fora do contexto de migração; isolar/guardar ou remover | `store.js` | P3 | ⏳ |
| OPS-5 | Scripts de import duplicados/stale (`scripts/import-myakdmi.js`, `scripts/seed.js`) — consolidar/limpar | `backend/scripts/` | P3 | ⏳ |
| OPS-6 | CI sem `npm audit` / Dependabot / CodeQL — adicionar varredura de dependências e SAST | `.github/workflows/` | P3 | ⏳ |

---

## Épicos de produto (Etapas A / B / C — de `DIRECAO-PRODUTO.md`)

> Separados do hardening: são **evoluções de produto**, não correções. A regra
> vale: **não avançar para B/C antes de A funcionar de verdade.**

### Etapa A — Painel de execução ponta a ponta (FOCO)

| ID | O quê | Estado |
|----|-------|--------|
| A1 | Aba "Execução" (`ExecutionPanel.tsx`) | ✅ feito |
| A2 | **Auto-run do Agente 1** — CTA "Iniciar" já encadeia recon→enum→vuln; FALTA emitir `phase_update` confiável para a timeline refletir a fase real | 🔨 parcial |
| A3 | **Intake guiado híbrido** — wizard visual em etapas + IA (aceita clique e texto), defaults sensatos, cria engagement + `scope.yaml` | ⏳ |
| A4 | **Notificações in-app** — toast/badge nos checkpoints, além do prompt clicável (`rift-question`) | ⏳ |
| A5 | **Gate de login / landing** — home → login → dashboard (CTA sempre → `/login`) | ✅ feito (2026-07-07) |
| A6 | **Repaginada visual do dashboard** (design system, KPIs com ícones, cards, estados vazio/loading) + unificação de cores (ver FE-1) | ✅ feito (2026-07-07) |

### Etapa B — Lapidar confiança / anti-FP

| ID | O quê | Estado |
|----|-------|--------|
| B0 | Base anti-FP (skill `finding-quality.md`, taxonomia `state`, report segmentado) | ✅ feito (5B, framework) |
| B1 | **Propagar o gate de qualidade** (confirmar-ou-rebaixar, evidência obrigatória, verificação adversarial) para os ~80 agentes individuais — cravar no pipeline, não só documentado | ⏳ |
| B2 | Score de confiança por finding + gating de fase agressiva no nível do framework (tools), não só no backend | ⏳ |

### Etapa C — Agente 2 autenticado

| ID | O quê | Estado |
|----|-------|--------|
| C1 | `core/agent-2-authenticated.md` de fato (mapeamento Playwright → IDOR/BOLA/BFLA → lógica de negócio) | ⏳ |
| C2 | **Handoff** — backend dispara `AGENT_ROLE=authenticated` quando o operador fornece credenciais; persistir `agentRole` por sessão (`ChatSession`) | ⏳ |
| C3 | **Screenshots autenticados** — resolver Node para Playwright (`/usr/bin/node` vs nvm) ou perfil chromium com cookies | ⏳ |

---

## Ordem recomendada de execução

**Hoje (parar o sangramento):** Etapa 0 completa — DEP-1..5. Sem deploy confiável,
qualquer correção abaixo pode não chegar (ou quebrar) a produção.

**Esta semana (bugs que corrompem estado):** BUG-1 (findings órfãos + watcher),
BUG-2 (lockout de admin), BUG-3 (race do watcher), BUG-4 (mensagem perdida).
Em paralelo já correm A5/A6 + FE-1 (unificação de cores) — deixar convergir.

**Próxima rodada (segurança diferida + qualidade):** SEC-6 (JWT em cookie),
SEC-7 (CSP), depois a Etapa 2 (FE-2..6, AUTHZ-1, TEST-2). Fechar a Etapa A do
produto (A2 confiável → A3 intake guiado → A4 notificações).

**Contínuo / oportunista:** Etapa 3 (OPS-1..6) conforme o histórico cresce e o
CI amadurece. Épicos B e C **só depois** da Etapa A funcionar ponta a ponta.

---

### Resumo por prioridade

- **P0** (deploy/git): 5 — DEP-1..5
- **P1** (bugs de estado + segurança diferida): 6 — BUG-1..4, SEC-6, SEC-7
- **P2** (qualidade frontend + testes): 8 — FE-1..6, AUTHZ-1, TEST-2
- **P3** (escala/higiene): 6 — OPS-1..6
- **Épicos de produto**: A (6, sendo 3 ✅ / 1 🔨 parcial / 2 ⏳), B (3, 1 ✅), C (3)
