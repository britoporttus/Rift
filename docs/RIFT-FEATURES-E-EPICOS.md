# Rift — Panorama de Features e Épicos (para plano de negócio)

> Documento autocontido para exportar a outras IAs / stakeholders. Consolida o que
> **já está no ar**, o que está **em andamento** e os **épicos planejados**.
> Data-base: 2026-07-31. Legenda: ✅ pronto/no ar · 🟡 parcial · 🔵 planejado · ⛔ bloqueado por infra.

---

## 1. O que é o Rift (posicionamento)

Plataforma web de **pentest e gestão de superfície de ataque conduzida por um agente de IA**.
O operador cria escopos (engagements), conversa/aciona o agente, acompanha achados
(findings) em tempo real e gera relatórios executivo e técnico — sem operar um terminal.
Um agente de IA (baseado em Claude) executa recon, enumeração e checagens de forma
autônoma, entregando **poucos achados de alta confiança** em vez de inundar de falsos
positivos.

**Público:** equipes internas de segurança ofensiva (pentesters) e times de GRC/TPRM que
precisam monitorar a exposição de fornecedores/parceiros.

**Stack:** Next.js 14 (frontend) · Node.js/Express + WebSocket (backend) · MongoDB/Mongoose ·
agente via Claude (Claude Code CLI hoje) · deploy em VPS única (pm2 + GitHub Actions +
Cloudflare). Modelo de segurança forte por design (anti-SSRF, gate de autorização legal,
cofre de credenciais efêmero, RBAC).

---

## 2. Módulos e capacidades JÁ NO AR (✅)

### 2.1. Domínios — ASM externo (superfície de ataque) ✅
Descoberta e pontuação de risco por domínio, **100% determinística e barata** (roda binários
ProjectDiscovery direto, sem consumir tokens de IA).
- Pipeline: subfinder → resolução DNS → httpx (probe web) → nuclei (exposições + CVEs) →
  varredura de portas nativa → mapeamento de ASN/netblock.
- **Score de segurança 0–100 transparente** (mostra o "porquê" de cada ponto).
- **Subdomain takeover:** heurística passiva de CNAME pendente + confirmação ativa (nuclei).
- **DNS bruteforce nativo** (wordlist embarcada + guard de wildcard) para achar subdomínios
  que fontes passivas não listam.
- **Recon visual (screenshots)** de cada host vivo (httpx + Chromium), com galeria + lightbox.
- **Atribuição correta de terceiros:** IPs de provedores SaaS/CDN (Microsoft 365, MailChimp,
  Cloudflare…) e vizinhos de datacenter são rotulados e não inflam o risco do alvo.
- **Modelo passivo vs ativo:** só domínio **autorizado** (gate legal) recebe pacote ativo;
  todo IP passa por um guard anti-SSRF (bloqueia RFC1918/loopback/metadata de nuvem).
- **Histórico de monitoramento** + diff de superfície (novo/sumido, Δscore) por scan.

### 2.2. Rede Interna — descoberta de ativos de LAN ✅
A plataforma não alcança a LAN do cliente, então um **agente local** roda numa máquina interna
e envia o inventário de volta (autenticado por token; funciona em Windows e Linux/macOS).
- Agente sem dependências (PowerShell nativo / Python stdlib); usa **nmap** quando presente
  para enriquecer (versão de serviço, OS, SMBv1, fabricante por MAC).
- **Profundidade Médio/Full** (Médio ≈ 54 portas curadas, rápido; Full = 1–1024 + extras).
- Inventário: IP/hostname/MAC/fabricante/OS/portas/serviços, com **classificação de dispositivo**
  (servidor, switch, roteador, firewall, hypervisor, câmera, VoIP, IoT, impressora, desconhecido).
- **Score de risco da rede** + recomendações de segurança agrupadas por achado, com
  urgência/SLA e **exportação de planilha (CSV)** pronta pra virar backlog.
- **Topologia visual** (React Flow): radial gateway-cêntrico + estrutura por sub-rede.
- Gate de autorização legal igual ao dos Domínios; modo contínuo opcional (agente `--watch`).

### 2.3. Pentest Web/API — agente de IA ✅ (Agente 1 pronto)
Fluxo de engagement conduzido por IA.
- **Funil "Novo Pentest"** → tipo → **intake de escopo** (ambiente, tipo de app, intensidade,
  WAF, foco, exclusões, limite de gasto).
- **Domain packs** plugáveis: `web` (black-box), `web-auth` (web autenticado — usuário/senha,
  JWT, 2FA), `azure` (cloud autenticado com Service Principal). `sap`/`ad` já modelados (planned).
- **Cofre de credenciais efêmero:** credenciais ficam só em memória durante o run, mascaradas na
  UI, nunca gravadas em disco/log (compliance/LGPD).
- **Execução em tempo real** via WebSocket: feed do agente, ações, findings aparecendo ao vivo,
  perguntas/checkpoints, atualização de custo/tokens.
- **Taxonomia de findings** (confirmado vs superfície/probable) + anti-falso-positivo.
- **Sistema de Jobs + fila durável** (execuções sobrevivem a restart; agendamento recorrente).

### 2.4. Mapa de Superfície ✅
Grafo visual (React Flow / mind-map) que interliga Domínios + Findings por string de domínio;
hubs compartilhados (IP, tecnologia, web server) fazem clusters emergirem sozinhos. Portas
aparecem aninhadas ao IP/subdomínio que as descobriu.

### 2.5. Relatórios ✅
Executivo (C-level) e técnico; download PDF/HTML (render via Chromium); design dark.

### 2.6. Vazamentos (credenciais expostas) 🟡 → em construção
Módulo estilo QuimeraX (círculo de risco, KPIs, timeline, famílias de stealer) com **providers
plugáveis** (mock/HIBP/DeHashed/LeakCheck), gate de autorização e máscara LGPD.
**Status atual:** pausado ("em construção") — ver Épico 8. Sinal de vazamento neutralizado no
score e no Mapa por flag (reversível); dados e lógica preservados.

### 2.7. Plataforma / transversal ✅
- **Autenticação:** login + **SSO Azure/Entra ID** (App Registration), sessão por cookie HttpOnly.
- **RBAC:** admin vs user (fases agressivas, relatório executivo, painel admin, gestão de usuários
  restritos a admin); checkpoint crítico (RCE/SQLi) exige aprovação.
- **Painel Admin:** métricas de infra (CPU/RAM/disco) + tokens/custo por dia/semana/mês.
- **Segurança de plataforma:** net-guard anti-SSRF, CSP, RBAC destrutivo por-ação para packs
  autenticados, expansão de netblock só de faixas comprovadamente do alvo (guard anti-cloud).
- **Entrega:** CI (lint/build/testes) + deploy automático em merge; ~430 testes automatizados.

---

## 3. Entregue nesta rodada (jul/2026) — recém no ar

**ASM Fases 3–5:** subdomain takeover, DNS bruteforce nativo, recon visual (screenshots);
lapidação da atribuição de terceiros; portas agrupadas por IP; nameservers deixam de poluir.

**Reforma de UX/IA (4 PRs):** navegação linear **Domínios → Novo Pentest → tipo → config →
resultado**. Domínios virou a home (Dashboard saiu do menu); funil "Novo Pentest" com 5 tiles
(Rede Interna, Cloud/Azure, Web/API ativos; SAP e AD "em construção"); sub-fluxo Web/API
(black-box vs autenticado, novo pack `web-auth`); tela de config da Rede Interna (nome +
profundidade + pré-requisitos + comando do agente); Vazamentos represado como "em construção".

---

## 4. Épicos planejados (ordem de prioridade do operador)

> Cada épico traz **valor**, **esforço**, **dependências** e **status**.

### Épico 1 — Módulo de Rede Interna (evolução) 🟡
- **Feito:** MVP manual (agente local + inventário + score + topologia + recomendações) já no ar.
- **A fazer:** modo **always-on** sobre o Runner interno (scan contínuo, perfil conservador para
  não derrubar IoT/PLC frágil); fingerprint passivo (p0f/Zeek) e detecção de rogue device.
- **Depende de:** Runner interno (só a fase always-on).

### Épico 2 — ASM externo: monitoramento contínuo + melhorias 🟡
- **Menor esforço / maior retorno** (extensão pura do que já existe).
- **A fazer:** re-scan **agendado** + **risk-triggered** (gatilho por novo subdomínio, deploy,
  **CVE crítica** — não só calendário); ASN mapping mais rico; enriquecimento opcional tipo
  Shodan/Censys (camada paga).
- **Depende de:** nada — pode andar já.

### Épico 3 — Abas de conexão (integrações) 🔵
- Hub de integrações: **ticketing** (Jira/Azure DevOps), **MCP** (Rift como client de servidores
  MCP de terceiros — Jira/GitHub têm oficiais), e dogfooding: **conectar o GitHub do próprio Rift
  e rodar um scan nele** como critério de "pronto".
- Base já existe (`Finding.remediationStatus` + remediation-verifier). Arquitetura de adapter por
  plataforma (mesmo padrão de plugin dos leak-providers).
- **Depende de:** nada tecnicamente; ganha de multi-tenancy se abrir por-usuário.

### Épico 4 — BYOK (traga sua chave de IA) 🔵
- **Problema:** hoje o agente roda amarrado à assinatura Claude Code do operador (sessão de CLI,
  não chave de API) — não escala para "cada cliente usa a própria conta".
- **Nível 1 (recomendado primeiro):** trocar `spawn('claude')` pelo **Claude Agent SDK**, aceitando
  chave Anthropic/Bedrock/Vertex por env. Resolve BYOK real **e** custo/rate-limit previsível.
- **Nível 2 (depois, com piloto):** desacoplar de Claude e suportar qualquer LLM (inclusive local
  via Ollama/vLLM) — projeto de arquitetura, não feature; qualidade com modelos menores é incógnita.
- **Depende de:** multi-tenancy (isolar credencial por conta/usuário).

### Épico 5 — Arquitetura dos agentes Web/API ✅ decidido, 🟡 em execução
- **Decidido:** não fragmentar em 6 agentes; manter núcleo consolidado + skills compartilhadas.
- **Modelo de 2 fases:** Agente 1 black-box **pronto**; **Agente 2 autenticado (Playwright)** em
  stub, pausado — a próxima ação é retomá-lo (o relatório já sabe gerar variante autenticada vs
  superfície; o pack `web-auth` já coleta credenciais e instrui o agente; falta o crawler
  autenticado e o gatilho de handoff na UI).
- **Depende de:** nada — pode retomar já.

### Épico 6 — UX e design 🟡
- Rodada estrutural de IA/navegação **entregue** (seção 3). Próximo passo sugerido: diagnóstico
  tela-por-tela distinguindo **visual** (cor/tipografia) de **information design** (o que cada tela
  mostra primeiro, densidade, hierarquia) antes de novo ciclo de estilo. Usar a skill `dataviz`.
- **Depende de:** nada.

### Épico 7 — SAP + AD (pentest de ambientes internos) ⛔ 🟡
- Ambos já modelados como packs `planned` com o ferramental certo: **AD** (NetExec, BloodHound,
  Certipy, Impacket) e **SAP** (pysap/bizploit + guia EAS-SEC/Onapsis).
- **Sequência decidida:** Azure → AD → SAP (SAP por último: runner novo + maior raio de explosão).
- **Diferencial de mercado forte:** nenhuma das 12 plataformas concorrentes pesquisadas cobre SAP.
- **Depende de:** Runner interno + transporte de inferência + RBAC destrutivo/vault/kill-switch.

### Épico 8 — Credenciais expostas: represar coleta, manter correlação 🟡
- **Represado ("buy, not build"):** virar uma seção rica de stealer logs é caro (headcount
  especializado; um player médio do nicho tem ~261 pessoas). Módulo Vazamentos fica "em construção".
- **Mantido (barato e valioso):** pipeline de **correlação leve** — usuário ↔ empresa ↔ domínio ↔
  credenciais públicas, via fonte **compliant** (Hunter.io, evitando scraping de LinkedIn) +
  providers grátis já plugados. Mora como painel dentro do assessment de Domínio.
- **Depende de:** nada — item mais barato de fazer isolado.

---

## 5. Infraestrutura transversal (bloqueadores compartilhados)

Não são features vendáveis, mas **destravam vários épicos** — vale tratá-los como investimento único:

| Peça de infra | Destrava | Situação |
|---|---|---|
| **Runner interno** (execução dentro da rede do cliente + fila durável) | Épico 1 (always-on), Épico 7 (AD+SAP) | a construir |
| **Transporte de inferência** (Bedrock-no-VPC/on-prem) | pré-requisito do Runner tocar dado sensível | a construir |
| **Multi-tenancy** (`tenant_id` real) | Épico 4 (BYOK), Épico 3 (conexões por-usuário) | ausente hoje |
| **Migração p/ Anthropic API / Agent SDK** | Épico 4 Nível 1 (mesmo trabalho resolve custo/rate-limit) | a fazer |

**Andam em paralelo sem infra nova:** Épico 2 (ASM), 3 (conexões, exceto multi-usuário),
5 (Agente 2), 6 (UX), 8 (correlação) e o MVP da rede interna (já no ar).

---

## 6. Diferenciais para o plano de negócio

- **Poucos achados de alta confiança** (anti-FP) em vez de ruído — reduz custo de triagem.
- **Custo de operação baixo no ASM/rede interna:** coleta determinística por binários, sem gastar
  tokens de IA; a IA entra só na análise/exploração.
- **Cobertura ampla num só produto:** superfície externa (ASM) + rede interna + web/API autenticado
  + cloud (Azure) — com trilha para AD e **SAP** (lacuna real do mercado).
- **Compliance por design:** gate de autorização legal por alvo, anti-SSRF, cofre de credencial
  efêmero, máscara LGPD, RBAC destrutivo por-ação.
- **TPRM/monitoramento contínuo** de fornecedores/parceiros como caso de uso além do pentest pontual.

---

## 7. Resumo em uma tabela

| Área | Status | Observação |
|---|---|---|
| ASM externo (Domínios) | ✅ no ar | + takeover, DNS brute, screenshots; falta monitoramento agendado/risk-triggered (Épico 2) |
| Rede interna (MVP) | ✅ no ar | agente local + inventário + topologia + profundidade; always-on = Épico 1 |
| Web/API black-box (Agente 1) | ✅ no ar | intake + execução ao vivo + relatórios |
| Web/API autenticado (Agente 2) | 🟡 pausado | pack `web-auth` pronto; falta o crawler autenticado (Épico 5) |
| Cloud/Azure autenticado | ✅ no ar | Service Principal + cofre efêmero |
| Mapa de superfície | ✅ no ar | grafo interligado |
| Relatórios (exec/técnico, PDF) | ✅ no ar | — |
| Vazamentos | 🟡 em construção | represado; correlação leve = Épico 8 |
| Integrações (tickets/MCP) | 🔵 planejado | Épico 3 |
| BYOK | 🔵 planejado | Épico 4 (Nível 1 primeiro) |
| SAP + AD | ⛔ planejado | Épico 7 (depende de Runner) |
| Multi-tenancy / Runner / inferência on-prem | ⛔ infra | destrava 1/4/7 |
