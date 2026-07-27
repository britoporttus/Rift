# Rift — Roadmap de Produto (ordem definida pelo operador, 2026-07-27)

> **Origem:** consolida três documentos anteriores — `Rift-Roadmap.md` (tese de mercado
> motor→inteligência→governança, F0–F4), a auditoria de 21/07 (repo real + comparativo de
> 12 concorrentes) e a análise dos 7 epics de rede/SAP/AD/agente/tickets/credenciais de
> 27/07 — reordenados pela prioridade real de execução que o operador definiu nesta data.
> **Não substitui** `docs/ROADMAP-MULTI-DOMINIO.md` nem `docs/ROADMAP-CONSOLIDACAO-AGENTE.md`
> — este documento é a ordem de execução; aqueles continuam sendo a referência técnica de
> como cada peça se constrói.
>
> Legenda: `✅` já existe/decidido · `🟡` parcial · `🔵` novo · `[ ]` pendente · `[x]` feito

---

## 0. Infra compartilhada — ler antes dos 8 itens

Dois itens da lista NÃO são projetos isolados — são um investimento de infraestrutura
único que vários itens dependem dele. Sinalizado em cada seção abaixo como
**depende de: Runner** ou **depende de: multi-tenant/BYOK**.

- **Runner interno** (Jobs + fila durável, execução dentro da rede do cliente) — item 1
  (modo always-on) e item 7 (AD/SAP) dependem dele. Construir pensando nos três desde o
  início evita reconstruir na segunda vez.
- **Transporte de inferência** (Bedrock-no-VPC/on-prem) — pré-requisito do Runner tocar
  dado sensível de cliente. **Não é o mesmo item que a migração p/ Anthropic API (I-5,
  item 4 abaixo)** — uma resolve custo/rate-limit, a outra resolve onde a inferência roda.
- **Multi-tenancy** (`tenant_id` real, hoje ausente — confirmado pela auditoria de 21/07)
  — pré-requisito de qualquer BYOK sério (item 4) e de "abrir a plataforma pra outras
  pessoas" em qualquer um dos itens 3/4.

---

## 1. Módulo de rede interna 🔵

**Objetivo:** descoberta de ativos (notebooks, servidores, switches, câmeras IP, IoT,
equipamento desconhecido), inventário (IP/hostname/OS/fabricante/MAC/portas/serviços) e
visualização estilo Packet Tracer/Lansweeper/PRTG da rede à qual o operador está conectado.

**Status:** zero código, zero decisão prévia — o item mais novo de todos os 8.

**Abordagem recomendada:** descoberta de LAN é determinística — não precisa de LLM no
momento da coleta. Isso separa este item do bloqueio de infra dos outros:

1. **MVP manual** (curto prazo, sem depender do Runner): sonda local — Nmap + arp-scan +
   SNMP walk rodando num container/binário que o operador executa no local, sobe o
   resultado (JSON estruturado) pro Rift. O agente de IA entra depois, analisando o
   inventário — nunca o tráfego bruto.
2. **Always-on** (médio/longo prazo): sobre o Runner interno, com perfil de scan
   conservador por padrão (nunca "aggressive" como default em rede interna — impressora/
   PLC/IoT frágil pode cair).

**Ferramentas:**

| Ferramenta | Função | Nota |
|---|---|---|
| Nmap | host/serviço/OS fingerprint | núcleo do scan ativo |
| arp-scan / arping | descoberta L2 no segmento local | sonda tem que estar no segmento certo |
| Netdisco | topologia via SNMP/CDP/LLDP | faz quase literalmente o que o item pede pra switch/roteador |
| LibreNMS | auto-discovery + mapas (weathermap) | referência de UI pronta |
| NetBox | modelo de dados de inventário (DCIM/IPAM) | reaproveitar schema, não reinventar |
| p0f / Zeek | fingerprint passivo, rogue device | fase always-on, não MVP |

**Visualização:** reaproveitar o React Flow já usado no módulo Mapa (`DomainFlow.tsx`) em
vez de adotar uma lib de grafo nova.

**Riscos:** operacional (equipamento frágil), legal (escopo tem que reusar o mesmo padrão
de gate de autorização do `Domain.authorized`).

**Depende de:** Runner (só na fase always-on; o MVP manual não depende de nada).

---

## 2. ASM externo — monitoramento contínuo + melhorias ✅

**Status:** já existe e roda em produção — módulo Domínios (subfinder → DNS → httpx →
nuclei, score de segurança 0–100). Este é o item de menor esforço/maior retorno do
documento inteiro: é extensão pura, não construção do zero.

**O que falta especificamente:**

- **Monitoramento contínuo real** — re-scan agendado + diff de superfície. O Rift já tem
  Jobs e a taxonomia `fingerprint`/`first_seen`/`last_seen` (usada em Findings) — é
  questão de aplicar o mesmo padrão ao ASM, não inventar um novo.
- **Risk-Triggered** — o `Rift-Roadmap.md` original já pedia isso na F1 (I-6/M-5): gatilho
  por evento (novo subdomínio, deploy, **CVE crítica**), não só calendário. Hoje
  `scheduler.js` só cobre execução recorrente por tempo — este é o gap mais honesto que
  aquele documento apontou e que segue sem solução.
- **ASN mapping** — amass (grafo de ASN/organização), asnmap/mapcidr (ASN→CIDR).
- **Enriquecimento tipo Shodan/Censys** — camada paga opcional, não bloqueante.
- Confirmar se `dnsx`/`naabu` estão de fato instalados (memória antiga registrava
  ausência apesar de estarem no toolManifest do pack web).

**Depende de:** nada — pode andar imediatamente.

---

## 3. Abas de conexão — tickets, MCP, Azure DevOps, Jira + dogfooding no próprio Rift 🔵

**Objetivo:** hub de integrações (ticketing + MCP), com um primeiro teste real: conectar
o GitHub do próprio Rift e rodar um scan nele mesmo pra validar a plataforma ponta a ponta
antes de vender a feature pra fora. Ótima escolha de critério de pronto — é exatamente o
tipo de teste de integração real que falta hoje (a auditoria de 21/07 não achou nenhuma
suíte de teste rodando contra alvo real via CI).

**Status:** novo, mas a base de dados já existe — `Finding.remediationStatus` já está no
schema (modelado em junho) e o `remediation-verifier` já re-testa findings antigos
(fixed/open/regressed). Esta aba é essencialmente "expor esse sinal pra fora", não criar
um modelo de dados novo.

**Arquitetura recomendada:** adapter por plataforma atrás de uma interface comum — o
mesmo padrão de plugin que os `leak-providers` do Vazamentos já usam
(`asm/leak-providers/{mock,hibp,dehashed,...}/index.js`); a equipe já tem essa forma na
cabeça.

**MCP — vale decidir qual dos dois antes de codar, porque são features diferentes:**

- **(a) Rift como MCP client** — conectar a servidores MCP de terceiros (Jira e GitHub já
  têm MCP servers oficiais) pra o próprio agente de pentest chamar ações neles. É o que
  resolve o pedido de "integração" diretamente.
- **(b) Rift como MCP server** — expor as capacidades do Rift (criar engagement, consultar
  findings) pra QUALQUER cliente MCP (Claude Desktop, outros agentes) chamar. É um
  produto à parte, vale considerar depois, não é a mesma entrega.

**Plano de dogfooding sugerido:** 1 integração de ticketing (a que a Trustsis/Porttus já
usa internamente) + a conexão MCP client + conectar o GitHub do Rift e rodar o scan nele
mesmo como critério de "pronto" desta fase.

**Depende de:** nada tecnicamente — mas ganha muito de multi-tenancy (item 0) se a ideia
for eventualmente abrir pra outros operadores gerenciarem suas próprias conexões.

---

## 4. Conexão de SDK / chaves de IA — BYOK (Bring Your Own Key) 🔵

**O problema real:** hoje o agente roda via `child_process.spawn('claude', ...)` amarrado
à assinatura Claude Code do operador — não é uma chave de API, é uma sessão de CLI
autenticada por conta. Não escala pra "qualquer pessoa usa a plataforma com a própria
conta" do jeito que está montado hoje.

**Referência que você mandou ([open-design.ai](https://open-design.ai/pt-br/)):** o
padrão de BYOK deles é local-first — o usuário escolhe o agente/provedor (Claude Code,
Codex, Gemini CLI, Cursor etc.), e o daemon fala **direto** com o provedor escolhido; a
plataforma nunca vê o tráfego do modelo, só prompt+contexto vão pro provedor cuja chave
foi trazida. "Trocar de agente é mudança de configuração no daemon, não redesenho" — é o
padrão de desacoplamento que vale mirar: a camada de execução do agente tem que ser
agnóstica de provedor na INTERFACE, mesmo que o suporte a múltiplos provedores chegue aos
poucos.

**Dois níveis de complexidade — importante não embolar os dois numa estimativa só:**

| Nível | O que é | Esforço | Observação |
|---|---|---|---|
| **1 — traga sua chave Anthropic/Bedrock/Vertex** | Ainda dentro do universo Claude, troca só credencial/billing | Médio | Viável trocando `spawn('claude')` pelo **Claude Agent SDK** direto — já suporta auth via chave Anthropic, Bedrock ou Vertex por env var. É literalmente o item **I-5** do `Rift-Roadmap.md` original ("migração pra Anthropic API", meta da F2) |
| **2 — traga qualquer LLM, inclusive local** | Desacoplar a lógica de pentest do Claude especificamente | Alto — projeto de arquitetura, não feature | Precisa reimplementar o loop do agente (tool-use, ferramentas de pentest, checkpoints) sobre uma interface mais genérica (compatível com tool-calling estilo OpenAI, que Ollama/vLLM também falam) |

**Recomendação:** Nível 1 primeiro — resolve BYOK real (chave própria) E resolve o I-5 do
roadmap de mercado original (custo/rate-limit previsível) no mesmo trabalho. Nível 2 só
depois de validar demanda — é caro, e a qualidade dos agentes de pentest com modelos
menores/locais é uma incógnita que merece piloto isolado antes de virar promessa de
produto.

**Depende de:** multi-tenancy (isolar credencial por conta/usuário é o mesmo gap que o
roadmap de mercado original chama de **I-1**, hoje ausente confirmado pela auditoria de
21/07 — BYOK sério não existe sem isolamento por tenant, ou pelo menos por usuário, antes).

---

## 5. Arquitetura dos agentes de pentest (Web/API) ✅ decidido

Já coberto em detalhe no artifact "Sete Frentes, Um Núcleo" — resumo executivo aqui:

- **Não fragmentar** em 6 agentes especializados (Recon/Vuln/Auth/BizLogic/API/Reporting)
  — recriaria o problema que a operação já corrigiu em junho ("estrutura mal otimizada,
  repete muita coisa" → consolidado em skills compartilhadas).
- O modelo de duas fases (não-autenticado → autenticado) **já foi decidido e meio
  construído** em 2026-06-12: Agente 1 black-box pronto; Agente 2 autenticado (Playwright)
  em stub, pausado — **não travado** — pra priorizar UX por botões e disciplina anti-FP
  (ambos entregues desde então).
- **Correção a uma leitura anterior:** a auditoria de 21/07 apontou a fragmentação de 3
  frameworks (v2/legacy/v3) como bloqueador desta fase. Já foi resolvida em 15/07 (commit
  `977c916` — `v2c` promovido a tronco padrão, validado F4), **antes** da data-base daquela
  auditoria. O cabeçalho de `docs/ROADMAP-CONSOLIDACAO-AGENTE.md` ainda diz "aguardando
  validação do operador" — está desatualizado e vale corrigir só pra não repetir a
  confusão.
- **Próxima ação real:** retomar o item C (Agente 2). O relatório já sabe gerar variante
  `-authenticated` vs `-surface` por `AGENT_ROLE`; falta o agente em si e o gatilho de
  handoff na UI.

**Depende de:** nada — pode retomar imediatamente.

---

## 6. UX e design da aplicação 🔵

**Sinal do operador:** a visualização "está péssima" hoje — apesar da reformulação visual
de 23/07 (paleta/gráficos novos em `components/ui/charts/`) e do redesign de login de
24/07 (RadarStage).

**Recomendação antes de implementar:** já houve uma rodada de reformulação visual este mês
e o incômodo continua — vale um levantamento curto e específico (tela por tela: qual
incomoda, e por quê) antes de gastar outro ciclo de estilo. Distinguir dois problemas
diferentes que pedem soluções diferentes:

- **Visual** (cor/tipografia/espaçamento) — já teve uma rodada em 23/07; se o incômodo
  persiste, pode não ser isso.
- **Information design** (o que cada tela mostra primeiro, densidade de dado, hierarquia
  dashboard→detalhe) — mais provável ser a causa real se a rodada visual de 23/07 não
  resolveu.

**Ferramenta:** usar a skill `dataviz` já disponível no ambiente pra qualquer
gráfico/dashboard novo — evita reinventar critério de cor/legenda a cada tela.

**Depende de:** nada — mas vale rodar o diagnóstico curto antes de comprometer esforço de
implementação.

---

## 7. SAP + AD juntos 🟡

**Por que juntar faz sentido:** os dois já estão parcialmente construídos —
`domain-packs.js` tem ambos como `planned`, com as ferramentas certas já escolhidas:

- **AD:** `nxc` (NetExec), `bloodhound-python`, `certipy`, `impacket` — kit padrão da
  indústria hoje. `packs/ad.md` já tem conteúdo.
- **SAP:** `pysap` (base sólida) + `bizploit` (sinalizar: sem manutenção ativa há anos —
  para o checklist de misconfiguration/RFC/autorização, o guia **EAS-SEC** e advisories
  públicos da Onapsis são referência melhor que qualquer scanner OSS disponível hoje).
  `packs/sap.md` já tem conteúdo.

**Não são dois projetos paralelos — são um investimento de infra com dois clientes:**
ambos travados pelo **mesmo** bloqueador (Runner interno + transporte de inferência,
ver seção 0). Construir pensando nos dois (e no item 1, rede interna) ao mesmo tempo evita
reconstruir a peça de infra na segunda vez.

**Sequência técnica já decidida** (roadmap multi-domínio, 16/07): Azure → AD → SAP — não
SAP primeiro, apesar do valor de mercado maior, porque SAP acumula runner-novo + maior
raio de explosão ao mesmo tempo. O trabalho do pack Azure (identidade/PIM/federated creds,
commit `a00580f`) já treinou o raciocínio de "grafo de escalada" que o AD vai reusar via
BloodHound.

**Validação de mercado:** nenhuma das 12 plataformas concorrentes pesquisadas na auditoria
de 21/07 cobre SAP — dado real sustentando que vale investir aqui assim que a infra
estiver pronta, não só uma leitura interna.

**Depende de:** Runner interno + transporte de inferência (seção 0); RBAC destrutivo
por-ação + vault + kill-switch antes de qualquer coisa tocar produção interna (já
documentado no roadmap multi-domínio).

---

## 8. Credenciais expostas — represar a "seção", manter a correlação 🟡

**Sua avaliação bate com a pesquisa de mercado por caminho independente:** a auditoria de
21/07 já tinha chegado à mesma conclusão — **"buy, not build"** pra coleta primária de
stealer logs. Um player de porte médio-grande do nicho (SpyCloud) opera com **~261
funcionários**, maioria especialista em cibersegurança, pra fazer isso direito. Não é um
módulo, é uma empresa. Represar o amadurecimento do módulo Vazamentos como "seção rica de
credenciais expostas" está certo.

**O que NÃO represar — a correlação é barata e vale isolada:** nome de usuário ↔ empresa ↔
domínio ↔ credenciais públicas (a metade que faltava no Epic 7 original) não depende de
construir/manter feed de stealer logs. Só precisa de:

1. Resolver empresa a partir do domínio.
2. Enumerar funcionários por fonte **compliant** — **Hunter.io** (evitar scraping de
   LinkedIn: zona cinzenta de ToS, litigada em *hiQ v. LinkedIn*).
3. Hunter.io já infere o padrão de e-mail da organização (nome.sobrenome etc.) como
   funcionalidade própria — não precisa construir isso.
4. Cruzar com o que os providers grátis já plugados devolvem (LeakCheck público, já em
   produção).

**Ou seja — duas iniciativas que estavam empacotadas como um "Epic 7" só:**

| | Vira seção de produto (QuimeraX-like) | Pipeline de correlação leve |
|---|---|---|
| Decisão | **Represado** | **Mantido** |
| Custo/manutenção | Alto (coleta própria, headcount especializado) | Baixo (1 API + função de cruzamento) |
| Onde mora | Módulo Vazamentos, como está hoje | Painel novo dentro do assessment de Domínio existente |

**Gate legal continua valendo:** evitar scraping de LinkedIn, usar fonte compliant, mesmo
gate de autorização (`Domain.authorized`) + máscara LGPD (`leaks/mask.js`) que o Vazamentos
já tem, estendido pra cobrir esta fonte nova.

**Depende de:** nada tecnicamente — é o item mais barato desta lista de fazer isolado.

---

## Dependências cruzadas (resumo)

| Peça de infra | Quem depende dela |
|---|---|
| **Runner interno** | Item 1 (fase always-on), Item 7 (AD + SAP) |
| **Transporte de inferência** (Bedrock-no-VPC/on-prem) | Mesmo grupo do Runner — pré-requisito dele tocar dado sensível |
| **Multi-tenancy** (`tenant_id` real) | Item 4 (BYOK sério), Item 3 (se abrir conexões por-usuário) |
| **Migração Anthropic API** (I-5) | Item 4, Nível 1 — mesma migração, ângulos diferentes (BYOK vs custo/rate-limit) |

Itens **sem dependência de infra nova**, podem andar em paralelo desde já: 2 (ASM), 3
(conexões, exceto multi-usuário), 5 (retomar Agente 2), 6 (UX), 8 (correlação de
credenciais), e o MVP manual do item 1.
