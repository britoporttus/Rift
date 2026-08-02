# Rift — Plano Mestre

> **Este é o documento de entrada do produto.** Consolida posicionamento, a espinha
> do produto, o estado real do código e a ordem de execução. Data-base: 2026-08-01.
>
> Existem 13 roadmaps neste diretório, escritos em momentos diferentes e com
> prioridades diferentes — foi essa fragmentação que produziu o sintoma de
> "trabalhar em várias frentes e nenhuma ficar boa". **Este arquivo passa a ser a
> fonte única de ordem e prioridade.** Os demais continuam válidos como
> *referência técnica de como cada peça se constrói* (§7), não como fila de
> trabalho.
>
> Legenda: `✅` no ar · `🟡` parcial · `🔵` planejado · `⛔` bloqueado por infra

---

## 1. Posicionamento (uma frase)

O Rift é a **camada de cobertura automática de segurança**: mapeia a superfície
externa e interna de um alvo, roda as checagens repetíveis com um agente de IA, e
entrega **poucos achados de alta confiança** — a primeira passada confiável antes
do pentester humano, não um substituto dele.

**O diferencial não é achar mais, é achar certo.** A adesão a pentest automatizado
é baixa por causa de falso positivo; baixo ruído é o que transforma a ferramenta em
produto vendável.

**Uso hoje:** interno (Porttus/Trustsis), com um slice sendo lapidado para venda.

---

## 2. A espinha do produto (o fluxo que tudo tem que servir)

Toda tela existe para servir **um** caminho. Se uma tela não está neste caminho ou
não leva de volta a ele, ela é um beco:

```
Domínio (alvo)  →  Novo Pentest  →  Execução (agente)  →  Achados  →  Relatório
     ▲                                                        │
     └──────────────── monitoramento contínuo ◄───────────────┘
```

**Regra de coesão:** de qualquer tela do caminho o operador tem que conseguir ir
para a anterior e a seguinte **sem passar pelo menu**. O menu é atalho, não é o
único caminho.

---

## 3. O que existe hoje (estado real do código)

| Módulo | Estado | Observação |
|---|---|---|
| **Domínios / ASM externo** | ✅ | subfinder → DNS → httpx → nuclei → portas → ASN; score 0–100 explicável; takeover; DNS bruteforce; screenshots; diff de superfície. Determinístico, **sem gastar token de IA**. |
| **Rede Interna** | ✅ MVP | agente local (Windows/Linux), inventário, classificação de dispositivo, score, recomendações + CSV, topologia React Flow. Always-on depende do Runner. |
| **Pentest Web/API (Agente 1, black-box)** | ✅ | intake, execução ao vivo por WebSocket, taxonomia anti-FP, Jobs com fila durável. |
| **Pentest autenticado (Agente 2)** | 🟡 stub | pack `web-auth` coleta credencial e instrui o agente; falta o crawler autenticado e o gatilho de handoff. |
| **Cloud / Azure** | ✅ | Service Principal + cofre de credencial efêmero. |
| **Mapa de superfície** | ✅ | mind-map React Flow ligando domínios, IPs, tecnologias e findings. |
| **Relatórios** | ✅ | executivo e técnico, HTML + PDF (Chromium). |
| **Vazamentos** | 🟡 represado | "buy, not build" para coleta de stealer logs. Dados e lógica preservados atrás de `RIFT_LEAKS_ENABLED`. |
| **Plataforma** | ✅ | SSO Azure, RBAC admin/user, cookie HttpOnly, CSP, anti-SSRF, painel admin, ~430 testes, CI + deploy em merge. |
| **Isolamento por tenant** | ⛔ ausente | **é o gate de venda externa** — ver §6. |

### 3.1. Os 8 P0 da auditoria de 2026-07-20 estão fechados

Corrigidos no commit `ee776f0`, cada um com teste. Isso muda a leitura do gate de
venda: **o que falta para expor a plataforma a um cliente externo não são mais os
P0 — é o isolamento por tenant e a ACL por engagement.**

---

## 4. Ciclo em execução: coesão + apresentação (2026-08-01)

**Decisão do operador:** foco em coesão e apresentação; uso segue interno; a Frente 0
não bloqueia agora.

### 4.1. Diagnóstico que originou o ciclo

Não era um problema de cor — era de **information design** e de **grafo de
navegação**:

- `/dashboard` virou um `redirect`, mas continuava sendo o destino do "voltar" do
  engagement: quem entrava por um domínio voltava para a lista, perdendo o contexto.
- `/novo-pentest` — a ação central do produto — só era alcançável a partir de
  `/dominios`.
- `/findings` e `/reports` eram **becos**: estavam no menu, mas nenhuma tela levava
  a elas com contexto, e não aceitavam filtro por domínio ou engagement.
- O breadcrumb usava match exato de rota, então **sumia justamente nas telas de
  detalhe** (`/dominios/[id]`, `/engagement/[id]`, `/rede-interna/[id]`).
- Em `/admin/users`, dois itens do menu acendiam como ativos ao mesmo tempo.
- `/reports` buscava os arquivos narrativos do agente, contava no cabeçalho e
  **nunca os renderizava**.
- O assessment de domínio empilhava 12 seções de largura total, todas expandidas,
  todas com o mesmo peso visual — incluindo 30 scans de histórico inline.
- Cada tela redefinia o próprio `Card`/`Chip`/`Badge`/`Kpi` inline, com raios e
  paddings diferentes: o app parecia seis produtos distintos.

### 4.2. Princípios adotados (valem para toda tela nova)

1. **Um veredito por tela.** O topo responde uma pergunta só. Em Domínio é "quão
   exposto está este alvo?"; em Findings é "o que exige ação agora?".
2. **Detalhe sob demanda.** Inventário e histórico entram colapsados, com resumo
   visível na barra — fechado ainda informa. Só o acionável abre por padrão.
3. **Número que não navega é decoração.** KPI relevante vira porta de entrada.
4. **Toda tela de detalhe oferece as saídas do fluxo** (§2), não só o "voltar".
5. **Kit antes de tela.** Primitivo novo entra em `components/ui/kit.tsx`; tela não
   recria `Card`/`Badge`/`Chip`/`Kpi`.
6. Vazio é informação: "nenhuma exposição acionável" é uma boa notícia e deve ser
   dita como tal, não renderizada como lista vazia.

### 4.3. Entregue neste ciclo

- **`components/ui/kit.tsx`** — `Page`, `PageHeader`, `Card`, `Collapsible`, `Kpi`,
  `Badge`, `Chip`, `Btn`, `EmptyState`, `Skeleton`, escala de raio/espaçamento e o
  helper `tint()` (que evita o bug recorrente de `${cor}NN` com `var()`).
- **Navegação** — sidebar em três grupos (Superfície / Resultados / Sistema) com
  "Novo Pentest" como ação primária fixa; item ativo resolvido pela rota mais
  específica; breadcrumb navegável que funciona nas telas de detalhe.
- **Deep links** — `/findings?domain=|engagement=|severity=` e
  `/reports?domain=|engagement=`, com faixa de escopo e saída para a visão global.
- **Assessment de domínio** reorganizado em veredito → ações → exige atenção →
  detalhe colapsado, com 4 tiles de saída (novo pentest, findings, relatórios, mapa).
- **Engagement** — "voltar" resolve o domínio de origem; corrigido o `100vh` dentro
  do layout que gerava scroll fantasma.
- **Relatórios** — arquivos do agente agora aparecem; cada linha liga para
  engagement, domínio e achados.

---

## 5. Fronts em ordem (depois deste ciclo)

Ordem definida pela combinação de **valor de negócio × custo × dependência**. Um
front por vez até estar bom — foi a dispersão que causou o problema original.

| # | Front | Por que agora | Depende de |
|---|---|---|---|
| **1** | **ASM: monitoramento risk-triggered** 🟡 | Menor esforço / maior retorno. Já existe scan agendado; falta gatilho por evento (novo subdomínio, deploy, CVE crítica). É o que sustenta a promessa de "monitoramento contínuo". | nada |
| **2** | **Agente 2 — pentest autenticado** 🟡 | O pack `web-auth` já coleta credencial e o relatório já sabe gerar variante autenticada. Falta o crawler e o gatilho de handoff. Dobra a profundidade do produto. | nada |
| **3** | **Correlação leve de credenciais** 🟡 | Item mais barato da lista: domínio → empresa → funcionários (Hunter.io, fonte compliant) cruzado com os providers grátis já plugados. Vive como painel dentro do assessment de Domínio. | nada |
| **4** | **Frente 0 — isolamento por tenant** ⛔ | **Gate de venda externa.** Detalhado em §6. Subir para #1 no instante em que alguém de fora precisar de login. | nada (é o trabalho) |
| **5** | **Integrações / abas de conexão** 🔵 | Ticketing + MCP client, com dogfooding no próprio GitHub do Rift como critério de pronto. | ganha de tenant |
| **6** | **BYOK nível 1 (Agent SDK)** 🔵 | Troca `spawn('claude')` pelo Claude Agent SDK: resolve chave própria **e** custo/rate-limit previsível no mesmo trabalho. | tenant |
| **7** | **Runner interno + transporte de inferência** ⛔ | Peça de infra única que destrava rede-interna always-on, AD e SAP. Caro; só depois de 1–4. | — |
| **8** | **AD → SAP** ⛔ | Sequência decidida: Azure → AD → SAP. SAP é lacuna real de mercado (nenhuma das 12 concorrentes pesquisadas cobre), mas acumula runner novo + maior raio de explosão. | #7 |

---

## 6. Frente 0 — isolamento por tenant (o gate de venda)

**Modelo escolhido:** banco por cliente, conexão resolvida por tenant em tempo de
request. O mesmo código serve bancos co-locados num cluster compartilhado (barato
agora) e instância dedicada por cliente (só muda a connection string no registro do
tenant — upgrade de *deploy*, não de código).

- **Control plane** (`rift_control`): `User`, `Tenant`, sessão/auth, audit global.
  O login precisa resolver **antes** de saber o tenant.
- **Tenant plane** (`rift_t_<slug>`): `Engagement`, `Finding`, `DomainAsset`,
  `LeakedCredential`, `ChatSession/Message`, `Usage`, `Job`, grafo, relatórios.
- `porttus` e `trustsis` são os **dois tenants-semente**.

**O isolamento não pode parar no Mongo:** particionar também
`context/{tenantId}/`, `clients/{tenantId}/`, `memory/{tenantId}/`, chavear o
cred-vault por `tenantId+engagementId`, e restringir o `cwd`/env do
`agent-runner` aos diretórios do tenant.

**Ordem:** registry → models por conexão (o passo mais invasivo: todos os models
viram factory sobre a `Connection`) → middleware resolver com cache
`Map<tenantId, Connection>` → escopar rotas → WS recusa `engagementId` de outro
tenant → migração idempotente com `--dry-run` → filesystem/vault/runner → ACL
intra-tenant por engagement → admin com fan-out por tenant.

**Teste-régua:** usuário do tenant A não enxerga engagement / finding / report / WS
do tenant B. Falha hoje, tem que passar depois — em todas as superfícies, inclusive
disco e vault.

**Decisões ainda abertas** (responder antes de começar):
1. Engagements órfãos na migração — atribuir ao tenant do criador ou quarentenar num
   tenant `unassigned`?
2. `Usage` e `Job` ficam no control plane ou no tenant plane? (`Job` carrega
   engagement → tende a tenant; `Usage` alimenta o painel admin agregado → precisa de
   fan-out ou espelho no control.)

**Pronto quando:** dois tenants isolados, teste de vazamento cross-tenant verde em
todas as superfícies, ACL intra-tenant ativa para não-admin, suíte de regressão
verde e nenhum engagement existente mudando de comportamento dentro do seu tenant.

---

## 7. Mapa dos outros documentos

Estes continuam valendo como **referência técnica**, não como fila de trabalho:

| Documento | Serve para |
|---|---|
| `ROADMAP-AUDITORIA-2026-07-20.md` | detalhe de cada P0–P3 e do raciocínio de segurança (P0 já fechados) |
| `ROADMAP-MULTI-DOMINIO.md` | como construir domain packs / sequência Azure→AD→SAP |
| `ROADMAP-CONSOLIDACAO-AGENTE.md` | arquitetura do agente e por que não fragmentar em 6 |
| `ARQUITETURA-AGENTES.md` | modelo de 2 fases (black-box → autenticado) |
| `DIRECAO-PRODUTO.md` | tese anti-falso-positivo e formato "painel", não chatbot |
| `RIFT-FEATURES-E-EPICOS.md` | panorama para stakeholder / plano de negócio |
| `roadmap-mapa-de-superfície.md` | como o grafo é construído |
| `APP-RIFT.md` | inventário de telas — **desatualizado desde 2026-07-07**, tratar com ceticismo |
| `ROADMAP-PRODUTO-2026-07-27.md`, `ROADMAP-A-B-EXECUCAO.md`, `ROADMAP-MELHORIAS*.md`, `ROADMAP-HARDENING.md`, `Rift-Roadmap.md`, `ROADMAP.md` | histórico de decisão; **ordem substituída por §5 deste documento** |

---

## 8. Regra de ouro (herdada, continua valendo)

Nenhuma tarefa vira "feito" sem **(a)** teste que falharia antes e passa depois,
**(b)** verificação de regressão, **(c)** resumo curto (causa · arquivos · solução ·
testes · pendências). Não alterar schema, autenticação, contratos de API ou
estrutura persistida sem checar impacto downstream.
