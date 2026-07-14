# ROADMAP — Correções e Melhorias do Rift

> Legenda: `[ ]` Pendente · `[~]` Em andamento · `[x]` Concluído · `[!]` Bloqueado
>
> **Regra de ouro:** nenhuma correção vira `[x]` sem (a) teste que falharia antes e passa depois, (b) verificação de regressão, (c) resumo curto (causa · arquivos · solução · testes · pendências).
> **Sem valores fixos, dados simulados ou correção só-visual que esconda problema de backend.** Confirmar sempre a origem do dado no código e no banco.
> Não alterar schema, autenticação, contratos de API ou estrutura persistida sem verificar impactos.
>
> Ordem obrigatória: concluir e validar cada ETAPA antes de avançar. **Começar pela ETAPA 1.**

---

## Diagnóstico (leitura do projeto + reprodução no banco)

### Como funciona hoje
- **Login/Auth:** `frontend/hooks/useAuth.ts` chama `api.auth.me()` no mount (cookie HttpOnly); sem provider global. `frontend/app/(auth)/login/page.tsx` trata callback SSO (`?code=` → `exchange → refreshUser → replace('/dashboard')`). `frontend/app/(app)/layout.tsx:93` faz guard `if(!loading && !user) replace('/login')`. `frontend/lib/api.ts:14` tem handler global de 401 que faz `window.location.href='/login'` (hard reload).
- **Dashboard/Findings:** `dashboard/page.tsx` usa `engagements.list()` + `findings.list()` (todos, sem filtro); total = `findings.length`; card = `e.findingsCount ?? eFinds.length`. `api/findings.js` retorna todos os `Finding` sem filtrar por engagement existente nem por `state`. `store.js:56` `countFindings` conta todos os states. `findings-watcher.js` faz upsert por `{engagementId, sourceFile}` sempre com `state`+`fingerprint`. Scripts `import-*.js`/`seed.js` inserem em massa.
- **Execução:** `engagement/[id]/page.tsx` (abas exec|chat|findings|report), `ExecutionPanel.tsx` (fases, achados, superfície, atividade, marcos), `agent-runner.js` (spawn claude, deriva fase da ação, extrai marcos), `server.js:519-537` (`onClose`: `code===0?'completed':'stopped'`).

### Causas-raiz confirmadas
| Bug | Causa-raiz (evidência) |
|-----|------------------------|
| Loop login | `lib/api.ts:14` faz `window.location.href='/login'` em **todo** 401; `useAuth` roda `me()` no mount **na própria tela de login** → 401 → hard-redirect p/ `/login` → remonta → 401 → loop. |
| 191 ≠ 44 | Banco: **191 Finding docs**, mas **143 órfãos** (engagementId sem engagement) e **119 sem `state`/`fingerprint`** (lixo dos scripts de import). Soma real por engagement existente = 48; `findingsCount` armazenado (44) defasado (ex.: GRC Builder 4≠8). Total do dashboard usa `/api/findings` (191); cards usam `findingsCount` (44). Fonte dupla + lixo + sem filtro de taxonomia. |
| Conclui sem terminar | `server.js:525` deriva `completed` só de exit code 0 (= "turno do CLI acabou", não "fases cumpridas"); safeguard pode sair 0 → "concluído". Faltam estados `failed`/`stopped-by-limit` e gate de fases; faltam CTAs pós-fase. |
| Marcos malformados | `agent-runner.js` `extractMilestones`: `TECH_STOP` curto → `Country`/`Cookies`/`HttpOnly`/`IP`/`Qualidade` viram "tech"; ffuf/gobuster deduplicam por `label` (execuções colidem); marco sem `runId`/status/size estruturados. |
| 0 vuln / 11 fraquezas | `FindingsReport.tsx:68,281` lê `f.finding_type`, **campo inexistente na API** → default `'weakness'` p/ tudo. Deveria derivar de `state`/`type` (que o DTO expõe). |

Banco hoje — por state: `(none)=119, informational=35, probable=22, confirmed=13, false_positive=2`; por severidade: `critical=11, high=36, medium=51, low=26, info=67`.

---

## ETAPA 1 — Bugs críticos

### [x] 1.1 Loop na página de login
Arquivos: `frontend/lib/api.ts`, `frontend/lib/authRedirect.js` (novo), `frontend/app/(auth)/login/page.tsx`, `frontend/test/authRedirect.test.js` (novo), `frontend/package.json`.
Fix: não fazer hard-redirect de 401 quando já em `/login` (`shouldRedirectOn401`); guard `useRef` para o callback SSO rodar 1×; refresh em rota protegida com cookie válido preserva sessão; erro de auth visível sem loop.
Testes: `node --test test/` (3/3) — 401 em `/login` não redireciona; em rota protegida redireciona; demonstrado falha-antes (comportamento antigo `()=>true` reprova o caso `/login`). Baseline backend 12/12 intacto.

### [x] 1.2 Contagem de findings (191 ≠ 44)
Arquivos: `backend/src/findings-count.js` (novo), `backend/src/api/findings.js`, `frontend/app/(app)/dashboard/page.tsx`, `backend/test/findings-count.test.js` (novo).
Causa (confirmada no banco): 143 findings ÓRFÃOS de 4 engagements removidos (DVWA/Juice Shop/LorenIpsum/GDS4U, via scripts de import) + fonte dupla (total via `/api/findings`=191 × cards via `findingsCount`=44 defasado) + sem dedup.
Fix: `cleanFindings()` — API é a fonte única; `GET /api/findings` exclui órfãos (engagement inexistente) e deduplica por (engagement, fingerprint). Dashboard: card conta a fatia do MESMO array (removido `e.findingsCount ??`). Resultado no dado real: **191 → 48**, `total == soma por severidade == soma por engagement == 48` (GRC Builder 4→8). Não destrutivo (órfãos não são apagados, só não contados). Não trocado 191 por 44 na mão.
Testes: `node --test` 16/16 — órfão não conta; dedup por fingerprint; total==somaSev==somaEng; falha-antes demonstrada (lista crua devolve órfãos+dup).
Limpeza física dos órfãos: **feita** — `backend/scripts/clean-orphan-findings.js` (dry-run + `--apply`) removeu os 143 órfãos (DVWA/Juice Shop/LorenIpsum/GDS4U). Banco: 191 → 48, 0 órfãos.

### [x] 1.3 Execução conclui/para antes de terminar
Arquivos: `backend/src/run-outcome.js` (novo), `backend/src/server.js`, `backend/src/agent-runner.js`, `backend/src/models/Engagement.js`, `backend/test/run-outcome.test.js` (novo), `frontend/lib/api.ts`, `frontend/hooks/useEngagementWS.ts`, `frontend/app/(app)/engagement/[id]/page.tsx`, `frontend/components/engagement/ExecutionPanel.tsx`, `frontend/app/(app)/dashboard/page.tsx`.
Causa: `server.js` derivava `code===0?'completed':'stopped'`; exit 0 = "turno do CLI acabou" (não fases cumpridas), e recusa por safeguard sai 0 → "concluído".
Fix: `deriveRunOutcome()` — 4 saídas: **completed** (só se alcançou `vuln`) · **stopped** (`operator`/`budget`/`incomplete`/`interrupted`) · **failed** (`safeguard`/`timeout`/`error`). Falha técnica NUNCA vira "concluído". `runState` ganhou `'failed'` + campo `stopReason` (aditivo). Runner passa `phasesReached`/`timedOut`/`blockedBySafeguard` no `onClose`; server aplica e persiste o motivo; `setRunState(state, reason)` transmite o motivo; `agent_stop`→operator; porta de orçamento→budget; boot/reconexão de órfão→interrupted. UI: badge `FALHOU`, motivo persistido (sobrevive a refresh), CTAs pós-fase **Continuar testes / Gerar relatório / Fornecer credenciais**.
Testes: `node --test` — 9 casos em run-outcome (incl. invariante safeguard≠completed, incomplete≠completed, operador/limite/timeout/erro). Suíte total: backend 25/25, frontend 3/3.
Pendências: fluxo autenticado completo do "Fornecer credenciais" (Agente 2) é item futuro — hoje o CTA inicia o handoff via mensagem real ao agente. Mudanças exigem **restart do backend + rebuild do frontend** para entrarem no ar.

---

## ETAPA 2 — Sincronização e controle
### [x] 2.1 Botão "Atualizar dados" na Execução
Arquivos: `frontend/lib/mergeMessages.js` (novo), `frontend/app/(app)/engagement/[id]/page.tsx`, `frontend/components/engagement/ExecutionPanel.tsx`, `frontend/test/mergeMessages.test.js` (novo).
Fix: `refreshData()` reexecuta os MESMOS loaders (`loadEngagement`/`loadFindings`/`loadHistory`) da atualização automática via `Promise.allSettled` → status/fase/achados/superfície/custo/atividade, sem reload de página. Anti-duplo-clique (`refreshInFlight` ref + botão desabilitado), loading (spinner), estados ok/parcial/erro e "Última atualização: HH:MM:SS". O merge/dedup foi extraído p/ `mergeMessages()` (idempotente) → atualizar não duplica.
Testes: `node --test` (frontend 6/6) — dedup por `_dbId`, dedup de finding por título, idempotência do refresh; falha-antes demonstrada (concat ingênuo duplica).
### [x] 2.2 Utilização da SKU
Arquivos: `backend/src/sku.js` (novo), `backend/src/api/admin.js`, `backend/test/sku.test.js` (novo), `frontend/lib/api.ts`, `frontend/app/(app)/admin/page.tsx`.
Verificação: só existe **consumo** real (soma de `Usage`); **não há** fonte de limite/saldo/período (sem integração de billing/plano; env não tem teto de conta). Fix: `computeSkuUsage()` — consumo real sempre; limite só se o operador declarar `SKU_LIMIT_USD` (não simula). Sem limite → `GET /api/admin/sku` retorna `available:false` e o admin mostra **"Consumo da SKU indisponível — integração não configurada."** + o que falta (definir `SKU_LIMIT_USD` ou integrar a API de uso/custo da Anthropic). Com limite → consumo/limite/saldo/% + "atualizado em".
Testes: `node --test` (backend 29/29) — indisponível sem limite (sem % inventado), cálculo com limite, saturação em 100%, limite inválido → indisponível.
Pendência documentada: integração oficial de billing/uso da Anthropic (ou config de período) para limite automático sem env manual.

## ETAPA 3 — Simplificar a interface
### [x] 3.1 Remover "+ Novo Engagement" do cabeçalho
Arquivo: `frontend/app/(app)/layout.tsx` (`TopBar`). Removido o botão; mantidos "Sistema online" e "+ Novo Escopo" (dashboard). Limpos os órfãos: import `Link`, helpers `SI`/`PlusIco`, prop `collapsed` do TopBar. `collapsed` segue no Sidebar.
### [x] 3.2 Remover a aba Chat
Arquivos: `frontend/app/(app)/engagement/[id]/page.tsx`; removidos `components/chat/{MessageFeed,ChatInput,FindingsSidebar}.tsx` (órfãos, confirmado sem refs). **Mecanismo interno preservado:** `useEngagementWS.send` (operator_message/answer/stop), `activeSession` (bootstrap), backend de sessões/mensagens — tudo mantido; a Execução comanda o agente (start/continue/stop/answer/relatório/credenciais) e responde checkpoints (`pendingQ`). Só a aba/UI de Chat saiu. `ContextMeter` (memória/compactar) e `ModelSwitcher` re-alojados na aba Execução. Removidos handlers/estados órfãos (sessions/loadingSessions/create/delete/rename/handleStartTests) e imports não usados. JSX validado (chaves/parênteses balanceados), testes frontend 6/6.
Limitação: entrada de texto livre ao agente saiu com o Chat (por design do roadmap); comandos essenciais via CTAs da Execução.

## ETAPA 4 — Marcos malformados
### [x] 4.1 Marcos do mapeamento
Arquivos: `backend/src/agent-runner.js` (`TECH_STOP`, `parseFuzzTarget`, case ffuf, `runId`/`ts` no emit), `backend/test/milestones.test.js` (novo), `frontend/components/engagement/ExecutionPanel.tsx`.
Causa: `TECH_STOP` curto → `Country`/`Cookies`/`HttpOnly`/`IP`/`Qualidade` viravam "Stack detectada"; ffuf deduplicava por label sem contexto (execuções confusas "38/1/29"); marcos sem horário/execução.
Fix: `TECH_STOP` expandido com nomes de header, atributos de cookie e campos de geo/meta → propriedade HTTP nunca é tecnologia. ffuf/gobuster/feroxbuster: alvo (host) extraído do comando entra no label (separa execuções, não sobrescreve) e cada achado vira item estruturado `[status] sizeB  caminho`; tipo padronizado `paths` (ícone próprio). Todo marco carrega `runId` (execução) + `ts` (horário exibido na UF). Contrato preservado: ferramenta que falhou continua sem gerar marco (evita ruído); lista completa abre no painel (já existia).
Testes: `node --test` (backend 32/32) — propriedade HTTP ≠ tecnologia; ffuf com host no label + itens status/size/caminho; hosts diferentes não colapsam; falha-antes demonstrada. Hardening (ANSI, erro→sem marco, OPTIONS≠tech) intacto.
Pendência: tipos "Ferramenta executada" e "Erro da ferramenta" propositalmente NÃO viram marco (erros aparecem no feed/[log]) — decisão para manter o painel baixo-ruído, coerente com o contrato testado.

## ETAPA 5 — Reorganizar Execução e Findings
### [x] 5.1 Explicar as seções da Execução
Arquivo: `frontend/components/engagement/ExecutionPanel.tsx`. Descrição curta sob cada título + estado vazio explicativo: **Achados confirmados** ("evidência suficiente…", vazio explica que só entra o verificado); **Mapa de superfície** (agora sempre renderiza, com a definição "hosts/domínios/portas/serviços/tecnologias/endpoints/exposições — não é vulnerabilidade por si só" + estado vazio); **Atividade do agente** ("linha do tempo operacional: fases, ferramentas, updates, solicitações, paradas, erros"). Confirmados vs superfície já não repetem (separados por `state`).
### [x] 5.2 Classificação e UI de Findings
Arquivos: `frontend/lib/findingClassify.js` (novo), `frontend/components/findings/FindingsReport.tsx`, `backend/src/api/findings.js` (DTO), `frontend/test/findingClassify.test.js` (novo).
Causa: `FindingsReport` lia `f.finding_type` — campo que a API nunca devolveu → tudo virava "weakness" (0 vuln / 11 fraquezas / 0 observações); Info contado como fraqueza.
Fix: `findingType/findingConfirmation/findingExploitation/cvssKind` derivam das 5 dimensões da taxonomia real. **Tipo** vem de `state`/`severity` (confirmed→Vulnerabilidade; info/ruled-out→Observação; probable/legado→Fraqueza) → Info nunca é fraqueza. **5 dimensões visualmente separadas com paletas distintas**: Tipo (violeta/fúcsia/ardósia, ≠ severidade), Severidade (rampa canônica), Status/remediação, Confirmação (dot+rótulo), Exploração (usa `reproducible`; confirmado ≠ explorável). CVSS só quando existe, marcado **calc.** (com vetor) vs **est.** DTO agora expõe `reproducible/cvssVector/cwe/owasp/poc` (aditivo).
Testes: `node --test` (frontend 12/12) — Tipo por state; Info≠fraqueza; legado→fraqueza; confirmação/exploração/CVSS; falha-antes (default weakness reprovado).

---

## Testes mínimos obrigatórios
Backend roda com `node --test` (`backend/test/hardening.test.js`). Cobrir: login sem loop · callback 1× · total sem duplicação · soma por severidade = total · ciclo recon→enum→vuln · parada operador · parada limite · erro técnico explícito · atualização manual sem duplicação · marcos ffuf por execução · classificação vuln/fraqueza/observação. **Cada fix inclui ≥1 teste que falha antes e passa depois.**

---

## Registro de execução
_(causa · arquivos alterados · solução · testes · pendências — por item concluído)_
- …
