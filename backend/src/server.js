require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const express = require('express')
// REL-1: captura rejeições em handlers async e as encaminha ao middleware de erro.
// Sem isto, no Express 4 uma Promise rejeitada deixa a request pendurada (sem resposta).
require('express-async-errors')
const { createServer } = require('http')
const { WebSocketServer } = require('ws')
const { URL } = require('url')
const cors = require('cors')
const jwt = require('jsonwebtoken')

const { connect } = require('./db')
const ChatMessage = require('./models/ChatMessage')
const { router: authRouter, JWT_SECRET } = require('./auth')
const authMicrosoftRouter = require('./api/auth-microsoft')
const engagementsRouter = require('./api/engagements')
const findingsRouter = require('./api/findings')
const reportsRouter = require('./api/reports')
const adminRouter = require('./api/admin')
const usersRouter = require('./api/users')
const agentRunner = require('./agent-runner')
const findingsWatcher = require('./findings-watcher')
const scheduler = require('./scheduler')
const { getEngagement, updateEngagement, appendUsage, countFindings } = require('./store')
const ChatSession = require('./models/ChatSession')

// Janela de contexto do modelo (tokens) — base do medidor de "memória".
const CONTEXT_LIMIT = Number(process.env.CONTEXT_LIMIT) || 200000
// SEC-2: teto de custo por run interativo do chat (0/ausente = sem teto).
const INTERACTIVE_COST_CEILING = Number(process.env.INTERACTIVE_COST_CEILING) || 0

const app = express()
app.set('trust proxy', 1)
const httpServer = createServer(app)
// SEC-4: o token do WS viaja como 2º subprotocolo ('rift-jwt, <jwt>'), fora da
// query string (que vazaria em logs de proxy/access). handleProtocols só ecoa
// 'rift-jwt' — nunca o token — de volta ao cliente.
const wss = new WebSocketServer({
  noServer: true,
  handleProtocols: (protocols) => (protocols.has('rift-jwt') ? 'rift-jwt' : false),
})

// Heartbeat do servidor: a cada 30s envia ping; encerra quem não respondeu o pong
// anterior. Detecta clientes mortos (evita broadcast para sockets zumbis) e mantém
// a conexão aquecida contra timeouts de proxy ocioso (Cloudflare ~100s).
const wsHeartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue }
    ws.isAlive = false
    try { ws.ping() } catch {}
  }
}, 30000)
wss.on('close', () => clearInterval(wsHeartbeat))

// engagementId -> Map<sessionId, Set<WebSocket>>
const engagementClients = new Map()

// Broadcast to ONE specific session's clients
function broadcastSession(engagementId, sessionId, event) {
  const sessMap = engagementClients.get(engagementId)
  if (!sessMap) return
  const clients = sessMap.get(sessionId)
  if (!clients) return
  const json = JSON.stringify(event)
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(json)
  }
}

// Broadcast to ALL sessions within an engagement (e.g. findings)
function broadcastEngagement(engagementId, event) {
  const sessMap = engagementClients.get(engagementId)
  if (!sessMap) return
  const json = JSON.stringify(event)
  for (const clients of sessMap.values()) {
    for (const ws of clients) {
      if (ws.readyState === 1) ws.send(json)
    }
  }
}

// Get live subscriber Set for a session (passed to agent runner)
function getSessionClients(engagementId, sessionId) {
  const sessMap = engagementClients.get(engagementId)
  if (!sessMap) return new Set()
  return sessMap.get(sessionId) || new Set()
}

// BUG-3: registra o notifier global do watcher (broadcast ao vivo). Feito 1x —
// o watcher passa a transmitir findings a QUALQUER conexão, não só à primeira.
findingsWatcher.setNotifier((engagementId, event) => broadcastEngagement(engagementId, event))

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(s => s.trim())
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    if (/\.trycloudflare\.com$/.test(origin) || /\.cloudflareaccess\.com$/.test(origin)) return cb(null, true)
    cb(new Error('Not allowed by CORS'))
  },
  credentials: true,
}))
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => res.json({ status: 'ok', version: '0.1.0' }))
app.use('/api/auth', authRouter)
app.use('/api/auth', authMicrosoftRouter)
app.use('/api/engagements', engagementsRouter)
app.use('/api/findings', findingsRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/admin', adminRouter)
app.use('/api/users', usersRouter)

// REL-1: 404 de API + middleware de erro global (DEPOIS das rotas). Sem o error
// handler, a rejeição async capturada por express-async-errors não teria destino.
app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }))
app.use((err, _req, res, _next) => {
  console.error('[api] erro não tratado:', err?.stack || err?.message || err)
  if (res.headersSent) return
  res.status(err?.status || 500).json({ error: 'Erro interno do servidor' })
})

// WebSocket upgrade — autentica via subprotocolo 'rift-jwt' (fallback: query token)
httpServer.on('upgrade', (req, socket, head) => {
  const urlObj = new URL(req.url, 'http://localhost')
  const engagementId = urlObj.searchParams.get('engagementId')
  const sessionId    = urlObj.searchParams.get('sessionId') || 'default'

  // SEC-4: token preferencialmente via subprotocolo ('rift-jwt, <jwt>'); fallback
  // para a query string (transição/retrocompat) — evitamos porque vaza em logs.
  const protoHeader = req.headers['sec-websocket-protocol'] || ''
  const protoToken  = protoHeader.split(',').map((s) => s.trim()).find((p) => p && p !== 'rift-jwt')
  const token       = protoToken || urlObj.searchParams.get('token')

  if (!token || !engagementId) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws._user         = payload
      ws._engagementId = engagementId
      ws._sessionId    = sessionId
      wss.emit('connection', ws)
    })
  } catch {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
  }
})

wss.on('connection', async (ws) => {
  const engId     = ws._engagementId
  const sessionId = ws._sessionId || 'default'
  const user      = ws._user

  // Heartbeat: marca a conexão como viva a cada pong (e a cada mensagem do cliente).
  ws.isAlive = true
  ws.on('pong', () => { ws.isAlive = true })

  // Register into engagementClients[engId][sessionId]
  if (!engagementClients.has(engId)) engagementClients.set(engId, new Map())
  const sessMap = engagementClients.get(engId)
  if (!sessMap.has(sessionId)) sessMap.set(sessionId, new Set())
  sessMap.get(sessionId).add(ws)

  console.log(`[ws] ${user.email} → engagement ${engId} / session ${sessionId}`)

  const engagement = await getEngagement(engId)
  if (engagement) {
    // Watcher por engagement: persiste findings, atualiza a contagem e transmite
    // ao vivo via notifier global (broadcast + count vivem dentro do watcher agora).
    findingsWatcher.watch(engId, engagement.slug, engagement.date, engagement.name)
  }

  ws.send(JSON.stringify({ type: 'connection_ready', text: '🔗 Rift conectado.' }))

  // REL-5: informa o estado atual do agente a quem (re)conectou — corrige o input
  // que ficava destravado após uma reconexão no meio de um run.
  const runnerKey = `${engId}:${sessionId}`
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'agent_status', state: agentRunner.isRunning(runnerKey) ? 'running' : 'idle' }))
  }

  // Reidrata o medidor de contexto com o último valor conhecido desta sessão.
  if (sessionId !== 'default') {
    ChatSession.findById(sessionId).lean()
      .then((s) => {
        if (s?.contextTokens && ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: 'context_usage',
            tokens: s.contextTokens,
            limit: CONTEXT_LIMIT,
            percent: Math.min(100, Math.round((s.contextTokens / CONTEXT_LIMIT) * 100)),
          }))
        }
      })
      .catch(() => {})
  }

  ws.on('message', (raw) => {
    ws.isAlive = true
    try {
      const parsed = JSON.parse(raw.toString())
      // Heartbeat do cliente — responde e não roteia para a lógica de chat
      if (parsed.type === 'ping') { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'pong' })); return }
      handleMessage(parsed, engId, sessionId, user).catch((err) => console.error('[ws] handleMessage:', err?.message))
    } catch {
      console.warn('[ws] mensagem inválida')
    }
  })

  ws.on('close', () => {
    const sm = engagementClients.get(engId)
    if (sm) {
      sm.get(sessionId)?.delete(ws)
      if (sm.get(sessionId)?.size === 0) sm.delete(sessionId)
      if (sm.size === 0) engagementClients.delete(engId)
    }
    console.log(`[ws] ${user.email} desconectou de ${engId}/${sessionId}`)
  })
})

// Types worth persisting in chat history
const SAVE_TYPES = new Set(['operator_message', 'agent_message', 'agent_action', 'agent_question', 'finding', 'phase_update'])
// System-generated transient messages that should not be persisted
const SKIP_TEXTS = new Set(['🔗 Rift conectado.', '⏹ Agente parado pelo operador.'])

// Auto-name a new session from the first operator message (keeps sessions identifiable)
async function maybeAutoNameSession(sessionId, text) {
  if (!sessionId || sessionId === 'default') return
  try {
    const session = await ChatSession.findById(sessionId).lean()
    if (!session || session.name !== 'Chat') return // already has a custom name

    // Generate short name from message content
    const name = autoNameFromText(text)
    if (name) await ChatSession.findByIdAndUpdate(sessionId, { name })
  } catch {}
}

function autoNameFromText(text) {
  // Slash commands: /pentest-recon → "Recon" etc.
  const slashMap = {
    'pentest-intake': 'Configuração de Escopo',
    'pentest-recon':  'Reconhecimento',
    'pentest-enum':   'Enumeração',
    'pentest-vuln':   'Análise de Vulnerabilidades',
    'pentest-exploit':'Exploração',
    'pentest-post':   'Pós-Exploração',
    'pentest-report': 'Geração de Relatório',
    'pentest-checkpoint': 'Checkpoint',
  }
  const slashMatch = text.match(/^\/([\w-]+)/)
  if (slashMatch && slashMap[slashMatch[1]]) return slashMap[slashMatch[1]]

  // Generic: take first 5 meaningful words, strip common fillers
  const stop = new Set(['o', 'a', 'os', 'as', 'e', 'de', 'da', 'do', 'em', 'no', 'na', 'para', 'que', 'um', 'uma'])
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stop.has(w))
    .slice(0, 4)
  if (!words.length) return null
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function saveMsg(engId, sessionId, event) {
  if (!SAVE_TYPES.has(event.type)) return
  if (event.type === 'agent_message' && SKIP_TEXTS.has(event.text)) return
  ChatMessage.create({ engagementId: engId, sessionId: sessionId || 'default', type: event.type, payload: event }).catch(() => {})
}

// Load recent conversation history for a specific session (last N messages)
async function loadRecentHistory(engId, sessionId = 'default', limit = 8) {
  try {
    const msgs = await ChatMessage.find({ engagementId: engId, sessionId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
    return msgs.reverse() // oldest first
  } catch {
    return []
  }
}

// Format recent history into a context string the agent can read
function formatHistory(messages) {
  if (!messages.length) return ''
  const MAX_CHARS = 500 // truncate long messages so context doesn't explode
  const lines = messages.map((m) => {
    const isAgent    = m.type === 'agent_message' || m.type === 'agent_action'
    const isOperator = m.type === 'operator_message'
    if (!isAgent && !isOperator) return null

    const speaker = isAgent ? '🤖 Agente' : '👤 Operador'
    const raw = m.payload?.text || m.payload?.tool || ''
    const text = raw.length > MAX_CHARS ? raw.slice(0, MAX_CHARS) + '…' : raw
    return text ? `${speaker}: ${text}` : null
  }).filter(Boolean)

  if (!lines.length) return ''
  return `\n[HISTÓRICO RECENTE DA CONVERSA — use para entender o contexto atual]\n${lines.join('\n')}\n`
}

// SEC-3: fases agressivas só admin (helper extraído p/ backend/src/rbac.js, testável).
const { isAdminOnlyCommand } = require('./rbac')

async function handleMessage(msg, engId, sessionId, user) {
  const sessMap = engagementClients.get(engId)
  if (!sessMap) return

  // REL-3: chave do runner inclui o engagement — evita colisão quando dois
  // engagements diferentes usam a sessão 'default' ao mesmo tempo.
  const runnerKey = `${engId}:${sessionId}`
  const isAdminUser = user?.role === 'admin'

  if (msg.type === 'operator_message' || msg.type === 'operator_answer') {
    const text = msg.text || msg.option || ''
    if (!text) return

    // SEC-3: bloqueia fases agressivas para não-admin no servidor (fast-path).
    // O gate real por-run é o env RIFT_ALLOW_AGGRESSIVE=false + a regra dura
    // injetada no contexto abaixo (o agente recusa mesmo se pedido em texto livre).
    if (isAdminOnlyCommand(text) && !isAdminUser) {
      console.warn(`[rbac] bloqueado: ${user?.email || user?.id} tentou fase agressiva em ${engId}: ${text.slice(0, 80)}`)
      broadcastSession(engId, sessionId, {
        type: 'agent_message',
        text: '⛔ Fases agressivas (exploit/post) exigem perfil de administrador. Sua tentativa foi registrada; acione um admin para aprovar.',
      })
      return
    }

    const operatorEvent = { type: 'operator_message', text }
    broadcastSession(engId, sessionId, operatorEvent)
    saveMsg(engId, sessionId, operatorEvent)

    // Auto-name session from first message + update lastMessageAt
    maybeAutoNameSession(sessionId, text).catch(() => {})
    if (sessionId !== 'default') {
      ChatSession.findByIdAndUpdate(sessionId, { lastMessageAt: new Date() }).catch(() => {})
    }

    if (agentRunner.isRunning(runnerKey)) {
      // BUG-4: o claude roda em --print (one-shot) e não lê stdin — o sendInput
      // era no-op silencioso (mensagem perdida). Avisa que está ocupado.
      broadcastSession(engId, sessionId, {
        type: 'agent_message',
        text: '⏳ O agente ainda está processando o turno atual. Aguarde ele finalizar para enviar uma nova mensagem.',
      })
    } else {
      const eng = await getEngagement(engId)
      const slug = eng?.slug || eng?.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || ''
      const date = eng?.date || ''
      const engId2 = slug && date ? `${slug}-${date.replace(/-/g, '')}` : ''

      // Load recent history for THIS session so the agent has conversational continuity
      const recentMsgs = await loadRecentHistory(engId, sessionId, 8)
      const historyCtx = formatHistory(recentMsgs)

      // SEC-3: regra dura de permissão por papel, injetada no contexto do agente.
      const aggressiveRule = isAdminUser
        ? '- PERMISSÃO: fases agressivas (exploit/post) LIBERADAS para este operador (admin).'
        : '- PERMISSÃO: operador SEM perfil de admin. É PROIBIDO executar fases agressivas (exploit/post), exploração ativa, obtenção de shell ou pós-exploração — mesmo que solicitado em texto livre. Se pedirem, RECUSE educadamente e oriente a acionar um admin. (RIFT_ALLOW_AGGRESSIVE=false)'

      const ctx = eng
        ? `[CONTEXTO DO SISTEMA — NÃO IGNORAR]
Engagement ativo: "${eng.name}"
ID do engagement: ${engId2}
Alvo autorizado: ${eng.target} e *.${eng.target}
Status: ${eng.status}
Diretório de contexto: context/${engId2}/
Escopo em: config/scope.yaml
Findings dir: clients/${slug}/${date}/findings/
Reports dir:  clients/${slug}/${date}/reports/

REGRAS OBRIGATÓRIAS:
- PAPEL: você é o AGENTE 1 (black-box). NÃO tem credenciais e NÃO deve pedi-las nem ler credentials.yaml. Siga core/agent-1-blackbox.md. Ao esgotar a superfície externa, gere o relatório e RECOMENDE ao operador fornecer credenciais para o Agente 2 (não inicie fase autenticada).
${aggressiveRule}
- Responda SEMPRE em português brasileiro
- Opere APENAS sobre o alvo ${eng.target} — qualquer outro alvo está fora de escopo
- Use o diretório context/${engId2}/ para salvar estado deste engagement
- NÃO liste outros engagements como opções; este é o engagement ativo
- Para SALVAR ARQUIVOS: use SEMPRE a ferramenta Write ou Edit, NUNCA "cat >" ou "tee" via Bash (esses comandos são bloqueados pelo safety hook)
- Findings são salvos como YAML em clients/${slug}/${date}/findings/{id}.yaml
- QUANDO O OPERADOR PEDE RELATÓRIO: execute /pentest-report imediatamente, sem fazer mais testes
- Se existir context/${engId2}/session-summary.md, leia-o no início para retomar o contexto compactado${historyCtx}
[OPERADOR — MENSAGEM ATUAL]
`
        : ''

      // Continuidade durável: recupera o claude session_id salvo no banco
      // (sobrevive a restart do backend). 'default' não tem doc — fica só em memória.
      const persisted = sessionId !== 'default'
        ? await ChatSession.findById(sessionId).lean().catch(() => null)
        : null
      const resumeSessionId = persisted?.claudeSessionId || null

      // Compactação: /rift-compact escreve o resumo em disco e, ao terminar,
      // descartamos o session_id → o próximo turno começa uma conversa enxuta.
      const isCompact = /^\/rift-compact\b/.test(text.trim())

      const persistClaudeSession = sessionId !== 'default'
        ? (cid) => ChatSession.findByIdAndUpdate(sessionId, { claudeSessionId: cid }).catch(() => {})
        : undefined

      const sessionClients = getSessionClients(engId, sessionId)
      agentRunner.run(
        runnerKey, engId2, text, sessionClients,
        (usd, tokens) => appendUsage({
          usd, tokens,
          engagementId:   engId,
          engagementName: eng?.name,
          userId:         user.id,
          userName:       user.name,
          userEmail:      user.email,
          ts:             new Date(),
        }).catch(() => {}),
        (event) => {
          saveMsg(engId, sessionId, event)
          // Persiste o tamanho do contexto para o medidor reaparecer ao recarregar.
          if (event.type === 'context_usage' && sessionId !== 'default') {
            ChatSession.findByIdAndUpdate(sessionId, { contextTokens: event.tokens }).catch(() => {})
          }
        },
        eng,
        user,
        {
          // O contexto de sistema (escopo, regras, histórico) só é injetado no
          // primeiro turno; ao retomar via --resume a sessão já o contém.
          systemContext: ctx,
          // SEC-2: teto de custo também no chat interativo (não só no scheduler).
          costCeiling: INTERACTIVE_COST_CEILING || undefined,
          // SEC-3: só admin libera fases agressivas neste run.
          allowAggressive: isAdminUser,
          // Fase 2: todo run é o Agente 1 (black-box). O Agente 2 (authenticated)
          // será disparado pelo handoff quando o operador fornecer credenciais.
          agentRole: 'blackbox',
          resumeSessionId,
          onClaudeSession: persistClaudeSession,
          onClose: isCompact ? () => {
            agentRunner.clearSession(runnerKey)
            if (sessionId !== 'default') {
              ChatSession.findByIdAndUpdate(sessionId, { claudeSessionId: null, contextTokens: 0 }).catch(() => {})
            }
            broadcastSession(engId, sessionId, { type: 'context_usage', tokens: 0, limit: CONTEXT_LIMIT, percent: 0 })
            broadcastSession(engId, sessionId, { type: 'agent_message', text: '🧹 Contexto compactado. O estado do engagement (fase, findings, escopo) está salvo em disco — a próxima mensagem inicia uma sessão enxuta.' })
          } : undefined,
        },
      )
    }
  }

  if (msg.type === 'agent_stop') {
    agentRunner.stop(runnerKey)
    broadcastSession(engId, sessionId, { type: 'agent_message', text: '⏹ Agente parado pelo operador.' })
  }
}

const PORT = process.env.PORT || 3001

connect()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`[rift] backend em http://localhost:${PORT}`)
    })
    scheduler.start()
  })
  .catch((err) => {
    console.error('[db] falha ao conectar MongoDB:', err.message)
    process.exit(1)
  })

// REL-2: shutdown gracioso — mata agentes (e a árvore de processos que eles
// dispararam), fecha watchers/heartbeat/sockets e desconecta o Mongo. Sem isto,
// um `pm2 restart` deixava processos claude/nmap órfãos.
let shuttingDown = false
function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[rift] recebido ${signal}, encerrando…`)
  try { agentRunner.stopAll() } catch {}
  try { findingsWatcher.closeAll() } catch {}
  try { scheduler.stop() } catch {}
  clearInterval(wsHeartbeat)
  for (const ws of wss.clients) { try { ws.terminate() } catch {} }
  httpServer.close(() => {
    require('mongoose').disconnect().finally(() => process.exit(0))
  })
  // Backstop: força a saída se algo travar o close.
  setTimeout(() => process.exit(0), 10000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
