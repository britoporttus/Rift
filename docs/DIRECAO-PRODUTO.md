# Rift — Direção de Produto (norte)

> Documento de direção. Define o que estamos construindo, para quem, em que
> formato, e em que ordem. Serve de referência antes de escrever qualquer código.
> Escrito em 2026-06-12. Substitui a ideia de "chatbot de pentest" por um
> **painel de execução guiado**.

---

## 1. Em uma frase

O Rift é a **camada de cobertura automática de segurança**: cria um engagement,
faz algumas perguntas, e roda sozinho o mapeamento externo + checagens de baixo
risco — entregando **poucos achados de alta confiança** e um mapa de superfície,
com interações pontuais nos momentos que importam.

## 2. O que É / o que NÃO é

| É | NÃO é |
|---|---|
| Cobertura do **repetível e automático** | Um "auto-hacker" que sai explorando tudo |
| **Baixo ruído** — poucos achados, alta confiança | Um scanner que cospe 200 "críticos" (falsos) |
| Um **painel** que roda e mostra progresso ao vivo | Um chatbot onde você conversa turno a turno |
| Um assistente que **pergunta nos pontos-chave** | Algo que exige o operador o tempo todo |
| A **primeira passada** confiável antes do humano | Substituto do pentester humano |

**Por que isso importa:** a adesão a pentest automatizado é baixa por causa de
**falsos positivos**. Nosso diferencial não é achar "mais" — é achar **certo**,
com ruído mínimo. Isso é o que transforma "receio de concluir" em produto vendável.

## 3. O fluxo do usuário (a visão)

```
[1] Operador cria um engagement (alvo + escopo)
        │
[2] IA faz o intake guiado  ── perguntas objetivas (como /pentest-intake,
        │                       mas em passos/botões, não chat livre)
        ▼
[3] Roda AUTOMÁTICO  ── recon → enum → vulns simples
        │              (o operador não precisa ficar mandando comando)
        ▼
[4] Achados AO VIVO  ── aparecem num painel conforme são confirmados
        │              (severidade, evidência, print)
        ▼
[5] Ponto importante? ── NOTIFICA / PERGUNTA a ação (checkpoint):
        │                "achei X, quero fazer Y? [Sim] [Não] [Só reportar]"
        ▼
[6] Fim  ── relatório de superfície + recomendação (aprofundar com credenciais = Agente 2, depois)
```

A sensação é de **acompanhar um processo** com interações pontuais — não de
digitar num chat.

## 4. O formato da interface (não-chatbot)

Trocar o chat central por um **painel de execução do engagement**:

- **Intake guiado**: sequência curta de perguntas objetivas (alvo, ambiente,
  intensidade, WAF, foco) — em passos/formulário, com defaults sensatos.
- **Timeline de fases**: recon → enum → vuln, cada uma com estado (fila/rodando/ok)
  e progresso.
- **Findings ao vivo**: cards que aparecem conforme confirmados (severidade, título,
  evidência/print, PoC). Este é o coração da tela.
- **Prompts de decisão**: notificação + pergunta clicável nos checkpoints
  (o mecanismo `rift-question` → botões que já construímos serve exatamente a isso).
- **Log/feed** (secundário): o que o agente está fazendo, colapsável — não o centro.
- Texto livre **opcional** (para o operador pedir algo pontual), não o modo principal.

**Ganho de token/eficiência:** cada ação é um run curto e delimitado que lê o
estado do disco — não uma conversa infinita que recarrega tudo a cada turno.

## 5. Agente 1 — escopo do "básico" (FOCO AGORA)

O Agente 1 é black-box, **sem credenciais** (ver `pentest-framework-v2/core/agent-1-blackbox.md`).
O básico que ele deve cobrir bem:

1. **Mapeamento da estrutura externa**: subdomínios, hosts vivos, stack, WAF,
   portas, assets expostos (swagger, `.env`, `.git`, painéis).
2. **Busca de credenciais/acesso sem login**: creds vazadas (OSINT), default
   credentials, exposições óbvias.
3. **Vulnerabilidades simples e de alta confiança**: exposições diretas, CORS
   wildcard, ausência de auth em endpoint óbvio, CVEs do stack (com confirmação),
   tentativas de auth bypass simples.
4. **Entrega**: mapa de superfície + poucos achados confiáveis + recomendação de
   aprofundar (Agente 2).

Fora do escopo do Agente 1 (por enquanto): exploração pesada, teste autenticado,
fuzzing agressivo, pós-exploração.

## 6. Princípio anti-falso-positivo (documentar agora, LAPIDAR depois)

Registrado como norte — a implementação fina vem **depois** do básico funcionar
(decisão do operador: "básico primeiro, depois lapidar a lógica e as afirmações"):

- **Confirmar-ou-rebaixar**: sem reprodução real (request+response) → `probable`,
  nunca `confirmed`.
- **Evidência obrigatória**: print (`tools/screenshot.py`) e/ou request salvo.
- **Verificação adversarial**: antes de reportar, um passo que *tenta derrubar* o
  próprio achado.
- **Severidade honesta**: header ausente / version disclosure = `informational`,
  não "vulnerabilidade".

Base já existe: taxonomia `confirmed/probable/informational` +
`memory/global/false-positives.yaml`.

## 7. Sequência de construção

| Etapa | Objetivo | Status |
|---|---|---|
| **A — Básico ponta a ponta** | criar engagement → intake guiado → Agente 1 roda sozinho → findings ao vivo → checkpoint com pergunta | ⏳ próximo |
| **B — Lapidar confiança** | disciplina anti-FP + score de confiança + verificação adversarial | ⏳ depois |
| **C — Agente 2** | autenticado (Playwright) + handoff Opção A (mesma sessão, troca de papel ao dar credenciais) | ⏳ por último |

Regra: **não avançar pra B/C antes de A funcionar de verdade.**

## 8. O que já temos que serve a essa visão

- **Fases automáticas**: comandos `recon/enum/vuln` (já de-duplicados via skills).
- **Perguntas clicáveis**: `rift-question` → `agent_question` → botões (serve aos
  prompts de decisão do passo [5]).
- **Findings ao vivo**: watcher + sidebar de findings já transmitem em tempo real.
- **Evidência**: `tools/screenshot.py` (chromium headless, testado).
- **Eficiência**: skip-permissions, `--resume`, `/rift-compact`, medidor de contexto.
- **Papel**: `AGENT_ROLE=blackbox` já fia o Agente 1 ponta a ponta.

O que **falta** para a Etapa A é sobretudo a **casca de UX** (painel de execução +
intake guiado + notificações) por cima do que já roda, e o Agente 1 disparar o
fluxo automático sozinho após o intake.

## 9. Decisões (resolvidas em 2026-06-12)

1. **Aba nova "Execução"** — não substitui o chat agora; se ficar melhor, substituímos depois.
2. **Notificações in-app primeiro**; e-mail depois.
3. **Intake guiado híbrido** — form visual em etapas **e** a IA perguntando, o mais
   real e engajado possível (aceita clique e texto; a IA interpreta).

## 10. Etapa A — quebra em incrementos

| # | Incremento | Entrega |
|---|---|---|
| **A1** | **Aba "Execução"** (frontend) | ✅ FEITO — `components/engagement/ExecutionPanel.tsx`: hero (alvo/findings/custo/status), timeline recon→enum→vuln, decisão pendente em destaque, findings ao vivo em grid, feed colapsável, CTA "Iniciar mapeamento". Aba padrão do engagement; chat mantido. |
| **A2** | **Auto-run do Agente 1** | 🔶 parcial — o CTA "Iniciar" já manda uma instrução p/ o agente encadear recon→enum→vulns simples sozinho (via OPERATING MODE). FALTA: emitir `phase_update` de forma confiável p/ a timeline refletir a fase real. |
| **A3** | **Intake guiado híbrido** | wizard visual em etapas + IA, defaults sensatos, cria engagement + scope. |
| **A4** | **Notificações in-app** | nos checkpoints, toast/badge visível além do prompt clicável. |

Começar por **A1** (mais visível, additiva, baixo risco).
