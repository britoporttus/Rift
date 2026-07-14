# Rift — Roadmap de Consolidação do Agente (v2 ⊕ legacy ⊕ v3 → tronco único)

> Documento de execução. Define **como** colapsar os 3 frameworks de pentest num
> único agente — o **encanamento/UI do v2** + a **eficiência de execução do legacy**
> + a **disciplina de custo do v3** — e, na sequência, ligar a **integração** e a
> **Fase 2 (agente autenticado)**.
> Escrito em 2026-07-14, a partir do **Veredito do Conselho** (llm-council).
> **Status: aguardando validação do operador antes de executar.** Nada aqui é
> implementado até o operador dar o "segue".

---

## 0. O norte em uma frase

Hoje existem **3 versões de agente** selecionáveis por engagement (`v2` default,
`legacy`, `v3`). Isso multiplica manutenção por 3 e trava a Fase 2. O objetivo é
**um tronco único** que ganha nos 3 critérios existenciais — **menor custo, mais
vulnerabilidade provada, menos falso-positivo** — sem reescrever a aplicação, e que
já sirva de base para o agente autenticado.

---

## 1. A decisão (e o porquê CORRETO)

**O v2 é o tronco — mas pela razão certa, que não é "é o mais bonito".**

O v2 é o tronco porque é o **contrato de integração da aplicação**: todo o Rift já
lê o **YAML do v2** — o watcher ([findings-watcher.js](../backend/src/findings-watcher.js)),
a UI, os relatórios ([report.js](../backend/src/report.js)), o pipeline de Jobs
([jobs.js](../backend/src/jobs.js)) e o knowledge-base SQLite. Tornar o legacy o
tronco significaria reescrever tudo isso = semanas. A restrição "manter a app
orientada como está" **já decidiu** o tronco.

**MAS o v2 não é o melhor executor.** Dado de campo (pipe.trustsis.com, mesmo alvo):

| Framework | Findings | Confirmados | Custo |
|---|---:|---:|---:|
| **legacy** | 11 | **9** | **US$ 7,90** |
| **v2** | 6 | ~0 (quase tudo *informational*) | US$ 9,57 |

**Diagnóstico do conselho (hipótese inicial):** que a calibração da taxonomia do v2
sabotava o resultado (rebaixaria verdadeiro-positivo para *informational*), e que o
músculo estava nos playbooks agressivos do legacy.

**⚠️ CORREÇÃO DA F0 (medido em 2026-07-14 — ver §4/F0):** a hipótese é **parcialmente
falsa**. O gap NÃO é primariamente de calibração — é de **COBERTURA DE TESTE**, e corre
nos DOIS sentidos. Nos achados que os dois scans compartilham, o `informational` do v2 é
**igual ou mais honesto** que o `confirmed/medium` do legacy (que está inflado — 1 dos 9
"confirmados" é falso-positivo, que o **v2 refutou corretamente**). O que o legacy
realmente adiciona é um conjunto **pequeno e concreto de testes** que o v2 não roda
(versões TLS 1.0/1.1, downgrade HTTPS→HTTP em trailing-slash, algoritmos SSH, OAuth sem
PKCE). E o **v2** pegou o achado de MAIOR severidade real (File Browser exposto na :9090)
que o legacy perdeu por inteiro. A **disciplina de custo** vem do **RIFT-PLAYBOOKS.md do v3**.

> **A consolidação é ainda MAIS cirúrgica do que parecia:** conservar o encanamento **e a
> disciplina anti-FP** do v2 (são ativos, não bugs) e **adicionar as ~4 classes de teste
> faltantes** — NÃO afrouxar a taxonomia nem transplantar agressividade em bloco.

---

## 2. Princípios inegociáveis (guard-rails do conselho)

1. **Medir antes de mover arquivo.** O placar acima é **N=1** (um alvo, uma run).
   Pode ser variância, ou *confound* de modelo/config (Opus trava pentest por
   safeguard; o modelo foi fixado em sonnet — ver [[project_rift_agent_model]]).
   **Fase 0 valida isso antes de tudo.**
2. **Enxerto só conta se for REALMENTE chamado.** Playbook portado que o routing do
   v2 não aciona vira lixo morto — exatamente os **23 agentes fantasma do v3**.
3. **Não apagar legacy/v3 antes da prova.** Eles ficam como **oráculo de regressão**
   (golden test) até o v2-consolidado reproduzir os 9 confirmados por ≤ US$ 7,90.
   Só então saem do seletor. Aposentar cedo demais → operador roda "legacy
   clandestino" e a consolidação vira ficção.
4. **A calibração é prompt, não arquitetura.** O maior ganho (custo **e** qualidade)
   é reescrever a regra de severidade/estado — sem tocar em infra.
5. **Consolidar = restar 1, não 4.** O sucesso é o seletor A/B/C **colapsar**.

---

## 3. Visão geral das fases

| Fase | Objetivo | Tipo | Depende de |
|---|---|---|---|
| **F0 — Duelo controlado** | Provar que o gap é real e do framework; congelar baseline dos 9 confirmados | Medição | — |
| **F1 — Ajuste fino da taxonomia** | Manter a disciplina anti-FP; só surfacar `probable`+evidência (F0: taxonomia NÃO é o gargalo) | Prompt | F0 |
| **F2 — Fechar a lacuna de cobertura** | Adicionar ao v2 as classes de teste que faltam (TLS-versões, trailing-slash, SSH-algos, PKCE, +) → roteadas | Conteúdo (agentes/skills) | F0, F1 |
| **F3 — Disciplina de custo** | RIFT-PLAYBOOKS.md do v3 + fechar a lacuna de routing (23 fantasmas) | Conteúdo + routing | F2 |
| **F4 — Validação (golden test)** | v2-consolidado ≥ 9 confirmados por ≤ US$ 7,90 no mesmo alvo | Medição | F1–F3 |
| **F5 — Colapsar o seletor** | Aposentar legacy/v3; 1 tronco; integração final | Backend/UI | F4 ✅ |
| **F6 — Fase 2 (autenticado)** | Colher o orquestrador white-box do legacy + credenciais + handoff real + Playwright | Backend + framework | F5 |

Regra: **não avançar de fase sem o critério de "pronto" da anterior.**

---

## 4. Detalhe por fase

### F0 — Duelo controlado (a ÚNICA coisa a fazer primeiro)

**Objetivo:** desarmar o N=1 e criar o baseline que serve de teste de aceitação para
todo o resto.

**O que fazer:**
- Rodar **legacy** e **v2** no **mesmo alvo** (idealmente 2–3 alvos), com **modelo e
  config idênticos** (mesmo `AGENT_MODEL`, mesmo teto de custo, mesmo intensity).
- Produzir uma **planilha comparativa** (scorecard) com, por framework: findings,
  estado, custo real, tokens.
- Responder 3 perguntas que o conselho levantou e ninguém tinha medido:
  1. **O gap se mantém?** (ou foi variância / confound de modelo)
  2. **Os findings se sobrepõem?** Se os 9 do legacy e os 6 do v2 são vulns
     *diferentes*, a resposta pode ser *união*, não só transplante.
  3. **Os "9 confirmados" do legacy resistem a re-verificação?** (podem conter FP
     rotulados "confirmed" — a premissa "legacy tem pouco FP" nunca foi medida).

**Scorecard (template):**

| Alvo | Framework | Modelo | Findings | Confirmados | Confirmados **re-verificados** | Overlap c/ o outro | Custo | Tokens |
|---|---|---|---:|---:|---:|---:|---:|---:|
| pipe.trustsis.com | legacy | sonnet-5 | | | | | | |
| pipe.trustsis.com | v2 | sonnet-5 | | | | | | |

**Pronto quando:** existe o scorecard preenchido + o **conjunto-baseline** (a lista
dos confirmados do legacy que resistiram à re-verificação) congelado como golden set.

**Risco:** análise-paralisia. Mitigação: 2–3 alvos, não 20; a meta é sinal, não tese.

---

### F1 — Recalibrar a taxonomia (o maior botão)

**Objetivo:** parar o v2 de rebaixar verdadeiro-positivo e de gastar token
confirmando o óbvio. Ataca as 3 restrições (custo, prova, ruído) de uma vez.

**Onde mexe (v2):**
- [skills/finding-quality.md](../Agentes-Pentest/pentest-framework-v2/skills/finding-quality.md)
  — a porta de decisão confirmar-ou-rebaixar.
- [config/finding-taxonomy.yaml](../Agentes-Pentest/pentest-framework-v2/config/finding-taxonomy.yaml)
  — definições de estado.
- [CLAUDE.md](../Agentes-Pentest/pentest-framework-v2/CLAUDE.md) — seção REPORTING FORMAT / RULES.

**Mudança de regra:**
- `probable` **com evidência** (request+response salvos) → **reportado**, não enterrado
  como *informational*. `probable` é um estado de primeira classe no relatório.
- **Parar de re-confirmar o óbvio**: exposição direta comprovada num passo não precisa
  de loop adversarial caro. O gasto de "confirmação" vai para o que muda de estado.
- Manter o anti-FP como **calibração** (severidade honesta), não como **rebaixamento
  cego** (que hoje vira falso-negativo).

**Pronto quando:** re-rodar o alvo de F0 e obter **mais confirmados por menos custo**
que o v2 atual — provando que a calibração era o gargalo, sem ainda ter transplantado
nada do legacy.

---

### F2 — Transplante do cérebro do legacy

**Objetivo:** trazer a agressividade que prova vulnerabilidade — **para dentro do
routing do v2** (senão vira fantasma).

**O que fazer:**
- Portar os **playbooks agressivos por stack** do legacy (quick-hits SQLi/JWT/IDOR/
  SSRF/lógica + **encadeamento** de vulns) para o formato de agente/skill do v2.
  Fonte: [pentest-framework/.cursorules.md](../Agentes-Pentest/pentest-framework/.cursorules.md)
  + [pentest-framework/black-box/agents/](../Agentes-Pentest/pentest-framework/black-box/agents/) (73 agentes).
- **Ligar cada um ao routing do v2**:
  [skills/routing-table.md](../Agentes-Pentest/pentest-framework-v2/skills/routing-table.md)
  e [core/orchestrator-bb.md](../Agentes-Pentest/pentest-framework-v2/core/orchestrator-bb.md).
  Todo agente portado **tem** que aparecer na tabela por stack/lead.
- Se F0 mostrar **overlap baixo** (vulns diferentes), priorizar os agentes que o v2
  hoje **não cobre**; se overlap alto, priorizar a *técnica de prova* do legacy sobre
  os mesmos alvos.

**Pronto quando:** os playbooks portados são acionados de fato num run (aparecem no
feed/logs) e o placar sobe em direção ao baseline do legacy.

**Risco:** recriar os 23 fantasmas. Mitigação: um teste que falha se um agente
existe mas nunca é referenciado pela routing table.

---

### F3 — Disciplina de custo do v3

**Objetivo:** o menor custo por run, sem perder cobertura.

**O que fazer:**
- Trazer a essência do
  [RIFT-PLAYBOOKS.md](../Agentes-Pentest/pentest-framework-3/RIFT-PLAYBOOKS.md) do v3
  para o v2: roteamento sob demanda (ler só ~6–12 agentes por stack, não os 85), não
  reler, parar sem sinal, não acumular contexto.
- **Fechar a lacuna de routing** que deixa vuln não-autenticada sem teste (a origem dos
  "23 fantasmas" do v3 e do "descobriu 507 endpoints, testou 8" — ver
  [[agent_architecture_revamp]]). O `coverage-critic` do v2 já existe; garantir que ele
  cobre os agentes portados em F2.

**Pronto quando:** custo por run cai vs. o v2 atual **mantendo** o nº de confirmados de F2.

---

### F4 — Validação (golden test) — o portão

**Objetivo:** provar, com número, que o tronco consolidado é ≥ legacy.

**Critério de aceitação (todos):**
- Reproduz **≥ 9 confirmados** (o baseline de F0) no mesmo alvo.
- Custo **≤ US$ 7,90** no mesmo alvo.
- Falso-positivo **não** aumenta vs. legacy (usar a re-verificação de F0 como régua).

**Pronto quando:** os 3 critérios batem em pelo menos o alvo de referência (idealmente 2).
**Enquanto NÃO bater, legacy/v3 permanecem no seletor.**

---

### F5 — Colapsar o seletor (integração final)

**Objetivo:** de 3 para 1 — de verdade.

**Onde mexe (Rift backend/UI):**
- [backend/src/frameworks.js](../backend/src/frameworks.js) — o `REGISTRY` deixa de
  oferecer legacy/v3 (ou marca como `deprecated`/read-only). `DEFAULT_FRAMEWORK_ID`
  permanece `v2`, agora único.
- [components/engagement/FrameworkSwitcher.tsx](../frontend/components/engagement/FrameworkSwitcher.tsx)
  — some ou vira read-only.
- Watcher volta a um único conjunto de dirs (simplifica `resolveFindingsDirs`).
- Docs: aposentar as menções a A/B/C; este roadmap vira o histórico.

**Decisão a confirmar com o operador:** legacy/v3 saem do seletor mas **ficam no repo**
como oráculo de regressão (recomendado) vs. `rm -rf` total (só depois de F4 sólido).

**Pronto quando:** um engagement novo só tem o tronco; nenhum caminho roda legacy/v3.

---

### F6 — Fase 2: agente autenticado (o objetivo final)

**Objetivo:** o teste logado dentro da aplicação — o "recheio" (re-mapear autenticado,
IDOR/BOLA entre contas, escalada de privilégio, lógica de negócio, encadeamento).

**Ativo-chave (do conselho):** **não escrever do zero.** O legacy já tem o orquestrador
autenticado **realmente escrito** —
[pentest-framework/white-box/orchestrator-wb.md](../Agentes-Pentest/pentest-framework/white-box/orchestrator-wb.md)
(108 linhas: mapeamento autenticado → cross-account/IDOR → escalada → lógica → dados).
Está órfão (dirs de agentes vazios) e desconectado. **Colher isso** = consolidação e
Fase 2 no mesmo movimento.

**O que precisa ser construído (hoje NÃO existe — ver auditoria):**
1. **Coletar credenciais** — campo no intake
   ([frontend/app/(app)/engagement/novo/page.tsx](../frontend/app/(app)/engagement/novo/page.tsx))
   + rota de API ([backend/src/api/engagements.js](../backend/src/api/engagements.js)).
   O gancho já existe morto: `scope.credentials → credential_state` em
   [backend/src/scope.js](../backend/src/scope.js) (`isCredsProvided`) — falta o **produtor**.
2. **Persistir** `context/{id}/credentials.yaml` (o backend nunca escreve isso hoje).
3. **Handoff real** — o botão "Fornecer credenciais"
   ([ExecutionPanel.tsx:401](../frontend/components/engagement/ExecutionPanel.tsx#L401) →
   [page.tsx:181 `handleProvideCredentials`](../frontend/app/(app)/engagement/[id]/page.tsx#L181))
   hoje **só manda texto de chat**. Precisa disparar um `agentRunner.run` com
   `agentRole: 'authenticated'` — hoje **hardcoded** `'blackbox'` em
   [server.js:602](../backend/src/server.js#L602) e default em
   [agent-runner.js:577](../backend/src/agent-runner.js#L577).
4. **Implementar o Agente 2 de fato** — hoje
   [core/agent-2-authenticated.md](../Agentes-Pentest/pentest-framework-v2/core/agent-2-authenticated.md)
   é um **stub de 25 linhas**. Herdar a lógica do `orchestrator-wb.md` do legacy.
   Os agentes autenticados (`idor`, `bola`, `bfla`, `privilege-escalation`,
   business-logic, `post-auth-mapper`, `browser/*`) **já existem no v2** — só estão
   proibidos no Agente 1.
5. **Durabilidade do papel** — campo `agentRole` no `ChatSession` (hoje o papel não persiste).
6. **Evidência autenticada (Playwright)** — **pegadinha conhecida**: o pacote Debian do
   Playwright procura `/usr/bin/node`, mas o Node está no nvm. Opções: symlink
   `/usr/bin/node` (requer sudo) **ou** perfil chromium com cookies de sessão. O
   `tools/screenshot.py` (chromium headless) já funciona para black-box; o autenticado
   precisa injetar cookies.

**Pronto quando:** operador fornece credenciais pela UI → backend grava
`credentials.yaml` → run dispara como `authenticated` → Agente 2 mapeia logado e roda
IDOR/BOLA/escalada → findings e relatório autenticado distinto aparecem no Rift.

> A partir daqui entra o **passo a passo detalhado da Fase 2** que o operador vai
> escrever (gatilho, formato das credenciais, 1 conta vs várias, relatório separado vs
> consolidado, prioridade do que testar logado). Este roadmap prepara o terreno; o
> detalhamento da F6 vem desse passo a passo.

---

## 5. Riscos & mitigações (resumo)

| Risco | Mitigação |
|---|---|
| Decidir sobre N=1 (variância/confound) | **F0** mede antes de qualquer arquivo mudar |
| Recriar os 23 agentes fantasma | Teste de routing: agente sem referência na tabela **falha o build** |
| "Consolidar" e virar 4 | **F5** colapsa o seletor; sucesso = 1 tronco |
| Legacy clandestino | Não aposentar até **F4** passar (golden test) |
| Playwright autenticado | Resolver Node (symlink) OU perfil chromium+cookies — decidir na F6 |
| Perder o anti-FP ao ficar agressivo | Calibração (F1) mantém severidade honesta; re-verificação de F0 é a régua |

---

## 6. Definição de sucesso (o roadmap terminou quando…)

1. Existe **um único** framework de agente rodando no Rift (seletor colapsado).
2. Ele **reproduz ou supera** os 9 confirmados do legacy por **≤ US$ 7,90** no alvo de referência.
3. Falso-positivo **não** piorou vs. legacy.
4. A **Fase 2 autenticada** está funcional: credenciais pela UI → handoff real →
   Agente 2 testa logado → relatório autenticado.

---

## 7. Origem desta decisão

Veredito do **Conselho (llm-council)** de 2026-07-14 — 5 conselheiros + revisão por
pares. Convergências de alta confiança: v2 é o tronco por integração (não por estética);
o músculo é do legacy; a taxonomia do v2 está mal calibrada (falso-negativo);
enxerto só vale se roteado; não apagar antes de validar. Ponto cego pego na revisão:
**o placar é N=1** → medir antes (F0). Ver também [[project_rift_agent_architecture]],
[[rift_jobs_and_v3_revamp]], [[rift_agent_version_selector]], [[agent_architecture_revamp]].
