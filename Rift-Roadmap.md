# Rift — Roadmap Estratégico & Análise de Mercado

> **Propósito deste documento:** servir de base para o agente de desenvolvimento validar, criticar e consolidar a direção do produto. Estrutura: **o que temos hoje → mercado (com métricas) → gaps → onde vamos chegar → roadmap faseado → KPIs → perguntas de validação.**
>
> **Categoria-alvo:** motor de pentest autônomo contínuo (PTaaS/CTEM com músculo ofensivo real), evoluindo para *Evidence-Based Continuous Assurance* de terceiros.
>
> **Contexto de uso:** hoje **plataforma interna de monitoramento**. Se validar e escalar → **produto SaaS de mercado**. Cada fase abaixo marca o que é "interno" vs "mercado".
>
> **Data-base:** julho/2026. Fontes ao final.

---

## 1. O que temos hoje (estado atual — v0.1.1)

Baseado no repositório `britoporttus/Rift` (`CLAUDE.md`, `package.json`).

**Arquitetura atual**

- **Stack:** Next.js 14 (frontend) + Node.js/Express + WebSocket + SSH2. Monorepo com workspaces (`frontend`, `backend`). ~70% TypeScript.
- **Motor:** camada web sobre o `pentest-framework-v2` (agente ofensivo já existente, roda via `child_process.spawn('claude', …)` na mesma VPS). Usa assinatura Claude Code, ainda **não** a Anthropic API.
- **Fases do agente:** recon → enum → exploit → post. Skills em `.claude/commands/` (`/pentest-recon`, `/pentest-enum`, etc.).
- **Persistência:** `knowledge-base/` em SQLite (histórico de findings); estado por engagement em `context/`.

**Funcionalidades já entregues / previstas no design**

| Capacidade | Status |
|---|---|
| Chat com feed do agente em tempo real (WebSocket) | ✅ core |
| Findings ao vivo por severidade | ✅ core |
| Pentest **web** e **web+API** (agêntico) | ✅ diferencial |
| Relatórios executivo + técnico (PDF/HTML) | ✅ |
| Painel admin: CPU/RAM/disco + tokens + custo (USD) | ✅ |
| Roles: admin (fases agressivas) / user (passivas) | ✅ |
| Checkpoints humanos (aprovar RCE/SQLi) — *human-in-the-loop* | ✅ diferencial |
| Intake de escopo (form + chat `/pentest-intake`) | ✅ |
| Watcher de findings (inotify) | ✅ |

**Limitações estruturais conhecidas (dívida técnica assumida)**

1. **Single-tenant, 1 VPS, sem multi-tenancy.**
2. **`spawn claude` não escala** para N engagements simultâneos (sem fila/isolamento).
3. **Dependência da assinatura Claude Code** (sem previsibilidade de custo/rate-limit de produto).
4. **Intake manual** — sem descoberta automática de ativos (ASM) na frente.

> **Leitura:** o Rift já nasceu na categoria mais quente e mais difícil de replicar (pentest agêntico web+API com human-in-the-loop). O motor é o **moat**. As lacunas são de *produtização e escala*, não de tese.

---

## 2. Panorama de mercado (com métricas — jul/2026)

Três "mundos" que o Rift toca. A tese é consolidá-los.

### 2.1 Mundo A — Pentest / PTaaS / pentest autônomo (o comportamento do Rift)

- **PTaaS:** US$ 0,72 bi (2026) → **US$ 1,98 bi (2031)**, **CAGR 22,6%**. Segmento *plataforma* = 75,2% do mercado; **SMEs crescem 24,6% a.a.** (maior CAGR por porte); **cloud pentest 25,8% a.a.** (maior por superfície); Norte América 41,3%.
- **Pentest autônomo com IA** é a fronteira: **XBOW** chegou a **#1 no HackerOne global** (abr/2026), fez **~1.060 submissões**, e completou em **28 min** o que um pentester sênior levou **40 h (~85x mais rápido)**. Levantou **US$ 237 mi**, avaliação > US$ 1 bi.
- Consenso 2026: modelo **híbrido** — "IA faz a largura, humano faz a profundidade".
- **Preços de referência:** Cobalt US$ 65k–300k+/ano (plataforma US$ 15k–75k+); NodeZero US$ 10k–30k/ano; Pentest-Tools US$ 95–190/usuário/mês; ImmuniWeb free-forever + tiers.

**Plataformas que replicam o comportamento do Rift**

| Fornecedor | Modelo | Autônomo/IA | Web+API | ASM | Human-in-loop | Nota vs Rift |
|---|---|---|---|---|---|---|
| **XBOW** | Pentest autônomo IA | ●●● (líder) | ● | ◐ | ◐ (revisão pré-envio) | Referência técnica; sem TPRM/assurance |
| **NodeZero** (Horizon3) | Pentest autônomo | ●● | ● | ● | ○ | Interno/externo/cloud + AD |
| **Pentera** | Automated security validation | ●● | ● | ◐ | ○ | Validação de controles (BAS) |
| **Cobalt / Synack** | PTaaS + crowd | ◐ IA-assist | ● | ◐ | ● (crowd humano) | Forte em operação; IA incipiente |
| **BreachLock / NetSPI** | PTaaS + ASM + AEV | ● | ● | ● | ● | Convergência PTaaS+ASM |
| **ImmuniWeb** | AppSec + CTEM + EASM + dark web + **TPRM** | ● | ● | ● | ● | Maior convergência pública (inclui TPRM) |
| **Pentest-Tools / Astra** | Scanner + PTaaS SMB | ◐ | ● | ◐ | ◐ | Faixa mid-market/SMB, preço baixo |

### 2.2 Mundo B — Infostealer / credenciais vazadas

- **Escala:** 1,8 bi de credenciais roubadas por infostealers de 5,8 mi de dispositivos (Flashpoint); **2,86 bi de credenciais comprometidas** (KELA, *State of Cybercrime 2026*), incluindo cookies de sessão que burlam 2FA.
- **Impacto:** credenciais/cookies roubados aparecem em **86% dos vazamentos**; **54% das vítimas de ransomware** tiveram credenciais de domínio em *stealer logs* antes do ataque (Verizon DBIR 2025) — janela típica de **2 dias** entre credencial no mercado e incidente.
- **Junho/2026:** base de **24 bi de registros** de credenciais encontrada exposta, enriquecida com dados de CVE ao vivo para priorizar alvos.
- **Player de referência:** **Hudson Rock** — base de **30M+ máquinas infectadas**, produto *Cavalier*, feed via API. Concorrente próximo: SpyCloud.

**Gap central:** ninguém correlaciona bem **credencial vazada ↔ ativo exposto ↔ explorabilidade**. Hudson Rock dá a credencial; o ASM dá o ativo; o pentest prova a exploração. O Rift pode ser o único a **fechar os três**.

### 2.3 Mundo C — TPRM (terceiros)

- **Tamanho:** ~US$ 10,6 bi (2026), **CAGR ~14–16%**, → ~US$ 20,7 bi (2031).
- **Players:** SecurityScorecard, BitSight, UpGuard, Panorays, OneTrust, Prevalent. UpGuard publica preço (~US$ 1.750/mês para 50 fornecedores).
- **Modelo dominante:** questionários + security ratings externos + monitoramento contínuo. **Baseado em declaração**, não em teste real.

**Gap central:** TPRM é *trust me* (questionário/score). Nenhum grande player tem motor ofensivo próprio para **provar** a postura do fornecedor. É exatamente o que o Rift tem.

### 2.4 Guarda-chuva — CTEM (onde tudo converge)

- **Tamanho:** US$ 2,7 bi (2025) → **US$ 7,0 bi (2033)**, CAGR 12,7%.
- **Lacuna de adoção:** **87% reconhecem o valor do CTEM, só 16% implementaram** (gap de 71 pontos). A maioria falha na **validação** (provar exploração) e na **mobilização** (achado chegar à engenharia com contexto).

---

## 3. Gaps que podemos suprir

### 3.1 Gaps internos do Rift (bloqueiam escala)

| # | Gap | Severidade | Fase |
|---|---|---|---|
| I-1 | Multi-tenancy / isolamento de clientes | 🔴 crítico | F0 |
| I-2 | Fila + isolamento de execução (container/job por engagement) | 🔴 crítico | F0 |
| I-3 | Descoberta de ativos (ASM) antes do teste | 🟠 alto | F1 |
| I-4 | Métricas de qualidade (falso-positivo, % validado, tempo/fase) | 🟠 alto | F0/F1 |
| I-5 | Migração para Anthropic API (custo/rate previsível) | 🟡 médio | F2 |
| I-6 | Trigger por evento (deploy, novo endpoint, CVE) | 🟠 alto | F1 |

### 3.2 Gaps de mercado que o Rift pode ocupar

| # | Gap de mercado | Quem falha hoje | Como o Rift supre |
|---|---|---|---|
| M-1 | Loop **ASM → pentest → validação → remediação** fechado num só lugar | Todos (integração é dor #1 do CTEM) | Motor + ASM + watcher já existentes |
| M-2 | **Validação real** de exploração (não só score/detecção) | TPRM e ASM param no "porta aberta" | Agente ofensivo prova a exploração |
| M-3 | Correlação **credencial vazada ↔ ativo ↔ exploit** | Hudson Rock/ASM isolados | Feed de credenciais + ASM + pentest |
| M-4 | **Evidence-Based TPRM** (terceiro *prova*, não *declara*) | SecurityScorecard, Panorays, UpGuard | Único com motor de teste próprio |
| M-5 | **Risk-Triggered Pentesting** (teste disparado por mudança/risco) | Mercado é calendário/on-demand | Watcher + gatilhos de evento |
| M-6 | **Attack-path** (12 caminhos, não 5.000 findings) | Inconsistente no mercado | knowledge-base + correlação |
| M-7 | Preço **mid-market / LATAM** + **compliance BR (LGPD, BACEN)** | Líderes são caros/enterprise/US | Custo/eficiência do motor agêntico |

---

## 4. Onde vamos chegar (visão & posicionamento)

**Ponto de chegada (norte de 3–5 anos):**

> **Rift — Evidence-Based Continuous Cyber Assurance.**
> Plataforma que, em vez de vender relatórios de pentest, entrega **garantia contínua e verificável** de que ativos próprios e de terceiros permanecem testados e resistentes — combinando motor ofensivo autônomo, inteligência de credenciais vazadas e governança de risco de terceiros.

**Três pilares de diferenciação (consolidando os dois mundos):**

1. **Motor ofensivo contínuo** (Mundo A) — o moat técnico; o que o Rift já é.
2. **Inteligência de exposição** (Mundo B) — credenciais vazadas + ASM correlacionadas à explorabilidade.
3. **Assurance de terceiros baseada em evidência** (Mundo C) — TPRM que *prova* via motor, não via questionário.

**Regra de ouro da sequência:** construir **motor → inteligência → governança**, nunca o contrário. TPRM sem motor = "mais um GRC" (entramos fracos). TPRM *sobre* o motor = moat que os concorrentes de TPRM não copiam.

---

## 5. Roadmap faseado

Cada fase tem: **objetivo, features (amarradas ao repo), entregável, KPIs de saída, interno/mercado.** Estimativas de duração são indicativas para 1 time pequeno.

### F0 — Produtizar o núcleo (0–4 meses) · *interno*

**Objetivo:** transformar o protótipo single-tenant num motor multi-cliente escalável e mensurável.

- **Multi-tenancy** (I-1): isolamento lógico de dados por org/tenant; `tenant_id` em auth (JWT já existe), engagements, findings, reports.
- **Fila + isolamento de execução** (I-2): job queue (ex.: BullMQ/Redis) + 1 container por engagement em vez de `spawn` direto na VPS. Limite de concorrência configurável.
- **Instrumentação de qualidade** (I-4): registrar por engagement — tempo por fase, custo/tokens (já existe), **taxa de falso-positivo**, **% de findings validados** (com prova), MTTR.
- **Hardening**: segregação de credenciais por tenant; auditoria de ações.

**Entregável:** motor multi-tenant com painel de métricas de qualidade.
**KPIs de saída:** ≥ 5 engagements simultâneos estáveis; dashboard mostrando FP-rate e %-validado; custo/engagement previsível.

### F1 — Fechar o loop de descoberta + trigger (4–8 meses) · *interno → early mercado*

**Objetivo:** de "pentest sob demanda" para "monitoramento contínuo acionado por risco" — o encaixe perfeito com o uso interno.

- **ASM leve na frente** (I-3, M-1): integrar Subfinder + httpx + Nuclei (MIT) → o agente descobre o ativo e já dispara o teste. Reaproveita o padrão de skills do framework.
- **Risk-Triggered Pentesting** (I-6, M-5): gatilhos → novo subdomínio/endpoint, deploy, mudança de infra, **CVE crítica**. O watcher decide: nenhum teste / validação automatizada / teste direcionado / revisão humana.
- **Attack-path v1** (M-6): correlacionar findings do knowledge-base em caminhos; relatório "N caminhos relevantes" em vez de lista bruta.

**Entregável:** cobertura contínua da superfície própria + testes automáticos por evento.
**KPIs de saída:** 100% dos ativos internos monitorados; tempo médio evento→teste < 1 h; ≥ 1 attack-path relevante por engagement médio.

### F2 — Inteligência de exposição (8–14 meses) · *mercado*

**Objetivo:** somar o Mundo B (credenciais vazadas) e amadurecer a validação.

- **Feed de credenciais vazadas** (M-3): integração/parceria (Hudson Rock/SpyCloud API) → alerta de credencial de domínio/colaborador exposta.
- **Correlação credencial ↔ ativo ↔ exploit** (M-3): a credencial vazada abre *este* painel exposto? O agente valida.
- **Redução de falso-positivo / prova automática** (M-2): meta FP < 5%; todo finding "alto/crítico" com evidência de exploração.
- **Migração para Anthropic API** (I-5): custo e rate-limit previsíveis para SaaS.

**Entregável:** exposure management de verdade (não só pentest).
**KPIs de saída:** FP-rate < 5%; correlação credencial↔ativo automática; custo/token sob API previsível.

### F3 — Assurance & TPRM baseado em evidência (14–22 meses) · *mercado*

**Objetivo:** somar o Mundo C — mas *sobre* o motor.

- **Módulo TPRM sobre o motor** (M-4): cadastro de fornecedores, criticidade, vínculo fornecedor↔ativo↔serviço.
- **Cybersecurity Passport / Trust Center**: fornecedor prova segurança uma vez, compartilha evidência verificável com N clientes (efeito de rede).
- **Evidence-Based questionnaires**: níveis Declarado → Documentado → Comprovado → Monitorado → **Testado**.
- **Mobilização** (gap CTEM): handoff estruturado achado→engenharia (Jira/Azure DevOps/ServiceNow) com contexto; reteste.
- **Compliance BR** (M-7): LGPD, BACEN, ISO 27001, SOC 2.

**Entregável:** posicionamento "Evidence-Based Continuous Assurance".
**KPIs de saída:** primeiro fornecedor externo testado ponta-a-ponta; ≥ 1 Trust Center compartilhado; SLA de mobilização medido.

### F4 — Diferenciais avançados (22+ meses) · *mercado / P&D*

Explorar conforme tração — **não** roadmap comprometido:

- **Offensive Agent Swarm** (agentes especializados cooperando em cadeias).
- **Digital Offensive Twin** (simulação de caminhos de ataque ponta-a-ponta).
- **Memória ofensiva permanente** (cada ciclo continua de onde o anterior parou — já há base no SQLite).
- Pentest nativo de **IA/LLM** (OWASP LLM Top 10, prompt injection, MCP abuse).
- **Verified Resilience Index (VRI)** — score próprio baseado em testes reais.

⚠️ **Tratar com ceticismo (alto risco, baixa aderência ao core):** garantia integrada a cyber insurance; closed-loop remediation aplicando patch em produção; marketplace de pentesters. Boas de slide, caras de entregar.

---

## 6. KPIs & benchmarks-alvo (medir contra o mercado)

| Métrica | Benchmark de mercado | Meta Rift | Fase |
|---|---|---|---|
| Tempo de teste vs humano | XBOW ~85x (28 min vs 40 h) | ≥ 20x na F1, mirar 50x | F1+ |
| Falso-positivo | < 5% (padrão de plataformas sérias) | < 5% | F2 |
| % findings validados (com exploit) | Diferencia de scanner | > 80% dos high/critical | F2 |
| Custo/engagement | Cobalt US$ 65k–300k/ano; NodeZero US$ 10–30k | Previsível e < 1/3 do incumbente | F0/F2 |
| Cobertura de superfície | ASM contínuo | 100% ativos internos | F1 |
| Tempo evento→teste | Mercado = calendário | < 1 h | F1 |
| MTTR (achado→remediação) | Etapa que 71% dos CTEM falham | Medir e reduzir a cada ciclo | F3 |
| Concorrência de engagements | — | ≥ 5 (F0) → ≥ 50 (F2) | F0/F2 |

---

## 7. Riscos & decisões em aberto

1. **Escopo x foco:** a análise anterior lista ~40 features. Risco de morrer por escopo. **Decisão:** motor primeiro; TPRM/assurance só na F3.
2. **Dependência Claude Code:** ok interno; **bloqueador** para SaaS (F2 resolve via API).
3. **Legal/ético do motor ofensivo:** Rules of Engagement digital + autorização por escopo são pré-requisito antes de qualquer teste externo (F3).
4. **Credenciais vazadas:** comprar feed (Hudson Rock/SpyCloud) vs construir coleta própria — provável **comprar** primeiro.
5. **Interno → mercado:** multi-tenancy (F0) é o que permite virar produto sem reescrever.

---

## 8. Perguntas para o agente validar

1. A sequência **motor → inteligência → governança** (F0→F3) está tecnicamente coerente com o monorepo atual? Onde o `spawn claude` + fila quebra?
2. Multi-tenancy: isolamento **lógico** (tenant_id) é suficiente na F0, ou precisa isolamento físico (DB/container por tenant) desde já?
3. A fila/isolamento por engagement — BullMQ+Redis+containers é o caminho, ou há opção mais simples dado 1 VPS?
4. ASM com Subfinder/httpx/Nuclei: encaixa como novas skills em `.claude/commands/`, ou exige serviço separado?
5. Risk-Triggered: o `findings-watcher` (inotify) atual serve de base para o motor de eventos, ou precisa de um event bus dedicado?
6. Métricas de qualidade (FP-rate, %-validado): dá para derivar do knowledge-base SQLite atual, ou precisa novo schema?
7. Das ideias da F4, qual tem maior razão valor/esforço para antecipar?
8. Onde a dependência da assinatura Claude Code mais atrapalha antes da F2?

---

## 9. Síntese

O Rift **já tem o ativo mais difícil de replicar** (motor de pentest agêntico web+API com human-in-the-loop). O mercado valida a categoria (PTaaS CAGR 22,6%; pentest autônomo virou unicórnio; infostealer é epidemia com 86% dos breaches; CTEM tem gap de adoção de 71 pontos). A jogada vencedora é **consolidar os dois mundos na ordem certa**: produtizar o motor (F0), fechar o loop de descoberta e trigger (F1), somar inteligência de credenciais vazadas (F2) e só então embrulhar como **Evidence-Based Continuous Assurance** de terceiros (F3) — chegando ao destino disruptivo sem abandonar o único moat que os concorrentes de TPRM não conseguem copiar.

---

## Fontes

- PTaaS market — [MarketsandMarkets](https://www.marketsandmarkets.com/Market-Reports/penetration-testing-as-a-service-market-36245315.html)
- TPRM market — [Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/third-party-risk-management-market), [Fortune Business Insights](https://www.fortunebusinessinsights.com/third-party-risk-management-market-117395)
- CTEM market & adoption gap — [CyCognito](https://www.cycognito.com/learn/exposure-management/ctem/), [Grand View Research](https://www.grandviewresearch.com/industry-analysis/continuous-threat-exposure-management-market-report)
- Infostealer / credenciais — [Shattered.io / Flashpoint](https://shattered.io/infostealer-malware-1-8b-credentials/), [Forbes / KELA](https://www.forbes.com/sites/daveywinder/2026/04/30/password-security-286-billion-credential-theft-crimewave-exposed/), [Hudson Rock](https://www.hudsonrock.com/)
- XBOW / pentest autônomo — [XBOW](https://xbow.com/blog/top-1-how-xbow-did-it), [Uproot Security](https://www.uprootsecurity.com/blog/xbow-hackerone-ai-penetration-testing)
- Pricing — [Cobalt](https://www.cobalt.io/pricing), [Synack pentest cost guide](https://www.synack.com/blog/penetration-testing-cost/)
- ASM/EASM — [Palo Alto Networks](https://www.paloaltonetworks.com/cyberpedia/asm-tools-comparison), [Bitsight](https://www.bitsight.com/guides/best-external-attack-surface-management-platforms-for-global-enterprises)
- ProjectDiscovery/Nuclei — [Docs](https://docs.projectdiscovery.io/opensource/nuclei/overview)
- ImmuniWeb (convergência + TPRM) — [ImmuniWeb](https://www.immuniweb.com/)
- Pentest-Tools — [Pricing](https://pentest-tools.com/pricing)
