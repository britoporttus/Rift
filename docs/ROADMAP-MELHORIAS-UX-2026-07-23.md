# Rift — Roadmap de melhorias UX/visual (2026-07-23)

> Cobre a rodada desta sessão: pivot de arquitetura de informação
> (engagement-first → domain-first), reformulação do Mapa de Superfície e a
> varredura geral (lógica + visual) pedida pelo usuário. Complementa —
> não substitui — `docs/ROADMAP-MELHORIAS.md` (hardening/deploy/dívida técnica
> de backend, fase anterior) e `docs/ROADMAP-AUDITORIA-2026-07-20.md`
> (segurança). Aqui o foco é experiência do operador.
>
> Legenda: ✅ feito e no ar · ⏳ pendente (decisão de escopo) · 💤 adiado
> explicitamente pelo usuário.

---

## Motivação

Feedback do gestor (via usuário, início desta sessão): a plataforma estava
"boa tecnicamente mas confusa, muito técnica, sem identidade visual". Pedido:
3 visões (executiva/alto-nível, visual/caminho de vulnerabilidade, técnica) e
melhor apresentação "desde o login até o relatório". Isso motivou o pivot de
arquitetura abaixo, seguido de uma varredura geral do resto do app.

---

## ✅ Feito nesta sessão

### Pivot domain-centric

| O quê | Arquivo(s) |
|---|---|
| Dashboard virou resumo executivo — KPIs sem "Engagements total", "Domínios em destaque" (top 6 por risco), seção pequena para engagements sem domínio vinculado | `app/(app)/dashboard/page.tsx` |
| Domínio detail ganhou: seção "Engagements" (pentests já rodados pra aquele alvo), "Panorama de risco" escopado (donut só das vulns daquele domínio), CTA "Ver mapa interativo" | `app/(app)/dominios/[id]/page.tsx` |
| Mapa de Superfície trocou o force-graph físico por um mind-map de verdade: caixas conectadas por linha, layout horizontal, bolinha de expandir/colapsar na borda do nó, popup central de detalhe | `components/dominios/DomainTree.tsx` (dados+modais), `components/dominios/DomainFlow.tsx` (visual, React Flow) |
| Proveniência real (`Finding.phase`/`discoveredBy`) — existia no Mongo mas era descartada pela API; agora chega até o grafo/frontend | `backend/src/api/findings.js`, `backend/src/graph/build.js` |
| "Caminho" (aba dentro de Engagement) mantido separado do Mapa — por engagement, não por domínio | `components/engagement/PathView.tsx` |

### Varredura geral — quick wins (lógico)

| O quê | Arquivo(s) |
|---|---|
| Código morto removido (estado/função/componente sem uso) | `app/(app)/reports/page.tsx` |
| Chip de proveniência ("via [ferramenta]") adicionado onde ainda faltava | `app/(app)/findings/page.tsx`, `components/findings/FindingsReport.tsx`, `components/engagement/ExecutionPanel.tsx` |
| Link de volta Vazamentos → Domínios (só existia o inverso) | `app/(app)/vazamentos/[domain]/page.tsx` |
| Fragment sem `key` num `.map()` corrigido | `app/(app)/admin/users/page.tsx` |

### Varredura geral — quick wins (visual)

| O quê | Arquivo(s) |
|---|---|
| `borderRadius` do Admin (4px/2px) alinhado aos 10-14px do resto do app | `app/(app)/admin/page.tsx` |
| Skeleton de loading no Dashboard (antes ficava em branco) | `app/(app)/dashboard/page.tsx` |

### Varredura geral — itens maiores (escolhidos pelo usuário)

| O quê | Arquivo(s) |
|---|---|
| Login: hex cru trocado por `var(--purple)` etc. onde já batia com o token; corrigidas 2 cores realmente desatualizadas (laranja "scanning" pré-reformulação, branco do texto levemente divergente) | `app/(auth)/login/page.tsx` |
| Findings (global): ganhou o mesmo painel visual da aba Findings de um engagement — donut de distribuição + cards clicáveis de Vulnerabilidade/Fraqueza/Observação | `app/(app)/findings/page.tsx` |
| Relatórios (global): botão "Ver executivo" ao lado de "Ver relatório", visível só pra admin (mesma regra de acesso da aba Relatório do engagement) | `app/(app)/reports/page.tsx` |
| Novo Escopo: campo de alvo com autocomplete dos Domínios cadastrados + aviso se o alvo não bate com nenhum (evita "órfãos" sem querer) | `app/(app)/engagement/novo/page.tsx` |

---

## ⏳ Pendente — decisões de escopo (achados da auditoria, não escolhidos ainda)

| O quê | Por quê importa | Arquivo(s) |
|---|---|---|
| "Caminho" (`PathView.tsx`) agrupa por regex sobre `location` (host puro vs URL vs "X e Y" concatenado) — parsing frágil, pode fragmentar o mesmo host em lanes diferentes. Quando o `target` bate com um Domínio cadastrado, dava pra resolver contra `DomainAsset` de verdade (mesma fonte que o Mapa já usa) | Consistência de dado entre Caminho (engagement) e Mapa (domínio) | `components/engagement/PathView.tsx` |
| Dashboard vazio pra usuário novo: 5 KPIs zerados empilhados sobre o empty-state de domínios — parede de zeros | Primeira impressão de conta nova | `app/(app)/dashboard/page.tsx` |
| Sidebar: "Mapa" como item de topo independente, embora hoje só seja alcançado via CTA dentro de Domínio | Coerência de navegação agora que Domínio é a unidade central | `components/ui/Sidebar.tsx` |
| Texto de loading ainda inconsistente entre páginas fora do Dashboard (`"CARREGANDO..."` texto puro vs skeleton) | Polimento menor, baixo impacto | `findings`, `reports`, `dominios/[id]`, `vazamentos/[domain]` |
| Login: o que foi feito é só o alinhamento mecânico de cor (hex → var). A pergunta maior da auditoria — se a estética "HUD hacker" cyberpunk deve continuar ou dar lugar a algo mais alinhado ao SaaS calmo do resto do app — segue em aberto, é decisão de identidade visual, não bug | `app/(auth)/login/page.tsx` |

---

## 💤 Backlog / adiado explicitamente pelo usuário

| O quê | Contexto |
|---|---|
| Explorar outras paletas de cor | "podemos pensar em outras cores para a aplicação, para ver se fica mais agradável" — sem direção definida ainda |
| Conexão direta via API com agente de IA (Anthropic **e** OpenAI), em vez de só `child_process.spawn('claude')` | Pedido pra viabilizar testes comparando providers; usuário disse explicitamente "depois" |
| `Finding.phase` nunca é populado pelo framework de pentest (sempre `null` na prática) | Bloqueia usar fase (recon/enum/exploit) pra ordenar o "Caminho"/Mapa por estágio do ataque; precisa de mudança no framework, não só no Rift |
| `Finding.discoveredBy` só ~23% populado hoje | Mesma família de problema — quanto mais completo, mais rica fica a proveniência mostrada no Mapa/Caminho |

---

## ✅ Feito depois (mind-map horizontal + rastro do achado)

Correção pedida sobre o Mapa/Caminho: layout horizontal (raiz à esquerda, ramos
pra direita, em vez de topo-baixo) + bolinha de expandir/colapsar na borda do
nó + ícone por severidade (`SEV_ICON` em `lib/severity.ts`: Skull/OctagonAlert/
AlertTriangle/AlertCircle/Info) + rótulo do achado reduzido a só ícone+nível
(sem título, sem quebra de linha — título completo só no popup/painel).
Aplicado em `components/dominios/DomainFlow.tsx` (Mapa) e
`components/engagement/PathView.tsx` (Caminho).

**Referência HackerSec (HAS) + XBOW** — usuário trouxe screenshots dos dois
como inspiração ("plataformas com objetivo muito parecido, hoje mais bem
estruturadas"). Priorizado (marcado "recomendado" e confirmado): reconstruir
o "rastro" de um achado — o que o agente fez pouco antes de registrá-lo —
igual ao "abra um finding, veja o ataque inteiro" do XBOW.

- ✅ **Rastro do achado** — `GET /api/findings/:id/trace` (`backend/src/api/findings.js`)
  reconstrói por PROXIMIDADE DE HORÁRIO (não há vínculo causal explícito —
  `Finding` não referencia `ChatMessage`) as últimas `agent_action`/`agent_message`
  do mesmo engagement numa janela de 30min antes do `createdAt` do finding.
  Dado 100% já existente (`ChatMessage` já persiste todo evento broadcast,
  incluindo tool calls) — nada novo foi coletado. Componente
  `components/findings/TraceView.tsx` (feed compacto tipo terminal), plugado
  como seção "Rastro" no `VulnModal` (Mapa) e no painel lateral do `PathView`
  (Caminho). **Não** plugado ainda em `FindingsReport.tsx` (Findings do
  engagement) nem em `findings/page.tsx` (Findings global) — mesma ideia,
  extensão rápida se quiser.

---

## 💤 Backlog grande — inspirado em HackerSec/XBOW (não iniciado)

Usuário confirmou querer todos os itens abaixo, além do rastro (acima). São
iniciativas de porte bem maior que o resto deste documento — cada uma merece
uma rodada de planejamento própria antes de começar a codar:

| O quê | Porte | Nota |
|---|---|---|
| Identidade/nome do agente (tipo "Yaga" do HackerSec) | Pequeno, mas atravessa toda a plataforma (chat, relatórios, apresentação) | Decisão de marca — precisa do usuário, não é só código |
| Seção de integrações (Jira, ServiceNow, GitHub, Slack, Teams, Azure DevOps, Freshservice, Webhook, MCP) | Grande — feature nova de verdade (credenciais, webhooks, backend por integração) | Não é visual, é infraestrutura nova |
| Landing/apresentação pré-login (hoje o Rift vai direto pro login) | Grande — página nova, conteúdo de venda/apresentação | Só faz sentido se o Rift for mostrado pra fora (cliente/prospect) |
| Revisão da arquitetura de agentes + processo de reconhecimento/gestão/análise de vulnerabilidades | Grande — toca o **pentest-framework-v2** (repo separado), não só o Rift web | Pedido explícito do usuário: "também na arquitetura dos agentes e do processo de reconhecimento, gestão e análise de vulnerabilidades" — precisa investigar o framework atual antes de propor mudança |
| "Outras novas features" (não especificado) | Indefinido | Usuário mencionou de forma aberta, sem exemplo concreto — retomar quando ele tiver algo específico em mente |

**Recomendação de sequência, se for continuar:** identidade do agente primeiro
(rápido, decisão isolada) → revisão da arquitetura de agentes/recon (precisa
vir antes de integrações e landing, porque molda o que dá pra prometer nelas)
→ integrações → landing. Mas isso é só uma sugestão de ordem — o usuário
decide o que priorizar.

---

## Ordem sugerida (se for continuar)

1. Decisões rápidas de escopo (não exigem código pesado): Sidebar Mapa, texto de loading, empty-state do Dashboard.
2. Login — decidir a identidade visual antes de investir mais nela (evita retrabalho).
3. PathView → resolver contra `DomainAsset` real quando o target bate com um Domínio (deixa Caminho e Mapa consistentes).
4. Backlog (cores, API multi-provider, `phase`/`discoveredBy` no framework) — sem pressa definida, retomar quando o usuário priorizar.
