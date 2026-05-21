# Rift — AI Pentest Platform

Você é o agente de desenvolvimento do **Rift**, uma plataforma web que expõe o pentest-framework-v2 (já instalado nesta VPS) através de uma interface moderna.

**Stack:** Next.js 14 + Node.js + WebSocket + SSH2 | **Paleta:** roxo/preto (#080810, #7C3AED) | **Modelo:** claude-sonnet-4-6

---

## O QUE É O RIFT

Uma plataforma web onde operadores de pentest:
- Criam e gerenciam engagements (escopos)
- Conversam com o agente de IA via **chat** (não terminal)
- Acompanham findings em tempo real conforme descobertos
- Acessam relatórios executivo e técnico
- (Admin) Monitoram CPU, RAM, tokens usados e custo estimado

O agente de IA que roda os pentests já existe: é o **pentest-framework-v2** em `/home/digitalbath/pentest-framework-v2/`. O Rift é a camada web sobre ele.

---

## DECISÕES DE ARQUITETURA (não re-discutir)

**Como o backend aciona o agente:**
- Backend e framework estão na **mesma VPS** → sem SSH, usar `child_process.spawn('claude', [...])`
- Não migrar para Anthropic API ainda — usa a assinatura Claude Code existente

**Comunicação backend ↔ frontend:**
- **WebSocket** com mensagens JSON tipadas (bidirecional: agente envia updates, operador envia comandos)
- inotify/fswatch nos arquivos de findings para detectar novos findings em tempo real

**Intake (configuração de escopo):**
- Via chat: operador digita `/pentest-intake` e o agente pergunta um a um
- Via botão: form visual em etapas (mesmo fluxo, mas UI)
- Ambos criam os mesmos arquivos em `context/` e `config/` do framework

**Após intake:**
- Agente responde: "✅ Escopo configurado! Deseja iniciar testes automatizados no alvo?"
- Operador clica [Iniciar testes] — não começa automaticamente

---

## ESTRUTURA DO MONOREPO

```
rift/
├── CLAUDE.md              ← este arquivo
├── package.json           ← root (workspaces)
├── frontend/              ← Next.js 14
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── dashboard/
│   │   ├── engagement/[id]/
│   │   ├── findings/
│   │   ├── reports/
│   │   └── admin/
│   ├── components/
│   │   ├── chat/
│   │   ├── findings/
│   │   └── ui/
│   └── package.json
└── backend/               ← Node.js
    ├── src/
    │   ├── server.js      ← express + ws
    │   ├── auth.js        ← JWT
    │   ├── agent-runner.js← spawn claude
    │   ├── findings-watcher.js ← inotify
    │   └── api/
    │       ├── engagements.js
    │       ├── findings.js
    │       └── reports.js
    └── package.json
```

---

## OS 5 MÓDULOS DA UI

### 1. Chat (tela principal)
```
┌──────────────────────────────┬─────────────────────────┐
│  FEED DO AGENTE              │  FINDINGS (live)        │
│                              │                         │
│  🔍 subfinder rodando...     │  🔴 Swagger exposto HIGH│
│  ✅ 14 subdomains            │  🟡 CORS wildcard MED   │
│  🚨 [Finding card]           │                         │
│  ❓ Continuar? [Sim][Não]    │  fase: ██████░░  60%    │
│                              │                         │
│  [input: /pentest-recon...]  │  💰 $1.24 usados        │
└──────────────────────────────┴─────────────────────────┘
```

### 2. Engagements — lista com status, fase atual, findings count
### 3. Findings — banco global filtrável por severidade/engagement
### 4. Relatórios — executivo (C-level) e técnico, download PDF/HTML
### 5. Admin — CPU/RAM/Disk + tokens/custo por dia/semana/mês

---

## ROLES

| Ação | admin | user |
|---|---|---|
| Criar engagement | ✅ | ✅ |
| Rodar fases passivas (recon, enum) | ✅ | ✅ |
| Rodar fases agressivas (exploit, post) | ✅ | ❌ |
| Ver relatório técnico | ✅ | ✅ |
| Ver relatório executivo | ✅ | ❌ |
| Aprovar checkpoint crítico (RCE, SQLi) | ✅ | ❌ notifica admin |
| Painel admin | ✅ | ❌ |
| Gerenciar usuários | ✅ | ❌ |

---

## EVENTOS WEBSOCKET (contrato de dados)

Cada mensagem é JSON com `type`:

```json
{ "type": "agent_thinking",  "text": "Analisando subdomains..." }
{ "type": "agent_action",    "tool": "subfinder", "status": "running", "args": "-d target.com" }
{ "type": "agent_action",    "tool": "subfinder", "status": "done", "result": "14 subdomains" }
{ "type": "finding",         "id": "001", "severity": "high", "title": "Swagger exposto", "engagement_id": "..." }
{ "type": "agent_question",  "text": "Continuar para enum?", "options": ["Sim", "Não"] }
{ "type": "agent_message",   "text": "Recon completo. 4 findings." }
{ "type": "phase_update",    "phase": "recon", "progress": 60 }
{ "type": "cost_update",     "usd": 1.24, "tokens": 48000 }
```

Frontend → Backend (operador respondendo):
```json
{ "type": "operator_message", "text": "sim, continua" }
{ "type": "operator_answer",  "option": "Sim" }
```

---

## PALETA DE CORES

```
--bg:           #080810    (fundo principal)
--surface:      #0F0F1A    (cards, painéis)
--border:       #2D2D4E    (bordas)
--purple:       #7C3AED    (accent principal)
--purple-light: #A78BFA    (texto secundário, ícones)
--purple-glow:  rgba(124,58,237,0.15)

--critical:     #EF4444
--high:         #F97316
--medium:       #EAB308
--low:          #22C55E
--info:         #3B82F6

--text:         #E2E8F0
--muted:        #94A3B8
```

---

## USERFLOW COMPLETO

```
Login → Dashboard → [+ Novo Escopo] ou /pentest-intake no chat
     → Intake (form ou chat) → "Escopo pronto! Deseja iniciar?"
     → [Iniciar testes] → Chat ativo com feed em tempo real
     → Findings aparecem no sidebar conforme descobertos
     → Checkpoint: agente pausa, operador decide
     → /pentest-report → relatórios gerados
```

---

## ONDE O PENTEST FRAMEWORK ESTÁ

```
/home/digitalbath/pentest-framework-v2/
├── .claude/commands/     ← skills: /pentest-recon, /pentest-enum, etc.
├── context/              ← engagement-state.yaml, credentials.yaml (gitignored)
├── config/               ← scope.yaml por engagement
├── clients/              ← findings, evidence, reports por cliente
└── knowledge-base/       ← SQLite com histórico de findings
```

O backend do Rift lê/escreve nesse diretório para:
- Criar scope.yaml e engagement-state.yaml (intake)
- Monitorar clients/{slug}/{date}/findings/ (novos findings)
- Servir relatórios de clients/{slug}/{date}/reports/

---

## ORDEM DE CONSTRUÇÃO

1. **Setup do monorepo** — package.json root com workspaces, estrutura de pastas
2. **Backend: auth** — Express + JWT + 2 rotas (/login, /me)
3. **Backend: agent-runner** — spawn claude + captura stdout + emite eventos WS
4. **Backend: findings-watcher** — inotify nos findings do framework
5. **Frontend: layout** — sidebar, paleta de cores, dark theme
6. **Frontend: chat** — feed de mensagens + input + sidebar de findings
7. **Frontend: dashboard** — lista de engagements
8. **Frontend: findings** — banco global filtrável
9. **Frontend: reports** — visualização + download
10. **Frontend: admin** — métricas de infra + tokens

**Começar pelo passo 1.** Não pular etapas.

---

## NOTAS IMPORTANTES

- Node.js v20 instalado via nvm — rodar `source ~/.zshrc` antes de usar node/npm
- O diretório do framework tem `.claude/settings.json` com permissões dos tools de pentest
- `context/` é gitignored no framework (contém credenciais)
- Engagements em andamento vivem em `context/{engagement_id}/`
- Por enquanto: 1 usuário, 1 VPS, sem multi-tenancy
