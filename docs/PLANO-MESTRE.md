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

**Uso hoje:** interno (Porttus/Trustsis).

**Modelo de negócio decidido em 2026-08-01: SaaS — o cliente loga e acompanha os
próprios domínios e achados em tempo real.** Isso não é detalhe de entrega, é o que
define a ordem de engenharia: **a Frente 0 (isolamento por tenant) deixa de ser
item #4 e passa a ser pré-requisito do primeiro cliente externo com login.** Hoje
qualquer usuário autenticado enxerga os engagements de todo mundo (§6).

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

### 3.1. Os 8 P0 da auditoria de 2026-07-20 — 5 fechados, 1 aberto, 2 parciais

O commit `ee776f0` ("remediação completa da auditoria") **não fechou tudo**, apesar
do nome. Estado verificado no código em 2026-08-01:

| P0 | Estado | Evidência |
|---|---|---|
| **P0-1** SSRF no ASM | ✅ | `isIpLiteral` em `api/domains.js`; `isBlockedIp` no caminho de probe de `asm/scanner.js` |
| **P0-2** PII no `fingerprint` | ✅ | `leaks/search.js:35` usa `sha256`, não o e-mail cru |
| **P0-3** gate legal no ingest | ✅ **fechado 2026-08-01** | gate de `Domain.authorized` no núcleo (`leaks/search.js` `ingest()`) + rota exige admin + 403 tipado. `test/leaks-ingest-authz.test.js` |
| **P0-4** security headers | ✅ | `next.config.js` com CSP, HSTS, `frame-ancestors 'none'` |
| **P0-5** narrative por role | ✅ | `api/reports.js:98` retorna 403 para não-admin |
| **P0-6** relatório executivo por metadado | ✅ **fechado 2026-08-01** | `src/report-kind.js`: precedência de diretório (`reports/executive/`) sobre nome + **fail-closed** (nome desconhecido → restrito). `test/report-kind.test.js` |
| **P0-7** fase agressiva no nível de tool | ✅ | hook `aggressive-tools-check.sh` com `RIFT_ALLOW_AGGRESSIVE` |
| **P0-8** API key dedicada + egress | 🟡 **metade de código feita** | ver nota abaixo |

**Nota sobre o P0-8 — a auditoria partiu de uma premissa errada.** Ela assumiu que
`ANTHROPIC_API_KEY`/`CLAUDE_CODE_OAUTH_TOKEN` estavam no ambiente. **Não estão**:
o CLI autentica pelo arquivo `~/.claude/.credentials.json` (assinatura pessoal do
operador). O vetor real de exfiltração não é `env | base64` — é ler esse arquivo,
já que o agente roda Bash arbitrário com `HOME` no ambiente.

Feito em código: `agentCredential()` em `agent-runner.js` suporta
`RIFT_AGENT_ANTHROPIC_API_KEY` (chave dedicada, com precedência) e garante que
**nunca mais de uma credencial** entre no processo do agente; `RIFT_AGENT_CONFIG_DIR`
aponta o CLI para um perfil dedicado; aviso no boot quando roda em credencial
compartilhada.

**Falta (é ação de infra, não de código — não dá para fechar daqui):**
1. Criar a chave dedicada no console da Anthropic, com alerta de custo/uso anômalo,
   e setar `RIFT_AGENT_ANTHROPIC_API_KEY`.
2. Rodar o agente com **usuário de SO / container próprio** — enquanto `HOME`
   apontar para o home do operador, um `cat ~/.claude/.credentials.json` alcança
   a credencial pessoal, independente do que o env do processo carregue.
3. Egress filtering de rede (só alvo autorizado + `api.anthropic.com`) e rotação
   periódica da chave.

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

**Reordenado em 2026-08-01 pela decisão de SaaS.** Na leitura anterior (venda como
serviço, cliente recebendo relatório) a Frente 0 era #4. Com cliente logando, ela
vira #1: é o que separa "produto" de "vazamento cross-organização".

| # | Front | Por que agora | Depende de |
|---|---|---|---|
| **1** | **Frente 0 — isolamento por tenant** ⛔ | **Pré-requisito do primeiro login externo.** Sem isso, o cliente A vê engagement, finding, relatório e WebSocket do cliente B. Não é dívida técnica, é o produto não existir como SaaS. Detalhado em §6. | nada (é o trabalho) |
| **2** | **ASM: monitoramento risk-triggered** 🟡 | Menor esforço / maior retorno, e é o que dá valor recorrente ao login do cliente (ele volta porque algo mudou). Falta gatilho por evento — novo subdomínio, deploy, CVE crítica. | nada |
| **3** | **Agente 2 — pentest autenticado** 🟡 | O pack `web-auth` já coleta credencial e o relatório já sabe gerar variante autenticada. Falta o crawler e o gatilho de handoff. Dobra a profundidade do produto. | nada |
| **4** | **BYOK nível 1 (Agent SDK)** 🔵 | Sobe de #6: em SaaS, custo de inferência por tenant deixa de ser detalhe e vira margem. Troca `spawn('claude')` pelo Claude Agent SDK — resolve chave própria **e** custo/rate-limit previsível. | #1 |
| **5** | **Correlação leve de credenciais** 🟡 | Item mais barato da lista: domínio → empresa → funcionários (Hunter.io, fonte compliant) cruzado com os providers grátis já plugados. Painel dentro do assessment de Domínio. | nada |
| **6** | **Integrações / abas de conexão** 🔵 | Ticketing + MCP client, com dogfooding no próprio GitHub do Rift como critério de pronto. Em SaaS, conexões são por-tenant. | #1 |
| **7** | **Runner interno + transporte de inferência** ⛔ | Peça de infra única que destrava rede-interna always-on, AD e SAP. Caro. | — |
| **8** | **AD → SAP** ⛔ | Sequência decidida: Azure → AD → SAP. SAP é lacuna real de mercado (nenhuma das 12 concorrentes pesquisadas cobre), mas acumula runner novo + maior raio de explosão. | #7 |

### 5.1. O que SaaS acrescenta que ainda não está em lugar nenhum

Não são itens da Frente 0, mas o modelo de assinatura pede e hoje não existem —
registrar para não virar surpresa: onboarding/provisionamento de tenant
self-service, papel de "cliente" distinto de `user` interno (o RBAC hoje só tem
admin/user), billing/limite de consumo por tenant, e trilha de auditoria por
tenant. Decidir escopo disso depois que §6 estiver de pé.

---

## 6. Frente 0 — isolamento por tenant (o gate de venda)

> **Estado em 2026-08-01 (fim do dia): construída, em branch, não mergeada.**
> Branch `feat/frente-0-tenant-isolation`, 3 commits. Backend 490 testes verdes,
> frontend 35. Validada ao vivo com duas contas reais.
>
> | Peça | Estado |
> |---|---|
> | Registry `Tenant` + control/tenant plane | ✅ |
> | Resolver fail-closed + cache de conexões | ✅ |
> | Middleware `req.db` nos 7 routers de dados | ✅ |
> | Rotas e módulos compartilhados escopados (~90 usos) | ✅ |
> | WS recusa `engagementId` de outro tenant | ✅ |
> | Workers iterando tenants (scheduler, asm, jobs, recovers de boot) | ✅ |
> | Migração idempotente executada (origem intacta) | ✅ |
> | Filesystem particionado + fallback para o layout legado | ✅ |
> | Cofre de credenciais chaveado por tenant | ✅ |
> | Papel `client` + matriz de visibilidade na UI | ✅ |
> | Teste-régua cross-tenant (8 superfícies) | ✅ |
> | **ACL intra-tenant por engagement** | ⬜ pendente |
> | **Espelho de `Usage` no control plane** | ⬜ pendente (hoje é fan-out) |
> | **Isolamento do agente por usuário de SO/container** | ⬜ pendente (ver §3.1, P0-8) |
>
> **Contas de demonstração** (criadas por `scripts/seed-tenant-users.js`):
> `operador@porttus.com` (admin/porttus) e `cliente@trustsis.com` (client/trustsis).
>
> **Verificação ao vivo:** operador vê 21 engagements, 111 findings e 9 domínios;
> cliente vê 0 de cada. Cliente informando o id de um engagement da Porttus recebe
> 404 em `/engagements/:id`, `/reports/:id` e `/reports/:id/generated`, lista vazia
> em `/findings` e `/messages`, e 403 no painel admin.

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
