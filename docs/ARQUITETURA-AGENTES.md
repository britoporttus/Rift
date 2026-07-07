# Rift — Arquitetura dos Agentes de Pentest

> Documento vivo. Explica como o Rift orquestra o pentest-framework-v2, o que
> mudou nas últimas sessões, e como o agente trabalha a partir de agora.
> Objetivo: você entender a arquitetura e sugerir melhorias.
> Última atualização: 2026-06-12.

---

## 1. Visão geral em uma frase

O **Rift** (Next.js + Node/WebSocket) é a camada web sobre o **pentest-framework-v2**
(orquestrado por Claude Code). O backend do Rift **spawna o `claude`** dentro do
diretório do framework e transmite o stream para o chat. Estamos migrando de
**1 agente monolítico** para **2 agentes especializados** coordenados pelo backend.

```
Operador (browser)
      │  WebSocket (mensagens JSON tipadas)
      ▼
Backend Rift (Node)  ── ORQUESTRADOR ──┐
      │  child_process.spawn('claude') │ define AGENT_ROLE, faz handoff,
      ▼                                 │ gerencia sessão/custo/contexto
pentest-framework-v2 (Claude Code)  ◄──┘
      │  lê CLAUDE.md + skills/ + agents/ + commands/
      ▼
estado em disco: context/{id}/ , clients/{slug}/{date}/ (findings, evidence, reports)
```

---

## 2. Os 2 agentes

| | **Agente 1 — Black-box** | **Agente 2 — Autenticado** |
|---|---|---|
| Perspectiva | Atacante externo anônimo | Usuário/admin logado |
| Credenciais | **Nenhuma** (nunca pede, nunca lê) | Recebe do operador (`credentials.yaml`) |
| `AGENT_ROLE` | `blackbox` (padrão) | `authenticated` |
| Diretriz | `core/agent-1-blackbox.md` | `core/agent-2-authenticated.md` |
| Fases | recon → enum → vuln-unauth → tentativas de acesso | mapeamento Playwright → IDOR/BOLA/BFLA → lógica de negócio |
| Termina | relatório de superfície + **recomenda** credenciais | relatório autenticado |
| Status | ✅ implementado (Fase 2) | ⏳ em construção (Fase 3) |

**Decisões fixas:**
- **Separação real**: cada agente é um spawn `claude` distinto, com role próprio.
- **Sem auto-chain**: o Agente 1 roda sozinho. Pode-se querer só o teste de superfície.
- **Handoff manual**: ao fim do Agente 1, ele *recomenda* credenciais; o operador decide.
- **Relatórios distintos** por agente.
- **Evidência por print**: Python Playwright + chromium (já instalados na VPS).

---

## 3. Como o Agente 1 trabalha hoje (passo a passo)

1. Operador abre o engagement no Rift e manda uma mensagem (ou clica "Iniciar testes").
2. Backend spawna `claude` com:
   - `--dangerously-skip-permissions` (headless não tem diálogo de permissão);
   - `--resume {session_id}` se a sessão já existe (continuidade);
   - `AGENT_ROLE=blackbox` no ambiente;
   - um bloco `[CONTEXTO DO SISTEMA]` injetado com escopo, regras e o **papel** (Agente 1).
3. O `claude` lê o `CLAUDE.md` → detecta `AGENT_ROLE=blackbox` → carrega `core/agent-1-blackbox.md`.
4. O Agente 1 executa os comandos de fase (`/pentest-recon`, `/pentest-enum`,
   `/pentest-vuln`) que, agora, usam **skills compartilhadas** (sem duplicação).
5. Tenta **ganhar acesso sem credenciais** (`skills/cred-acquisition.md`): default
   creds, auth bypass, SQLi em login, falhas de JWT, credenciais vazadas (OSINT).
6. Salva findings como YAML em `clients/{slug}/{date}/findings/` (na hora).
7. Ao esgotar a superfície: gera o **relatório de superfície** e mostra uma
   **pergunta clicável** recomendando fornecer credenciais para o Agente 2.

**O que o Agente 1 NÃO faz:** pedir/ler credenciais; rodar `idor/bola/bfla`
(exigem sessão); rodar `post-auth-mapper` ou pós-exploração; tratar "sem acesso"
como erro.

---

## 4. Componentes técnicos (o que existe sob o capô)

### Orquestração / spawn (`backend/src/agent-runner.js`)
- Spawna `claude --output-format stream-json --verbose --dangerously-skip-permissions [--resume id] --print <prompt>`.
- Mapeia o stream-json → eventos WebSocket (`agent_message`, `agent_action`, `finding`, `cost_update`, …).
- `AGENT_ROLE` é injetado no ambiente do processo.

### Continuidade de sessão (`--resume`)
- O `session_id` do `claude` é capturado do stream e **persistido no Mongo**
  (`ChatSession.claudeSessionId`). Sobrevive a restart do backend.
- Evita o agente "re-rodar recon do zero" a cada mensagem.

### Permissões
- Headless → sem diálogo. `--dangerously-skip-permissions` evita o loop de
  "aprove no popup". Escopo segue limitado por `config/scope.yaml` + teto de custo.

### Medidor de contexto + compactação
- Evento `context_usage` (tokens de entrada do último turno) → medidor de "memória"
  no header do chat (verde/amarelo/vermelho). Persistido em `ChatSession.contextTokens`.
- `/rift-compact` (skill `rift-compact.md` + botão "Compactar"): salva estado/resumo
  em disco e **descarta o histórico do CLI** → próxima sessão começa enxuta.

### UX do chat
- **Input travado enquanto o agente roda** (sinal `agent_status` running/idle).
- **Perguntas clicáveis**: o agente emite um bloco ```rift-question``` → o backend
  vira `agent_question` → o front renderiza botões. Resposta volta como `operator_answer`.

### Skills compartilhadas (de-dup — `pentest-framework-v2/skills/`)
- `engagement-loader.md` — resolve/carrega o engagement; **respeita `AGENT_ROLE`**
  (blackbox ignora `credentials.yaml`).
- `phase-board.md` — board de status (só em transição de fase).
- `phase-state.md` — guarda de re-execução + entrada + conclusão de fase.
- Os 8 comandos (`recon, enum, vuln, exploit, post, checkpoint, routine, report`)
  agora referenciam essas skills em vez de copiar blocos.

### Estado em disco (fonte de verdade)
- `context/{id}/engagement-state.yaml` — fase atual, `phases_completed`, `shadow_graph`.
- `context/{id}/scope.yaml` — alvo autorizado.
- `clients/{slug}/{date}/findings/*.yaml` — findings (lidos pelo watcher do Rift).
- `clients/{slug}/{date}/reports/` — relatórios.
- `memory/` (global, cross-engagement) — lições, mapa de vuln por stack, histórico.

---

## 5. Histórico de mudanças (por sessão)

| Fase | O que foi feito | Onde |
|---|---|---|
| Correções estruturais | skip-permissions, `--resume`, OPERATING MODE no CLAUDE.md, intake enxuto (10→1-2 turnos), hook/globs | agent-runner.js, server.js, framework |
| UX | input travado durante run; perguntas clicáveis (`rift-question`) | hook WS, ChatInput, MessageFeed, agent-runner |
| Durabilidade + contexto | `claudeSessionId`/`contextTokens` no Mongo; medidor de contexto; `/rift-compact` | ChatSession, server.js, agent-runner, page.tsx |
| **De-dup** (Passo 1) | 3 skills compartilhadas; 8 comandos refatorados; bug do checkpoint corrigido | framework skills/ + commands/ |
| **Agente 1** (Passo 2) | role black-box sem credenciais; branch `AGENT_ROLE`; wiring no backend | core/agent-1-blackbox.md, CLAUDE.md, agent-runner, server.js |

---

## 6. O que falta (roadmap)

- ✅ **Evidência por print** — `tools/screenshot.py` (engine: chromium headless do
  sistema, zero deps; testado). Recon captura print de cada host vivo em `evidence/`.
  ⚠️ Screenshots **autenticados** (com cookies de sessão, p/ Agente 2) precisam de
  Playwright, que aqui exige resolver o Node (pacote Debian procura `/usr/bin/node`,
  Node está no nvm). Fica para a Fase 3 com o Agente 2.
- ✅ **Relatórios distintos** — `/pentest-report` agora gera variante por `AGENT_ROLE`:
  `-surface` (Agente 1) vs `-authenticated` (Agente 2), com seções próprias e prints embutidos.
- ⏳ **Agente 2 (autenticado)** — implementar `core/agent-2-authenticated.md` de fato.
- ⏳ **Handoff** — backend dispara o Agente 2 (`AGENT_ROLE=authenticated`) quando o
  operador fornece credenciais após a recomendação do Agente 1. **Mecanismo a decidir** (ver §7.1).
- ⏳ **Screenshots autenticados** — resolver Node p/ Playwright (ex.: symlink
  `/usr/bin/node`, requer sudo) OU perfil chromium com cookies.
- ⏳ **"Reaproveitar mas não se prender"** — carregar findings antigos como *hints*
  a re-verificar, nunca como verdade fixa (usa `memory/targets/{hash}/`).
- ⏳ **Durabilidade do role** — hoje o role é fixo `blackbox`; com o handoff, o backend
  precisará persistir/alternar o role por sessão (campo `agentRole` no `ChatSession`).

---

## 7. Pontos abertos para você decidir / melhorar

1. **Gatilho do Agente 2**: por sessão nova? Mesma sessão com troca de role? Botão dedicado na UI?
2. **Relatórios**: um relatório por agente, ou um consolidado com 2 seções?
3. **Reaproveitamento de testes antigos**: quanto confiar no histórico vs sempre re-verificar?
4. **Escopo de "ganhar acesso" no Agente 1**: até onde ele tenta bypass/SQLi antes de recomendar credenciais?
5. **Evidência**: além de print, capturar HAR/requests? Anexar no relatório como?
