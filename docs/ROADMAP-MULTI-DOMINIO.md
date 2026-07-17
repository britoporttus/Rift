# Roadmap — Evolução do Rift para pentest multi-domínio (Web → Cloud → AD → SAP)

**Para:** agente de desenvolvimento / operadores do Rift
**Plataforma:** Rift (monorepo Next.js 14 + Node/Express + MongoDB/Mongoose + WebSocket) sobre o pentest-framework consolidado (tronco **v2c**)
**Origem:** veredito do **Conselho de LLMs** (sessão de 2026-07-16). Este documento persiste esse veredito — antes ele só existia no transcript.
**Status:** proposta aprovada como direção; **execução não iniciada**.

> Legenda: `[ ]` Pendente · `[~]` Em andamento · `[x]` Concluído · `[!]` Bloqueado
>
> Documento auto-contido. Reutilize os padrões que já existem no repo (seletor de versão do agente, Jobs + fila durável, watcher, RBAC, paleta). **Não construa 4 orquestradores nem invente transporte/C2 novo.**

---

## 0. TL;DR — a decisão

Transformar o Rift de "pentest de infra web/API" em **plataforma de pentest multi-domínio**, sem multiplicar codebases:

- **Núcleo único + domain packs** (não 4 orquestradores). Domínio é **conteúdo**, não arquitetura.
- **Sequência por custo de infra: Azure/Cloud → AD → SAP** (não SAP primeiro).
- **Runner interno = reusar Jobs + fila durável (outbox)**, não um C2 novo.
- **O bloqueador real de "ir pra dentro" é o transporte de inferência** (dado do cliente saindo pra Anthropic via `spawn('claude')`), não o túnel.
- **A "única coisa a fazer primeiro":** transformar o seletor de versão (v2c) em **seletor de domain pack**, com o Web atual virando o primeiro pack.

---

## 1. Onde o Conselho concordou (alta confiança — 4-5 dos 5)

- **NÃO construir 4 orquestradores.** O orquestrador (recon→enum→exploit→report) é o **mesmo** em Web/Cloud/AD/SAP. Um *domain pack* = system prompt + manifest de ferramentas + política de checkpoint + tratamento de credencial. Núcleo único + plugins. 4 agentes = 4 codebases que não há braço pra manter.
- **Consolidar o tronco (v2c) é pré-requisito, não opção.** Já feito no commit `977c916` (15/07). Não expandir sobre troncos divergentes (legacy/v2/v3 aposentados).
- **O runner interno NÃO deve ser um C2 novo.** O padrão certo já existe: **Jobs + fila durável (outbox)**. O runner **PUXA** jobs por túnel (WireGuard/reverso), reusa claim atômico, resume-no-boot e o watcher. Só vira frágil se inventar transporte novo. Ver `backend/src/jobs-worker.js` e o memory [[rift_jobs_durable_queue]].
- **SAP-primeiro (sequência técnica) está errado.** Ordem por custo de infra: **Azure/Cloud → AD → SAP.**
- **O eixo real não é black-box→autenticado — é EXTERNO (alcance da VPS) vs POSIÇÃO DE REDE.** "Tem credencial" ≠ "roda de dentro". Web autenticado ainda roda da VPS.
- **RBAC destrutivo tem que ser POR AÇÃO, não por fase** + vault + dry-run + blast-radius por comando, antes de qualquer coisa interna tocar produção.

## 2. Onde o Conselho se chocou

**SAP-primeiro (visão de mercado) vs Azure-primeiro (sequência técnica).**
A tese do Expansionista é **valiosa e vira o norte de produto**: "a plataforma de IA que faz pentest de SAP" é categoria quase vazia no LATAM (moat); o runner interno é **ARR** (não projeto one-shot); a **correlação cross-domínio** (VPN externa → caminho no AD → cofre SAP = attack-path ponta a ponta) é o slide que fecha C-level.
Mas o **sequenciamento** dele é suicida: empilha os dois maiores riscos (runner-como-produto + SAP) no piloto de uma arquitetura nova.
**Resolução:** a visão dele é o **destino** (SAP/interno/contínuo); o **caminho** é Azure→AD→SAP. Os ambientes SAP próprios servem pra **de-riscar o runner**, não pra ser o primeiro domínio de produção.

## 3. Pontos cegos que a revisão por pares pegou (o que os 5 perderam)

1. **🚨 O verdadeiro pré-requisito não é o runner nem o vault — é o TRANSPORTE DE INFERÊNCIA.**
   Mesmo puxando jobs, o runner roda `spawn('claude')` = assinatura Claude Code → **dados internos do cliente (topologia, contexto de credenciais) SAEM da rede segmentada pra Anthropic** na inferência, independente da direção da fila. Em SAP/AD de produção isso pode ferir contrato/ToS/air-gap.
   **Correção que destrava "ir pra dentro":** mover a inferência pro **perímetro do cliente** — Claude via **Bedrock no VPC** do cliente, ou modelo on-prem/air-gap, ou inferência local no runner pra tudo que toca dado do alvo (Anthropic só no externo). **Este é o divisor de águas real, não o túnel.**
2. **Deconfliction com o blue team / SOC.** Agente ofensivo autônomo e não-determinístico dentro da rede é **indistinguível de um atacante real** → dispara EDR/IR. Precisa de allow-listing, deconfliction combinada e trilha de auditoria assinada.
3. **Multi-tenancy quebra.** "Ir pra dentro" por-cliente estoura o *"1 operador, 1 VPS, sem multi-tenancy"* do CLAUDE.md → força isolamento por tenant + audit imutável por ação + kill-switch crível.
4. **Provar competência antes de apontar pra produção.** LLM é não-determinístico → precisa de **labs + evals por domínio** (ground-truth) antes de SAP prod.
5. **Custo de token da "avaliação contínua".** O modelo ARR multiplica inferência; o `INTERACTIVE_COST_CEILING` existe por um motivo.

---

## 4. Sequência de execução

### ETAPA 0 — Fundação estrutural (a "única coisa primeiro") · `[x]` (2026-07-17)
**Zero dependência externa, zero risco. É a base sobre a qual todo o resto se apoia.**
- [x] Introduzir a abstração de **domain pack** como dimensão nova e **ortogonal** ao seletor de versão (não substitui o `frameworkId` — soma a ele). Registro central em `backend/src/domain-packs.js`.
- [x] Definir a estrutura de um **domain pack** = `{ systemPrompt, toolManifest, checkpointPolicy, credentialHandling, position }` (o `position` external/network é o eixo real que a revisão pegou).
- [x] **Web vira o pack #0** (`web`): `systemPrompt` vazio → **no-op em runtime**, reproduz o comportamento atual. azure/ad/sap entram como `planned` (visíveis no seletor, desabilitados — espelham as ETAPAs 1-3).
- [x] Persistência: `Engagement.domainPackId` + `Job.domainPackId` (default `web`; engagements antigos rodam idênticos).
- [x] API: `GET /settings/domain-packs` (catálogo) + validação no `PATCH /engagements/:id` (recusa selecionar pack `planned`).
- [x] Runtime: injeção do prompt do pack no contexto do agente (`server.js`) — no-op p/ web; propagação do `domainPackId` para Jobs (interativo + agendado via scheduler).
- [x] UI: `DomainPackSwitcher.tsx` ao lado do `FrameworkSwitcher` na aba Execução.
- [x] Testes: `backend/test/domain-packs.test.js` (8 casos) — suite 59/59 verde; typecheck + Next build limpos.

> **Nota de escopo:** o seletor de versão (v2c/legacy/v3) foi **mantido** — trocá-lo por completo agora seria risco desnecessário (v2c recém-validado). Domain pack e versão coexistem: versão = tronco, domain pack = conteúdo do domínio. A aposentadoria das versões legadas fica para quando o v2c for o único tronco em uso.
> **Follow-up (ETAPA 1):** a injeção do prompt do pack no caminho **headless** (`scheduler.dispatchScheduledJob`) só é necessária quando um pack != `web` ficar `ready`; hoje é no-op. Wire-up junto do pack `azure`.

### ETAPA 1 — Pack Azure/Cloud (sem runner) · `[~]` em andamento
**Autenticado via API (Graph/ARM), bate da VPS sem runner.** Valida o eixo credencial + RBAC destrutivo + vault barato.
- [x] Pack `azure` registrado (`domain-packs.js`) como `planned` — external, per-action, cred=vault.
- [x] **Checkpoint por-ação** (`loadCheckpointDirective`) — gate destrutivo por AÇÃO injetado no contexto; inerte p/ web (per-phase). Commit `972a90c`.
- [x] **Vault de credenciais** — decisão do operador: **efêmero, in-memory, nada em repouso** (`cred-vault.js`). Credencial por-run, TTL 2h, `clear()` no fim; sem persistência ⇒ sem run agendado autenticado. Commit `9f273d8`.
- [x] Conteúdo do pack `azure` (`src/packs/azure.md`): read-only → análise RBAC → escalada sob checkpoint. Carregado por `promptFile`. Commit `79a41bd`.
- [ ] Wire: endpoint/WS p/ operador submeter credencial → `cred-vault` → injeção no env do processo do run (in-memory); `clear` no onClose. **Precisa de alvo p/ verificar.**
- [~] Tooling no VPS (`az` CLI, ScoutSuite/Prowler) — instalando via pipx (nível-usuário, sem sudo).
- [ ] **[bloqueio externo]** Tenant Azure de teste + credenciais — o operador precisa prover.
- [ ] Flip `azure` → `ready` + bloquear run agendado p/ packs autenticados. **Só após os itens acima.**

### ETAPA 2 — Pack AD (valida o runner) · `[!]` bloqueado pela ETAPA 4
**Tooling maduro que o Claude conhece: BloodHound / NetExec / Certipy.** É aqui que o runner interno é provado.
- [ ] Runner que **puxa jobs** por túnel reusando Jobs + outbox (`jobs-worker.js`), claim atômico, resume-no-boot, watcher.
- [ ] Pack `ad` com o tooling acima.
- [ ] **Bloqueado** até resolver transporte de inferência (ETAPA 4a) — runner roda `spawn('claude')` dentro da rede do cliente.

### ETAPA 3 — Pack SAP (por último) · `[!]`
**Maior raio de explosão (ERP = quebra financeiro); Claude conhece menos (pysap/bizploit são nicho).**
- [ ] Usar ambientes SAP próprios para **de-riscar o runner**, não como primeiro domínio de produção.
- [ ] Labs + evals com ground-truth antes de qualquer SAP de produção (ponto cego #4).

### ETAPA 4 — Bloqueadores que destravam "ir pra dentro" (paralelo, começar já) · `[ ]`
**Nada interno toca produção antes disto.**
- [ ] **4a. Transporte de inferência** (o divisor de águas): **Bedrock-no-VPC / on-prem** — dado do cliente não sai pra Anthropic. Abrir como projeto de pesquisa **em paralelo à ETAPA 0**, porque é ele que decide se "ir pra dentro" é sequer contratualmente possível.
- [~] **4b. Segurança destrutiva:** RBAC **por-ação** (feito, `972a90c`) + vault (feito, efêmero in-memory, `9f273d8`) + dry-run/blast-radius por comando + kill-switch + **audit assinado** + **deconfliction com o SOC**. Faltam dry-run/kill-switch/audit/deconfliction.
- [ ] **4c. Multi-tenancy + isolamento por tenant** (revisar a premissa "1 operador, 1 VPS" do CLAUDE.md).

---

## 5. A recomendação final (resumo do Conselho)

1. **Núcleo único + domain packs** (não 4 orquestradores). O seletor de versão vira seletor de domain pack.
2. **Consolidar o tronco v2c** — já feito (`977c916`).
3. **Sequência: Azure → AD → SAP.**
4. **Antes de qualquer coisa interna tocar produção, resolver os DOIS bloqueadores:** (a) transporte de inferência (Bedrock-no-VPC/on-prem) e (b) segurança destrutiva (RBAC por-ação + vault + dry-run/blast-radius + kill-switch + audit assinado + deconfliction).
5. **A visão do Expansionista (SAP como categoria, runner como ARR, correlação cross-domínio) é o norte de produto — o destino, não o primeiro passo.**

**A única coisa a fazer primeiro:** ETAPA 0 (domain pack + Web como pack #0). É segunda-de-manhã: zero dependência externa, zero risco. Em paralelo, abrir a pesquisa de transporte de inferência (ETAPA 4a).

---

*Gerado a partir do veredito do Conselho de LLMs de 2026-07-16. Relacionado: [[project_rift_agent_architecture]], [[rift_jobs_durable_queue]], [[rift_agent_version_selector]], [[agent_architecture_revamp]].*
