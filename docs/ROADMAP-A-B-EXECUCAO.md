# Rift — Roadmap A + B (Painel de Execução & Confiança/Anti-FP)

> Documento vivo, focado. Consolida a **Etapa A (painel de execução ponta a
> ponta)** e a **Etapa B (lapidar confiança / anti-falso-positivo)** do
> `docs/DIRECAO-PRODUTO.md`, incorporando o feedback de uso de 2026-07-08.
> Complementa `docs/ROADMAP-MELHORIAS.md` (segurança/infra) — aqui é **produto**.
>
> **Regra de ouro (do norte de produto):** não avançar para B antes de A funcionar
> ponta a ponta. Legenda: ⏳ pendente · 🔨 parcial · ✅ feito.

## Status de execução (atualizado 2026-07-08)

- **A-STATE-1..5** ✅ — estado do run derivado do backend (`Engagement.runState`
  idle/running/stopped/completed), broadcast `run_state`, reconcile no boot,
  botão Parar, Continuar/Começar do zero (`resetSession`). No ar.
- **A-LIVE-1** ✅ — strip "Fazendo agora" (fase + comando atual + resumo).
- **A-LIVE-2** ✅ — backend DERIVA `phase_update` (binário Bash + slash-command,
  forward-only) **e MARCOS** (`milestone`: N subdomínios, host vivo, portas abertas,
  stack detectada, WAF, URLs) da SAÍDA real das ferramentas. **Correção-raiz do
  feedback #2:** o parser agora lê `tool_use` aninhado no `assistant` e `tool_result`
  no `user` — antes só o texto saía, então as AÇÕES do agente nunca apareciam.
  Frontend: seção "Marcos do mapeamento". Validar no 1º scan real.
- **A-LIVE-3/4 + B-LINK** ✅ — painel separa **Achados confirmados** (state=confirmed)
  do **Mapa de superfície** (probable/informational); `false_positive` some; cards
  repaginados; hero conta confirmados × superfície.
- **A-INTAKE-1..4** ✅ — "Novo Escopo" abre `/engagement/novo` (form guiado em 2
  etapas, chips + texto livre); só cria o engagement `idle` no fim; grava
  `context/{id}/scope.yaml` + `engagement-state.yaml`. **Nota:** implementado como
  form visual (variante sancionada pelo CLAUDE.md), não como chat conduzido pela
  skill `pentest-intake` — a variante por chat do agente segue pendente.
- **A2/A4** e **Etapa B (B1..B4)** — pendentes (ver abaixo).

### Correções pós-teste (2026-07-08, chat 3)
- **Loop "parado" resolvido:** o run caía no **Opus 4.8**, cujo safeguard de
  cibersegurança recusa os prompts de pentest (`API Error: … safeguards flagged`).
  Agora o `agent-runner` FIXA `--model` (env `AGENT_MODEL`, default `claude-sonnet-5`).
  O backend detecta a recusa e mostra aviso acionável no painel (fim do loop mudo).
  Ver memória [[project_rift_agent_model]].
- **Marcos expansíveis:** cada chip de "Marcos do mapeamento" agora carrega `items`
  (o que foi encontrado) e expande ao clicar.
- **Fix falso-positivo:** "Stack detectada: OPTIONS" (método HTTP tratado como tech)
  — filtro `TECH_STOP` exclui métodos/status.

---

## Feedback de uso (2026-07-08) que este roadmap resolve

1. **"Novo Escopo" está péssimo.** Hoje é um form de 2 campos (nome/alvo) que cria
   o engagement direto. Desejado: o botão leva a uma **tela de intake guiada pelo
   agente** (skill `pentest-intake`); o operador responde tudo; **só então** o
   engagement é criado (estado `idle`, **sem iniciar testes**). Depois o operador
   entra no engagement e clica **"Iniciar mapeamento automático"**.
2. **Durante o run não mostra nada útil** — só "rodando". Deveria trazer **pontos
   importantes de progresso** (o que está sendo descoberto/feito), mas **não** do
   jeito atual de cards de "Achados" (que ficou ruim). Separar *progresso/superfície*
   de *achados confirmados*.
3. **Bug de estado do run + falta de controles.** Saí e voltei ao engagement e ele
   voltou a mostrar "Iniciar mapeamento automático" **mesmo já rodando** (e o status
   no topo dizia "rodando"). Precisa:
   - **travar novo start** para aquele engagement enquanto um run está ativo;
   - botão **"Parar"** para stopar;
   - depois de parado, oferecer **"Continuar"** ou **"Começar do zero"**.

---

## Causa-raiz técnica (já diagnosticada — para o próximo chat não redescobrir)

- **`started` é estado LOCAL da página** (`engagement/[id]/page.tsx`): inicia `false`
  e só vira `true` quando o operador envia algo *nesta* sessão de navegador. Ao
  recarregar/re-entrar, volta a `false` → o CTA "Iniciar" reaparece, enquanto o
  `agentRunning` (vindo do WS, REL-5) diz que está rodando. **As duas fontes
  divergem.** → O estado do run precisa ser **derivado do backend/engagement**, não
  de um flag local.
- **Timeline de fases depende de `phase_update`** (`ExecutionPanel.tsx`): se o agente
  não emite `phase_update` de forma confiável, a timeline fica parada e o painel
  parece "morto" durante o run (só "Procurando…"). → Precisa de sinal de progresso
  confiável (emitido pelo backend/framework) e/ou derivar progresso das ações.
- **Backend já recusa run concorrente** (`agentRunner.runningSessions`) e **já
  reemite `agent_status` na conexão** (REL-5). A base existe; falta a **UI refletir**
  o estado real e faltam **persistência do estado do run** e o **controle de parar**.
- **Parar já existe no protocolo** (`agent_stop` → `agentRunner.stop`), mas não há
  botão dedicado no painel de execução.

---

# ETAPA A — Painel de execução ponta a ponta

### A-INTAKE — "Novo Escopo" vira intake guiado pelo agente (resolve feedback #1)

| Item | Descrição | Aceite |
|---|---|---|
| A-INTAKE-1 | Botão "Novo Escopo" abre uma **tela/rota de intake** (ex.: `/engagement/novo` ou modal em etapas), não o form de 2 campos | Clicar "Novo Escopo" não cria nada ainda; abre o fluxo de intake |
| A-INTAKE-2 | O intake é **conduzido pela skill `pentest-intake`** (agente pergunta alvo, ambiente, intensidade, WAF, foco…). Híbrido: aceita clique (opções via `rift-question`) **e** texto livre | Operador responde as perguntas do agente na tela |
| A-INTAKE-3 | Ao concluir o intake, **cria o engagement em `idle`** (grava `scope.yaml` + `engagement-state.yaml`) e **NÃO inicia testes** | Engagement aparece no dashboard como `idle`, sem run |
| A-INTAKE-4 | Depois, dentro do engagement, o operador vê o CTA **"Iniciar mapeamento automático"** (só aparece quando `idle` e nunca iniciado) | Fluxo: Novo Escopo → intake → cria → entra → Iniciar |

> Nota: a base do intake já existe (`pentest-intake.md`, `context/intake-progress.yaml`,
> `rift-question` → botões). O trabalho é a **casca de UX** (tela dedicada) + amarrar
> "fim do intake ⇒ cria engagement idle".

### A-STATE — Estado real do run + travar start + Parar + Continuar/Zerar (resolve feedback #3)

| Item | Descrição | Aceite |
|---|---|---|
| A-STATE-1 | **Estado do run derivado do backend**, não do flag local `started`. Fonte: `agent_status` (running/idle) + `engagement.status`/`phase` persistidos. Remover a dependência de `started` local | Re-entrar no engagement rodando mostra "rodando" — nunca o CTA "Iniciar" |
| A-STATE-2 | **Travar novo start enquanto rodando**: o CTA "Iniciar" só aparece quando o run está de fato parado/nunca-iniciado. Backend já recusa concorrência; a UI deve espelhar | Impossível disparar 2 runs no mesmo engagement |
| A-STATE-3 | Botão **"Parar"** visível durante o run (emite `agent_stop`) | Clicar Parar encerra o run (backend mata a árvore de processos — já implementado) |
| A-STATE-4 | Persistir um **estado de execução por engagement** (`idle` / `running` / `stopped` / `completed`) que sobreviva à navegação e ao restart do backend (campo no `Engagement` ou no `ChatSession`) | Estado correto após reload e após restart do backend |
| A-STATE-5 | Depois de **parado**, oferecer **"Continuar"** (retoma via `--resume`, aproveitando o estado em disco) ou **"Começar do zero"** (novo run limpo) | Aparecem as duas opções após parar |

### A-LIVE — Representação viva do progresso (resolve feedback #2)

| Item | Descrição | Aceite |
|---|---|---|
| A-LIVE-1 | Durante o run, mostrar **o que o agente está fazendo agora** de forma legível (fase + ação atual + 1 linha de resumo), não só o spinner "rodando" | Operador entende o progresso sem abrir o feed cru |
| A-LIVE-2 | Emitir/−derivar **progresso confiável**: backend/framework emite `phase_update` em cada transição real de fase (recon→enum→vuln) e marcos (host vivo, stack detectada, superfície mapeada) | Timeline de fases avança de verdade durante o run |
| A-LIVE-3 | **Separar "Pontos de superfície/progresso" de "Achados confirmados".** Os "pontos importantes" (hosts, tecnologias, exposições observadas) aparecem como **mapa de superfície/observações**; só `state: confirmed` aparece como "Achado". Repaginar os cards de achados (o formato atual ficou ruim) | Painel distingue claramente progresso (muito) de achados confirmados (poucos) |
| A-LIVE-4 | Amarrar A-LIVE-3 à taxonomia (ver Etapa B): `informational`/`probable` = superfície/pistas; `confirmed` = achado. Evita o "muro de cards" ruidoso | Ruído baixo: poucos achados, muito mapa |

### A2 / A4 — restantes da Etapa A

| Item | Descrição | Estado |
|---|---|---|
| A2 | **Auto-run do Agente 1** — CTA encadeia recon→enum→vuln sem pedir confirmação entre fases; pausa só em checkpoint real. (Depende de A-LIVE-2 para o `phase_update` confiável) | 🔨 parcial |
| A4 | **Notificações in-app** — toast/badge nos checkpoints (além do prompt clicável `rift-question`) e ao concluir o mapeamento | ⏳ |

---

# ETAPA B — Confiança / Anti-Falso-Positivo

> Base já entregue em 2026-07-07 (framework, commit `9c35179`): skill
> `finding-quality.md` (verificação adversarial), `CLAUDE.md` com esquema `state`,
> `pentest-report` segmentado, taxonomia com regras de adversarial+evidência.
> Ver `docs/ROADMAP-HARDENING.md` / `docs/ROADMAP-MELHORIAS.md` (ANTI-FP-5B).

| Item | Descrição | Estado |
|---|---|---|
| B0 | Gate anti-FP nos choke-points (CLAUDE.md, `pentest-vuln`, `pentest-report`, taxonomia) | ✅ feito |
| B1 | **Propagar o gate para os ~80 agentes individuais** — cada agente aplica `finding-quality.md` (confirmar-ou-rebaixar, evidência, adversarial) antes de gravar. Hoje só os choke-points e 2 agentes exemplares (`security-headers`, `exposed-secrets`) seguem | ⏳ |
| B2 | **Score de confiança por finding** exposto na UI (high/medium/low) + filtro; ordenar por confiança×severidade | ⏳ |
| B3 | **Evidência obrigatória visível**: print (`tools/screenshot.py`) e request/response anexados ao achado confirmado, renderizados no painel e no relatório | 🔨 parcial (screenshot existe; falta amarrar na UI) |
| B4 | **Loop de FP**: botão "isto é falso positivo" no achado → grava em `memory/global/false-positives.yaml` (fecha o ciclo e treina o re-scan) | ⏳ |
| B-LINK | A-LIVE-3/4 consomem a taxonomia: `confirmed` = achado; `probable`/`informational` = superfície. **É o encontro de A e B** — o painel de execução só é "baixo ruído" se a classificação (B) estiver correta | ⏳ |

---

## Sequência recomendada (para o próximo chat)

1. **A-STATE** primeiro (é bug ativo e barato): estado real do run + travar start +
   Parar + Continuar/Zerar. Sem isso o painel "mente" sobre o que está rodando.
2. **A-LIVE-1/2**: dar vida ao run (progresso legível + `phase_update` confiável).
3. **A-INTAKE**: "Novo Escopo" → intake guiado → cria `idle` → Iniciar.
4. **A-LIVE-3/4 + B-LINK**: separar superfície de achados; repaginar cards (usa a
   taxonomia da Etapa B).
5. **A2/A4**: fechar auto-run + notificações.
6. **Etapa B** a fundo: B1 (propagar gate) → B2 (score) → B3 (evidência na UI) →
   B4 (loop de FP).

## Critério de "A pronto" (gate para começar B a fundo)
Novo Escopo → intake guiado cria engagement `idle` → operador entra → "Iniciar" →
painel mostra progresso vivo e real → dá para **Parar** → ao voltar, o estado está
correto (nunca oferece "Iniciar" com run ativo) → ao parar, oferece Continuar/Zerar
→ achados confirmados aparecem separados do mapa de superfície.
