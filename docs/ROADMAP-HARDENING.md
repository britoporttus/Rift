# Rift — Roadmap de Hardening (Segurança, Confiabilidade e Arquitetura)

> Documento vivo. Norte de execução das correções levantadas na revisão de
> arquitetura/segurança de 2026-07-07. Ordem pensada por **risco** e por
> **dependência** (arquitetura → código → teste → deploy).
> Cada item tem um ID rastreável usado nos commits.

> **STATUS 2026-07-07:** Etapas 1–4 **CONCLUÍDAS, validadas e no ar** (pm2 restart).
> Validação: `node --check` (backend), 6/6 testes (`node --test`), `tsc --noEmit`,
> `next build`, smoke test de boot/health/404/shutdown e handshake WS por subprotocolo
> — tudo verde. Diferido (Etapa 5) = próxima rodada.

---

## Princípios da rodada

1. **Segurança primeiro.** O Rift roda `claude --dangerously-skip-permissions`
   com prompt controlado pelo operador: o modelo de ameaça real é *prompt
   injection + exfiltração*. Fechar isso vem antes de qualquer feature.
2. **Não perder dado.** Rotas que penduram, processos órfãos, findings perdidos
   pelo watcher e contadores que inflam — tudo que corrompe estado silenciosamente.
3. **Validar antes de subir.** Nada vai pra produção sem `node --check`, testes
   (`node --test`), `tsc --noEmit` e `next build` verdes.
4. **Deploy com checkpoint.** A produção está no ar (pm2) e há uma migração
   MongoDB não-commitada na árvore. O restart é confirmado com o operador.

---

## Etapa 1 — Segurança (CRÍTICO/ALTO)

| ID | O quê | Arquivo | Estado |
|----|-------|---------|--------|
| SEC-1 | Allowlist de env no spawn do `claude` (parar de vazar `JWT_SECRET`/`MONGO_URI`/`AZURE_*`) | `backend/src/agent-runner.js` | ⏳ |
| SEC-2 | Teto de custo no chat interativo + rate limit no `/login` + remover senha admin default | `server.js`, `auth.js`, `.env.example`, `scripts/seed.js` | ⏳ |
| SEC-3 | RBAC de fase agressiva reforçado fora do agente (detecção ampla + regra dura + registro) | `server.js` | ⏳ |
| SEC-4 | JWT sai da query string do WS → subprotocolo `Sec-WebSocket-Protocol` | `server.js`, `useEngagementWS.ts` | ⏳ |
| SEC-5 | Validar protocolo de URL derivada do alvo (anti-XSS `javascript:`) | `FindingsReport.tsx` | ⏳ |

## Etapa 2 — Confiabilidade (ALTO/MÉDIO)

| ID | O quê | Arquivo | Estado |
|----|-------|---------|--------|
| REL-1 | `express-async-errors` + middleware de erro global + 404 (fim das requests penduradas) | `server.js` | ⏳ |
| REL-2 | Cleanup de processos no shutdown + process group + escalonamento SIGKILL + timeout de run | `agent-runner.js`, `server.js` | ⏳ |
| REL-3 | Chave de sessão do runner `${engId}:${sessionId}` (fim da colisão `default`) | `server.js` | ⏳ |
| REL-4 | `findingsCount` idempotente (via count no DB) + watcher `awaitWriteFinish` + handler `change` | `findings-watcher.js`, `server.js`, `scheduler.js`, `store.js` | ⏳ |
| REL-5 | Re-emitir `agent_status` na conexão + recarregar histórico na reconexão | `server.js`, `useEngagementWS.ts`, `engagement/[id]/page.tsx` | ⏳ |

## Etapa 3 — Testes + Config

| ID | O quê | Estado |
|----|-------|--------|
| TEST-1 | Suíte `node --test` (RBAC, deriveState/fingerprint de findings, safeHref) | ⏳ |
| CFG-1 | CI `npm ci` (reprodutível) + rodar testes de backend | ⏳ |
| CFG-2 | `tsconfig target` es2020; remover e-mail admin pré-preenchido no login | ⏳ |

## Etapa 4 — Deploy

- Validação completa verde → **checkpoint com o operador** → `pm2 restart` → smoke test → avisar.

---

## Diferido (roadmap de produto/arquitetura — próxima rodada)

Não são bugs; são evoluções maiores que merecem sua própria etapa (ver
`docs/DIRECAO-PRODUTO.md` e `docs/ARQUITETURA-AGENTES.md`):

- **JWT em cookie `HttpOnly`** no lugar de `localStorage` (refactor de auth ponta a ponta).
- **Aba "Execução" (A1)** — o painel de execução do pivô de produto (timeline de fases + findings ao vivo + prompts). Hoje a UI ainda é chat-first.
- **Dedup de UI** — extrair `SI()`/`SEV_COLOR`/preview de relatório para `lib/` compartilhado; matar cores hex duplicadas; usar Tailwind de fato ou removê-lo.
- **Reestruturação do agente + disciplina anti-FP** — verificação adversarial obrigatória, evidência obrigatória, severidade honesta cravadas no pipeline (não só documentadas). Gating de fase agressiva no nível do framework (tools), não só no backend.
- **RBAC por engagement** — hoje qualquer usuário abre WS de qualquer engagement (aceitável no modelo 1-usuário, não escala).
