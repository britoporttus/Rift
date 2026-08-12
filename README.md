# Rift — Plataforma de Pentest com IA

Rift é uma plataforma web que opera pentests guiados por IA: o operador cria
**engagements** (escopos), acompanha **findings em tempo real**, e recebe
relatórios executivo e técnico. Não é um chatbot — é um **painel de execução**:
cria engagement → intake guiado → roda automático (recon/enum/vulns) → findings ao
vivo → notifica/pergunta nos checkpoints. O posicionamento é a *camada de cobertura
automática, confiável e de baixo ruído* (disciplina anti-falso-positivo), não um
"auto-hacker".

**Stack:** Next.js 14 (App Router, `frontend/server.js` custom) · Node/Express ·
MongoDB (Mongoose, multi-tenant por `req.db`) · WebSocket · pm2 · Cloudflare Tunnel.
Paleta roxo/preto. O agente de pentest é o CLI do Claude Code, spawnado pelo backend.

---

## Por onde começar a ler (para entender a proposta e o que falta)

| Quer entender… | Leia |
|---|---|
| **A proposta / visão de produto** | [`CLAUDE.md`](CLAUDE.md) (o que é o Rift, 5 módulos, roles, contrato WebSocket, paleta) · [`docs/DIRECAO-PRODUTO.md`](docs/DIRECAO-PRODUTO.md) · [`Rift-Roadmap.md`](Rift-Roadmap.md) (estratégia/mercado) |
| **A ORDEM e prioridade do que fazer** | [`docs/PLANO-MESTRE.md`](docs/PLANO-MESTRE.md) (fonte de ordem, §5) |
| **O ESTADO real (o que está feito × o código) e O QUE FALTA** | 👉 **[`docs/ROADMAP-CONSOLIDADO.md`](docs/ROADMAP-CONSOLIDADO.md)** — **doc canônico de estado.** Comece pela **§8 "O que vem a seguir"** (a fila de construção) |
| **Arquitetura dos 2 agentes** (black-box → autenticado) | [`docs/ARQUITETURA-AGENTES.md`](docs/ARQUITETURA-AGENTES.md) |
| **Dívida de segurança** (auditoria dos P0–P3) | [`docs/ROADMAP-AUDITORIA-2026-07-20.md`](docs/ROADMAP-AUDITORIA-2026-07-20.md) |

> Há vários roadmaps históricos em `docs/` (foram consolidados). Em caso de dúvida
> sobre o que está feito, **`ROADMAP-CONSOLIDADO.md` vence** — ele é cruzado com o
> código. O `§7` dele mapeia o papel de cada roadmap antigo.

---

## Estado atual (revisado 2026-08-12)

**No ar:** Domínios/ASM externo · Rede Interna (MVP) · Pentest Web/API black-box
(Agente 1) · Cloud/Azure · Mapa de superfície · Relatórios (exec/técnico, PDF) ·
Plataforma (SSO Azure, RBAC, isolamento por tenant "Frente 0", CI + deploy em merge)
· Kanban de correção · Monitoramento risk-triggered (#2b) + **notificações in-app
(A4)** · Integrações/ticketing (#5) · Correlação de credenciais (#4) · **Agente 2
autenticado — Fase 3.1** (pentest web logado funcional pelo fluxo web-auth).

**Fila de construção (detalhe em ROADMAP-CONSOLIDADO §8):**
1. Agente 2 — **Fase 3.2**: handoff de um clique (promover black-box→autenticado em
   runtime, semeando o shadow_graph).
2. Agente 2 — **Fase 3.3**: progresso do Playwright/crawl autenticado na timeline.
3. **#5b** Cloud: Azure + Entra ID a sério (postura de identidade).
4. Fechamento formal de **P1** (segurança).
5. *Bloqueado por infra:* Runner interno → rede-interna always-on → **AD → SAP**.

---

## Estrutura do repositório

```
rift/
├── CLAUDE.md                  ← proposta / instruções do produto
├── docs/                      ← roadmaps e docs (ROADMAP-CONSOLIDADO = estado canônico)
├── frontend/                  ← Next.js 14 (app/(app) = área logada; components/, lib/)
├── backend/                   ← Node/Express (src/server.js, api/, agent-runner.js,
│                                 domain-packs.js, session-harness.js, asm/, integrations/)
├── Agentes-Pentest/           ← frameworks do agente (VERSIONADO)
│   └── pentest-framework-v2-next/  ← framework ATIVO (id `v2c`); core/, skills/, agents/,
│                                     .claude/commands/ (fases pentest-*), CLAUDE.md
└── ecosystem.config.js        ← pm2 (rift-backend:3001, rift-frontend:3000)
```

O framework do agente é selecionado em `backend/src/frameworks.js` (default `v2c` →
`Agentes-Pentest/pentest-framework-v2-next`). O `AGENT_ROLE` (`blackbox`/`authenticated`)
roteia o `CLAUDE.md` do framework para `core/agent-1-blackbox.md` ou
`core/agent-2-authenticated.md`.

---

## Rodar e deployar

- **Rodar:** `npm ci` na raiz (workspaces; `node_modules` hasteados na raiz) →
  `npm run build` em `frontend/` → `pm2 start ecosystem.config.js`. Node v20 (nvm).
- **Deploy:** a `main` é protegida (só entra por PR; check exigido = *Frontend —
  lint & build*). **Todo push na `main` dispara o workflow `Deploy to VPS`** (runner
  self-hosted): `git reset --hard origin/main` → `npm ci` → `npm run build` →
  `pm2 restart` → health-check. Ou seja, **merjar um PR = deploy automático**.
- **Testes:** runner nativo — `cd backend && node --test`; `cd frontend && node --test test/`.
