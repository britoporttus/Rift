# Rift — Roadmap Consolidado (auditoria dos 14 roadmaps)

> **Por que este documento existe.** O operador pediu (2026-08-10) uma leitura de
> *todos* os roadmaps do repositório: o que foi **feito**, o que **não foi**, o
> que foi **descartado** — num lugar só, para continuar a partir dele.
>
> Havia 14 arquivos de roadmap escritos em momentos diferentes. O
> [PLANO-MESTRE](PLANO-MESTRE.md) já é a **fonte de ORDEM e prioridade**; este
> aqui é a **fonte de ESTADO** — o inventário cruzado com o código. Os dois se
> complementam: PLANO-MESTRE diz *o que fazer a seguir*, este diz *onde tudo está*.
>
> Legenda: `✅` no ar · `🟡` parcial · `🔵` planejado (ordenado) · `⛔` bloqueado
> por infra · `❌` descartado · `💤` adiado explicitamente
>
> Verificado contra o código em 2026-08-10 (backend 535 testes, frontend 49).

---

## 1. No ar hoje (✅)

O núcleo do produto existe e roda. Isto NÃO é aspiração — é o que está deployado.

| Capacidade | Estado | Nota / dívida |
|---|---|---|
| **Domínios / ASM externo** | ✅ | subfinder→DNS→httpx→nuclei→portas→ASN, score explicável, takeover, DNS brute, screenshots, diff. **Determinístico, zero token de IA.** |
| **Rede Interna (MVP)** | ✅ | agente local (Win/Linux), inventário, classificação de dispositivo, score, recomendações + CSV, topologia React Flow. Always-on depende do Runner (⛔). |
| **Web/API black-box (Agente 1)** | ✅ | intake, execução ao vivo por WebSocket, taxonomia anti-FP, Jobs com fila durável. |
| **Cloud / Azure** | ✅ | Service Principal + cofre de credencial efêmero. Postura de identidade ainda rasa (ver #6b). |
| **Mapa de superfície** | ✅ | mind-map React Flow ligando domínios, IPs, tecnologias e findings; `/api/graph`; rastro do achado (`/findings/:id/trace`). |
| **Relatórios** | ✅ | executivo + técnico, HTML + PDF (Chromium). |
| **Plataforma** | ✅ | SSO Azure, RBAC (admin/user/client), cookie HttpOnly, CSP, anti-SSRF, painel admin, CI + deploy em merge. |
| **Frente 0 — isolamento por tenant** | ✅ | banco por tenant, resolver fail-closed, `req.db`, WS/workers escopados, cofre por tenant, papel `client`, prova de posse, planos. Mergeada na `main`. Pendências em §5.1. |
| **Hardening (SEC-1..5, REL-1..5, TEST/CFG)** | ✅ | allowlist de env, teto de custo, RBAC de fase agressiva, WS por subprotocolo, shutdown gracioso, suíte de testes + CI. Ver [ROADMAP-HARDENING](ROADMAP-HARDENING.md). |
| **Painel de execução + Anti-FP (Roadmap A/B)** | ✅ | estado do run derivado do backend, strip "fazendo agora", separação confirmado/provável, gate anti-FP nos choke-points. Ver [ROADMAP-A-B-EXECUCAO](ROADMAP-A-B-EXECUCAO.md). |
| **Consolidação do agente (F0–F5)** | ✅ | tronco único v2, seletor de framework aposentado como dívida, calibração é cobertura de teste. Ver [ROADMAP-CONSOLIDACAO-AGENTE](ROADMAP-CONSOLIDACAO-AGENTE.md). |

### 1.1. Feito nesta rodada (2026-08-10) — roadmap de legibilidade

Fases 1–5 de [ROADMAP-LEGIBILIDADE-E-VISOES](ROADMAP-LEGIBILIDADE-E-VISOES.md),
todas no ar:

- **Bug do scanner (`db is not defined`)** — nenhum scan de ASM rodava desde a
  Frente 0. Corrigido; scans voltaram.
- **Host = 1 asset** — fim da perda de subdomínio (o `httpx` apagava o
  subdomínio); "9 ativos" deixou de contar porta como host. (Bugs 1/2/4)
- **Vocabulário** — "Score de segurança" → **"Índice de exposição"** (a barra
  vermelho↔verde estava invertida, em domínio E rede interna); severidade por
  extenso no lugar de C/A/M/B.
- **Menu por ambiente** — Alvos (Web/API, Rede, Cloud🔜, AD🔜, SAP🔜) /
  Resultado / Conta, no lugar de Superfície/Resultados/Sistema.
- **Profundidade** — todo número do assessment abre a lista que o sustenta.
- **Hierarquia** — cartão de domínio e home enxutos (o "mais expostos" virou "o
  que mudou").
- **Ciclo de vida do achado** — estado (aberto→em correção→corrigido/aceito),
  dono, prazo (SLA por severidade), histórico. **Regra garantida por teste:**
  re-scan não ressuscita achado tratado (`fixed`→`regressed`, nunca reabre).
- **Visões por papel (Fase 6)** — `depth` (técnico/gestor/diretor) ortogonal ao
  `role`. **Gestor** (`/painel`): métricas de correção + fila acionável (estourado
  primeiro). **Diretor** (`/executivo`): veredito + índice + tendência de 30 dias
  + 3 KPIs. Seletor no topbar (interno alterna; cliente preso ao cadastro); login
  aterrissa cada perfil na sua casa. Agregações puras e testadas (`overview.js`).

**Roadmap de legibilidade (Fases 1–6): COMPLETO e no ar.**

---

## 2. Em progresso (🟡)

| Item | Estado | O que falta | Origem |
|---|---|---|---|
| ~~**Kanban de correção**~~ | ✅ **feito 2026-08-10** | `/correcoes`: quadro com drag-and-drop nativo (Aberto/Em correção/Corrigido/Risco aceito), "Assumir" (dono) + prazo por card, toggle Todos/Meus. `kanbanBoard` puro e testado. | operador |
| **Agente 2 — pentest autenticado** | 🟡 stub | pack `web-auth` coleta credencial; falta crawler autenticado, gatilho de handoff e **harness de sessão** (provar login antes de gastar token). | CONSOLIDACAO F6 / PRODUTO É5 |
| ~~**ASM monitoramento risk-triggered** (#2b)~~ | ✅ **feito 2026-08-10** | deriva eventos do scan (novo subdomínio, exposição alta, CVE, takeover, piora de score) → feed `MonitorEvent` + re-scan mais curto p/ domínio "quente". Falta só badge/notificação in-app (A4). | PRODUTO É2 |
| **Vazamentos** | 🟡 represado | "buy, not build" para coleta; dados e lógica atrás de `RIFT_LEAKS_ENABLED`; correlação leve = item #5. | PRODUTO É8 |
| **Notificações in-app** (A4) | ⏳ | toast/badge nos checkpoints e ao concluir mapeamento. | A/B |

---

## 3. Planejado, em ordem (🔵) — a fila do PLANO-MESTRE §5

A ordem é decisão fechada; não re-discutir sem motivo novo.

| # | Front | Depende de |
|---|---|---|
| **2b** | ASM monitoramento risk-triggered | §1.1 |
| **3** | Agente 2 autenticado + harness de sessão | — |
| **4** | Correlação leve de credenciais (domínio→empresa→funcionários) | — |
| **5** | Integrações / abas de conexão (ticketing + MCP) | Frente 0 |
| **5b** | Cloud: Azure + Entra ID a sério (postura de identidade) | — |

---

## 4. Bloqueado por infra (⛔)

| Item | Bloqueador |
|---|---|
| **Runner interno + transporte de inferência** | peça de infra única; destrava rede-interna always-on, AD e SAP |
| **AD → SAP** | depende do Runner; sequência Azure→AD→SAP. SAP é lacuna real de mercado. |

Detalhe do veredito do Conselho em [ROADMAP-MULTI-DOMINIO](ROADMAP-MULTI-DOMINIO.md).

---

## 5. Descartado ou adiado (❌ / 💤)

Registrado para **não ser re-proposto** sem contexto novo.

| Item | Estado | Por quê |
|---|---|---|
| BYOK (traga sua chave de IA / Agent SDK) | ❌ | **Descartado pelo operador em 2026-08-10** — não se quer essa ideia dentro da plataforma; a inferência segue na assinatura Claude Code existente. |
| Coleta própria de stealer logs (Vazamentos) | ❌ | "buy, not build" — não vale construir o pipeline de coleta. Fica a correlação. |
| Inverter o índice para `100 − risco` | ❌ | avaliado 2026-08-10; renomear para "Índice de exposição" resolve sem quebrar o histórico. |
| Ambiente de staging | ❌ | criado e abandonado no mesmo dia (2026-07-23); o operador trabalha direto em produção. |
| "Nada de bibliotecas de animação" | ❌ revertido | GSAP (só no AttackStory, lazy) + Motion (no app, +43 kB medido) entraram com custo medido. |
| Prova de posse de domínio **em produção** | 💤 | pronta e testada; oculta atrás de `NEXT_PUBLIC_RIFT_DOMAIN_VERIFY` por decisão do operador. |
| Backlog grande estilo HackerSec/XBOW | 💤 | não iniciado; fora de escopo até o núcleo amadurecer. |
| "Exige atenção" → explicador (na Fase 3) | 💤→Fase 5+ | exigiria shim exposição↔finding que a unificação de achado joga fora. |

---

## 6. Dívida de segurança (auditoria 2026-07-20)

[ROADMAP-AUDITORIA-2026-07-20](ROADMAP-AUDITORIA-2026-07-20.md) levantou 51
achados. Estado:

| Classe | Qtde | Estado |
|---|---|---|
| **P0 crítico** | 8 | **7 fechados**, 1 parcial (P0-8: API key dedicada + egress — metade de código; a auditoria partiu de premissa errada sobre onde a credencial vive, ver PLANO-MESTRE §3.1). |
| **P1 alto** | 19 | parcialmente endereçados (vários em código: P1-17 upsert idempotente, P1-22 paginação). Sem varredura de fechamento formal. |
| **P2 médio** | 15 | oportunista. |
| **P3 baixo** | 9 | oportunista. |

**Ação pendente:** uma passada de fechamento formal de P1 (hoje é "vários feitos,
sem checklist"). Não é urgente, mas é a maior incerteza do inventário.

---

## 7. Mapa dos 14 roadmaps de origem

| Documento | Papel hoje |
|---|---|
| **PLANO-MESTRE.md** | fonte de **ordem/prioridade** (§5). Ativo. |
| **ROADMAP-CONSOLIDADO.md** (este) | fonte de **estado**. Ativo. |
| **ROADMAP-LEGIBILIDADE-E-VISOES.md** | fila de trabalho ativa (Fases 1–6 da tela de Domínios + visões). Ativo. |
| ROADMAP-PRODUTO-2026-07-27.md | os 8 épicos com ordem do operador — absorvido por PLANO-MESTRE §5. Referência. |
| RIFT-FEATURES-E-EPICOS.md | panorama para plano de negócio / stakeholder. Referência. |
| ROADMAP-AUDITORIA-2026-07-20.md | detalhe de cada P0–P3. Referência ativa (§6). |
| ROADMAP-CONSOLIDACAO-AGENTE.md | como o agente virou tronco único (F0–F6). Referência. |
| ROADMAP-MULTI-DOMINIO.md | veredito do Conselho, sequência Azure→AD→SAP. Referência (§4). |
| ROADMAP-A-B-EXECUCAO.md | painel de execução + anti-FP (concluído). Histórico. |
| ROADMAP-HARDENING.md | SEC/REL/TEST (concluído). Histórico. |
| ROADMAP-MELHORIAS.md | DEP/BUG/SEC diferidos (concluído). Histórico. |
| ROADMAP-MELHORIAS-UX-2026-07-23.md | reformulação visual + mind-map. Histórico. |
| roadmap-mapa-de-superficie.md | como o grafo foi construído. Histórico. |
| ARQUITETURA-AGENTES.md / DIRECAO-PRODUTO.md / APP-RIFT.md | arquitetura, tese e inventário de telas. Referência (APP-RIFT desatualizado). |

---

## 8. O que vem a seguir

1. **Fase 6 — visões por papel** (técnico/gestor/diretor). Destravada pelo ciclo
   de vida do achado (§1.1). É o próximo passo do roadmap de legibilidade.
2. Depois dela, a fila do §3 na ordem do PLANO-MESTRE — começando pelo **#2b
   (monitoramento risk-triggered)**, agora que a tela sabe dizer o que mudou.
3. Em algum momento, a **passada de fechamento de P1** (§6) — a única incerteza
   grande do inventário.
