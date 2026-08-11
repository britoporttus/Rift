require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const express = require('express')
// REL-1: captura rejeições em handlers async e as encaminha ao middleware de erro.
// Sem isto, no Express 4 uma Promise rejeitada deixa a request pendurada (sem resposta).
require('express-async-errors')
const { createServer } = require('http')
const { WebSocketServer } = require('ws')
const { URL } = require('url')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken')

const { connect } = require('./db')
const { router: authRouter, JWT_SECRET, COOKIE_NAME, checkTokenVersion } = require('./auth')
const { isAllowedOrigin } = require('./cors-policy')
const { resolveWsToken } = require('./ws-auth')
const authMicrosoftRouter = require('./api/auth-microsoft')
const engagementsRouter = require('./api/engagements')
const findingsRouter = require('./api/findings')
const reportsRouter = require('./api/reports')
const adminRouter = require('./api/admin')
const usersRouter = require('./api/users')
const settingsRouter = require('./api/settings')
const domainsRouter = require('./api/domains')
const leaksRouter = require('./api/leaks')
const graphRouter = require('./api/graph')
const internalNetworksRouter = require('./api/internal-networks')
const overviewRouter = require('./api/overview')
const monitorRouter = require('./api/monitor')
const harnessRouter = require('./api/harness')
const integrationsRouter = require('./api/integrations')
const asmScanner = require('./asm/scanner')
const agentRunner = require('./agent-runner')
const { resolveTenant, dbFor, forEachTenant, dbForSlug } = require('./tenancy')
const findingsWatcher = require('./findings-watcher')
const scheduler = require('./scheduler')
const asmScheduler = require('./asm-scheduler')
const jobsWorker = require('./jobs-worker')
const { getEngagement, updateEngagement, appendUsage, sumUsageUsd, countFindings } = require('./store')
const { deriveRunOutcome } = require('./run-outcome')
const { resetEngagementState } = require('./scope')
const { getFramework, loadRules } = require('./frameworks')
const { getDomainPack, loadDomainPrompt, loadCheckpointDirective } = require('./domain-packs')
const domainPacks = require('./domain-packs')
const credVault = require('./cred-vault')
const toolCheck = require('./tool-check')
const jobs = require('./jobs')

// Janela de contexto do modelo (tokens) — base do medidor de "memória".
const CONTEXT_LIMIT = Number(process.env.CONTEXT_LIMIT) || 200000
// SEC-2: teto de custo por run interativo do chat (0/ausente = sem teto).
const INTERACTIVE_COST_CEILING = Number(process.env.INTERACTIVE_COST_CEILING) || 0
// Item 4 (custo): auto-compactação. Quando o contexto de um turno passa deste %, ao
// fim do turno descartamos o session_id do claude → o próximo turno começa enxuto
// (o estado durável — findings/fase/escopo — vive em disco e é recarregado). 0 = off.
const CONTEXT_AUTOCOMPACT_PERCENT = process.env.CONTEXT_AUTOCOMPACT_PERCENT !== undefined
  ? Number(process.env.CONTEXT_AUTOCOMPACT_PERCENT)
  : 85

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

// A-STATE: estado de execução por engagement. Persiste (sobrevive a reload/restart)
// e transmite `run_state` para TODAS as sessões do engagement — o painel de
// Execução deixa de depender de um flag local `started` que divergia do real.
// A-STATE (1.3): persiste o estado E o motivo (stopReason) e transmite ambos.
// O painel usa `reason` para SEMPRE mostrar por que parou/falhou — inclusive
// após um refresh (o motivo vem persistido no engagement).
async function setRunState(db, engagementId, state, reason = null) {
  try { await updateEngagement(db, engagementId, { runState: state, stopReason: reason }) } catch {}
  broadcastEngagement(engagementId, { type: 'run_state', state, reason })
}

// Runs em que o operador pediu Parar — lido no onClose para não rotular como
// "concluído" um run que o processo encerrou (SIGTERM) por ordem do operador.
const stopRequested = new Set()

// BUG-3: registra o notifier global do watcher (broadcast ao vivo). Feito 1x —
// o watcher passa a transmitir findings a QUALQUER conexão, não só à primeira.
findingsWatcher.setNotifier((engagementId, event) => broadcastEngagement(engagementId, event))
// Mesmo padrão para jobs: qualquer mudança de job (inclusive de scan agendado/headless,
// sem subscriber próprio) anima o painel ao vivo para quem estiver no engagement.
jobs.setNotifier((engagementId, event) => broadcastEngagement(engagementId, event))

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(s => s.trim())
// P1-12: wildcard de túnel Cloudflare atrás de opt-in explícito (ver cors-policy.js).
const ALLOW_CLOUDFLARE_WILDCARD = process.env.ALLOW_CLOUDFLARE_WILDCARD === '1'
app.use(cors({
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin, { origins: allowedOrigins, allowCfWildcard: ALLOW_CLOUDFLARE_WILDCARD })) return cb(null, true)
    cb(new Error('Not allowed by CORS'))
  },
  credentials: true,
}))
// A coleta do agente de rede interna (scan de /24) é maior que o teto padrão.
// Parser dedicado ANTES do global — express.json não re-parseia se já parseado.
app.use('/api/internal-networks/ingest', express.json({ limit: process.env.INTERNAL_INGEST_LIMIT || '8mb' }))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

app.get('/api/health', (_req, res) => res.json({ status: 'ok', version: '0.1.0' }))
app.use('/api/auth', authRouter)
app.use('/api/auth', authMicrosoftRouter)
app.use('/api/engagements', engagementsRouter)
app.use('/api/findings', findingsRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/admin', adminRouter)
app.use('/api/users', usersRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/domains', domainsRouter)
app.use('/api/leaks', leaksRouter)
app.use('/api/graph', graphRouter)
app.use('/api/internal-networks', internalNetworksRouter)
app.use('/api/overview', overviewRouter)
app.use('/api/monitor', monitorRouter)
app.use('/api/harness', harnessRouter)
app.use('/api/integrations', integrationsRouter)

// REL-1: 404 de API + middleware de erro global (DEPOIS das rotas). Sem o error
// handler, a rejeição async capturada por express-async-errors não teria destino.
app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }))
app.use((err, _req, res, _next) => {
  console.error('[api] erro não tratado:', err?.stack || err?.message || err)
  if (res.headersSent) return
  res.status(err?.status || 500).json({ error: 'Erro interno do servidor' })
})

// WebSocket upgrade — autentica via cookie HttpOnly (o browser a envia sozinho no
// handshake, same-origin); fallback: subprotocolo 'rift-jwt' (clientes não-browser).
// P1-19 (auditoria 2026-07-20): o fallback de `?token=` na query string foi
// REMOVIDO — o frontend não usa mais nenhum dos dois fallbacks (só cookie
// same-origin), e um JWT na query string fica gravado em log de acesso de
// proxy/CDN (exatamente o vetor que o subprotocolo dedicado deveria eliminar).
httpServer.on('upgrade', async (req, socket, head) => {
  // P2-29 (auditoria 2026-07-20): ao contrário do middleware CORS (que valida
  // Origin pra fetch/XHR), o upgrade do WS não checava Origin explicitamente —
  // dependia implicitamente do cookie ser SameSite=Lax (navegadores não deveriam
  // anexá-lo a um handshake WS cross-site iniciado por script), um comportamento
  // que varia por navegador/proxy e não deveria ser a única linha de defesa.
  // Mesma política de origem do CORS HTTP (isAllowedOrigin) — ausência de Origin
  // (clientes não-browser via subprotocolo) continua permitida, igual ao CORS.
  if (!isAllowedOrigin(req.headers.origin, { origins: allowedOrigins, allowCfWildcard: ALLOW_CLOUDFLARE_WILDCARD })) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
    socket.destroy()
    return
  }

  const urlObj = new URL(req.url, 'http://localhost')
  const engagementId = urlObj.searchParams.get('engagementId')
  const sessionId    = urlObj.searchParams.get('sessionId') || 'default'

  const token = resolveWsToken(req.headers.cookie, req.headers['sec-websocket-protocol'], COOKIE_NAME)

  if (!token || !engagementId) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    // P1-11: mesmo gate de revogação do requireAuth() HTTP — um WS não deveria
    // sobreviver a um rebaixamento/reset de senha só porque o handshake já foi
    // feito antes da mudança.
    const stillValid = await checkTokenVersion(payload)
    if (!stillValid) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    // ── Frente 0: POSSE do engagement ────────────────────────────────────────
    // Antes daqui, o upgrade validava só "o JWT é válido?" e "veio um
    // engagementId?" — nunca "este engagement é DESTE usuário?". Com dois
    // tenants isso significa que um operador do cliente A, sabendo (ou
    // adivinhando) o id de um engagement do cliente B, recebia o feed ao vivo
    // do agente: comandos, saída de ferramenta, findings e checkpoints. É o
    // vazamento mais grave da superfície, porque não passa por rota HTTP
    // nenhuma e portanto não era coberto por nada.
    //
    // A checagem é uma leitura no banco DO TENANT do usuário: se o engagement
    // não estiver lá, ele não é dele — não importa se existe em outro lugar.
    const wsUser = { id: payload.sub, email: payload.email, role: payload.role, name: payload.name, tenantId: payload.tid || null }
    let tenant
    let db
    try {
      tenant = await resolveTenant(wsUser)
      db = await dbFor(tenant)
    } catch {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }
    const owned = await db.Engagement.exists({ _id: engagementId })
    if (!owned) {
      // 404, não 403: negar com "existe mas não é seu" já é um oráculo de
      // existência entre tenants.
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws._user         = payload
      ws._engagementId = engagementId
      ws._sessionId    = sessionId
      ws._tenant       = tenant
      ws._db           = db
      wss.emit('connection', ws)
    })
  } catch {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
  }
})

wss.on('connection', async (ws) => {
  const engId     = ws._engagementId
  // Frente 0: models do banco DESTE tenant, resolvidos e validados no upgrade.
  const db        = ws._db
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

  const engagement = await getEngagement(db, engId)
  if (engagement) {
    // Watcher por engagement: persiste findings, atualiza a contagem e transmite
    // ao vivo via notifier global (broadcast + count vivem dentro do watcher agora).
    // Observa os dirs de findings da VERSÃO escolhida (seletor A/B/C) — o watch
    // precisa casar com o cwd do run, senão os findings da versão não apareceriam.
    const fw = getFramework(engagement.frameworkId)
    findingsWatcher.watch(db, engId, engagement.slug, engagement.date, engagement.name, fw, engagement.target)
  }

  ws.send(JSON.stringify({ type: 'connection_ready', text: '🔗 Rift conectado.' }))

  // REL-5: informa o estado atual do agente a quem (re)conectou — corrige o input
  // que ficava destravado após uma reconexão no meio de um run.
  const runnerKey = `${engId}:${sessionId}`
  const liveRunning = agentRunner.isRunning(runnerKey)
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'agent_status', state: liveRunning ? 'running' : 'idle' }))
  }

  // A-STATE-1: estado do run derivado do backend (nunca de um flag local). Se há
  // um processo vivo → 'running'. Se o banco diz 'running' mas nada está vivo
  // (crash/janela de falha), degrada para 'stopped' — nunca "mente" que roda.
  if (engagement && ws.readyState === 1) {
    const persistedRun = engagement.runState || 'idle'
    // 'running' persistido sem processo vivo = run órfão (crash/restart no meio).
    const degraded = !liveRunning && persistedRun === 'running'
    const effectiveRun = liveRunning ? 'running' : (degraded ? 'stopped' : persistedRun)
    const reason = degraded ? 'interrupted' : (engagement.stopReason || null)
    if (degraded) {
      updateEngagement(db, engId, { runState: 'stopped', stopReason: 'interrupted' }).catch(() => {})
    }
    ws.send(JSON.stringify({ type: 'run_state', state: effectiveRun, reason }))
  }

  // Reidrata o "Fluxo do run" (Jobs): manda o job mais recente a quem (re)conectou.
  // Sem isto, após uma queda de WS o pipeline de etapas congela — não há job_update no
  // ar quando nada muda de fase. listJobs ordena por updatedAt → [0] é o mais recente.
  jobs.listJobs(db, engId, 1).then((list) => {
    if (list && list[0] && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'job_update', job: list[0] }))
    }
  }).catch(() => {})

  // Reidrata o medidor de contexto com o último valor conhecido desta sessão.
  if (sessionId !== 'default') {
    db.ChatSession.findById(sessionId).lean()
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
const SAVE_TYPES = new Set(['operator_message', 'agent_message', 'agent_action', 'agent_question', 'finding', 'phase_update', 'milestone'])
// System-generated transient messages that should not be persisted
const SKIP_TEXTS = new Set(['🔗 Rift conectado.', '⏹ Agente parado pelo operador.'])

// Auto-name a new session from the first operator message (keeps sessions identifiable)
async function maybeAutoNameSession(sessionId, text) {
  if (!sessionId || sessionId === 'default') return
  try {
    const session = await db.ChatSession.findById(sessionId).lean()
    if (!session || session.name !== 'Chat') return // already has a custom name

    // Generate short name from message content
    const name = autoNameFromText(text)
    if (name) await db.ChatSession.findByIdAndUpdate(sessionId, { name })
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
  db.ChatMessage.create({ engagementId: engId, sessionId: sessionId || 'default', type: event.type, payload: event }).catch(() => {})
}

// Load recent conversation history for a specific session (last N messages)
async function loadRecentHistory(engId, sessionId = 'default', limit = 8) {
  try {
    const msgs = await db.ChatMessage.find({ engagementId: engId, sessionId })
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

    // Relatório automático: os disparos automáticos (Iniciar/Continuar/Começar do zero)
    // pedem que, ao concluir o run com sucesso, o backend gere o relatório final se o
    // agente ainda não gerou. Mensagens de chat comuns NÃO têm a flag → nada muda.
    const autoReport = msg.autoReport === true

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
      db.ChatSession.findByIdAndUpdate(sessionId, { lastMessageAt: new Date() }).catch(() => {})
    }

    if (agentRunner.isRunning(runnerKey)) {
      // BUG-4: o claude roda em --print (one-shot) e não lê stdin — o sendInput
      // era no-op silencioso (mensagem perdida). Avisa que está ocupado.
      broadcastSession(engId, sessionId, {
        type: 'agent_message',
        text: '⏳ O agente ainda está processando o turno atual. Aguarde ele finalizar para enviar uma nova mensagem.',
      })
    } else {
      const eng = await getEngagement(db, engId)
      const slug = eng?.slug || eng?.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || ''
      const date = eng?.date || ''
      const engId2 = slug && date ? `${slug}-${date.replace(/-/g, '')}` : ''

      // Versão do agente escolhida (seletor A/B/C). Fail-safe: se o path da versão
      // sumiu, recusa com mensagem clara em vez de spawnar num cwd inexistente.
      const framework = getFramework(eng?.frameworkId)
      if (!framework.available) {
        broadcastSession(engId, sessionId, {
          type: 'agent_message',
          text: `⚠️ A versão do agente selecionada ("${framework.label}") não está disponível no servidor (pasta ausente). Escolha outra versão no seletor da tela do engagement.`,
        })
        setRunState(db, engId, 'stopped', 'error')
        return
      }
      // Re-aponta o watcher para os dirs DESTA versão caso o operador tenha trocado
      // a versão depois de conectar (idempotente se já estava correto).
      if (eng) {
        try { findingsWatcher.watch(db, engId, eng.slug, eng.date, eng.name, framework, eng.target) } catch {}
      }

      // Load recent history for THIS session so the agent has conversational continuity.
      // "Começar do zero" (resetSession): NÃO reinjeta o histórico — senão turnos antigos
      // contraditórios (ex.: kickoff black-box antes de virar pack autenticado) voltam ao
      // contexto e o agente fica reconciliando conflito em vez de rodar. Slate limpo.
      const recentMsgs = msg.resetSession === true ? [] : await loadRecentHistory(engId, sessionId, 8)
      const historyCtx = formatHistory(recentMsgs)

      // SEC-3: regra dura de permissão por papel, injetada no contexto do agente.
      const aggressiveRule = isAdminUser
        ? '- PERMISSÃO: fases agressivas (exploit/post) LIBERADAS para este operador (admin).'
        : '- PERMISSÃO: operador SEM perfil de admin. É PROIBIDO executar fases agressivas (exploit/post), exploração ativa, obtenção de shell ou pós-exploração — mesmo que solicitado em texto livre. Se pedirem, RECUSE educadamente e oriente a acionar um admin. (RIFT_ALLOW_AGGRESSIVE=false)'

      // Diretório canônico de findings — igual ao dir PRIMÁRIO que o watcher observa
      // (findings-watcher/frameworks.js). Instruir TODA versão a gravar aqui é o que
      // garante que os findings apareçam no painel, mesmo nas versões sem /pentest-*.
      const canonicalFindingsDir = `clients/${slug}/${date}/findings/`

      // fwGuidance (PAPEL do agente) é definido APÓS o gate — depende do domain pack
      // (black-box vs autenticado) e das variáveis de credencial injetadas no run.

      // Injetamos as regras nativas (.cursorrules) SÓ quando a versão NÃO tem CLAUDE.md.
      // legacy/v3 foram portados (têm CLAUDE.md) → o Claude lê as instruções nativamente
      // (arquivo inteiro, sem o truncamento de 12k do blob) e referencia os phase-files/
      // playbooks sob demanda. Sem CLAUDE.md (fallback), ainda injetamos o .cursorrules.
      const fwRules = framework.hasClaudeMd ? '' : loadRules(framework)
      const fwRulesBlock = fwRules
        ? `\n[REGRAS DO FRAMEWORK "${framework.label}" — SIGA-AS COMO METODOLOGIA]\n${fwRules.slice(0, 12000)}\n`
        : ''

      // Domain pack (ETAPA 0 multi-domínio): injeta o CONTEÚDO do domínio no contexto.
      // Pack #0 'web' tem systemPrompt vazio → packBlock '' → nada muda (no-op). Quando
      // azure/ad/sap ficarem 'ready' (ETAPAs 1-3), o prompt do pack entra por aqui.
      const domainPack = getDomainPack(eng?.domainPackId)
      const domainPrompt = loadDomainPrompt(domainPack)
      // 20000 (não 12000): o pack azure.md cresceu com endpoints Graph prescritivos +
      // gate de cobertura + wiring da taxonomia — cortar em 12k truncava exatamente a
      // seção de Findings/classificação (probable/false_positive) no fim do arquivo.
      const packBlock = domainPrompt
        ? `\n[DOMAIN PACK "${domainPack.label}" — CONTEXTO DO DOMÍNIO]\n${domainPrompt.slice(0, 20000)}\n`
        : ''
      // Checkpoint por-ação p/ domínios destrutivos (azure/ad/sap). Vazio p/ web
      // (per-phase, black-box) → no-op. Prioridade #1 de segurança destrutiva do Conselho.
      const checkpointBlock = loadCheckpointDirective(domainPack)

      // ── Gate de pack AUTENTICADO (Azure/AD/SAP/…) ────────────────────────────────
      // Web (credentialHandling 'none') passa direto. Packs autenticados exigem, ANTES
      // de gastar um turno: (1) não depender de runner interno inexistente; (2) credencial
      // efêmera no cofre (in-memory, por-run); (3) tooling presente no servidor. A
      // credencial vira env SÓ deste processo (opts.credentialEnv) e é limpa no onClose.
      let credentialEnv = {}
      const isAuthPack = domainPacks.needsCredentials(domainPack)
      // Chave por-ENGAGEMENT (mesma do POST /credentials) — a credencial é a "do próximo
      // run autenticado deste engagement", independente da sessão de chat.
      const packVaultKey = `cred:${ws._tenant?.slug || 'no-tenant'}:${engId}`
      if (isAuthPack) {
        if (domainPacks.requiresRunner(domainPack)) {
          broadcastSession(engId, sessionId, { type: 'agent_message', text: `⚠️ O domínio "${domainPack.label}" exige um runner interno na rede do alvo (ainda não disponível). Azure/nuvem rodam da VPS; AD/SAP dependem do runner.` })
          setRunState(db, engId, 'stopped', 'error'); return
        }
        const creds = credVault.get(packVaultKey)
        if (!creds) {
          broadcastSession(engId, sessionId, { type: 'agent_message', text: `🔑 O domínio "${domainPack.label}" é autenticado. Forneça as credenciais antes de iniciar — elas ficam só em memória, por este run.` })
          setRunState(db, engId, 'stopped', 'error'); return
        }
        const missing = toolCheck.missingTools(domainPacks.requiredTools(domainPack))
        if (missing.length) {
          broadcastSession(engId, sessionId, { type: 'agent_message', text: `🛠️ Ferramentas ausentes no servidor para "${domainPack.label}": ${missing.join(', ')}. Instale-as e tente novamente.` })
          setRunState(db, engId, 'stopped', 'error'); return
        }
        credentialEnv = domainPacks.buildCredentialEnv(domainPack, creds)
      }

      // PAPEL do agente — depende do domain pack. Autenticado (Azure/…): usa a credencial
      // do AMBIENTE e segue a metodologia do pack; NÃO faz recon web black-box. Black-box
      // (web): comportamento atual do framework (Agente 1).
      const credEnvNames = Object.keys(credentialEnv)
      const fwGuidance = isAuthPack
        ? `- PAPEL: você é o AGENTE AUTENTICADO do domínio ${domainPack.label}. A credencial JÁ ESTÁ no AMBIENTE deste run (variáveis: ${credEnvNames.join(', ') || 'no ambiente do processo'}) — autentique com ela ANTES de tudo (ex.: \`az login --service-principal -u "$AZURE_CLIENT_ID" -p "$AZURE_CLIENT_SECRET" --tenant "$AZURE_TENANT_ID"\`, depois \`az account set --subscription "$AZURE_SUBSCRIPTION_ID"\` se houver). NÃO peça credenciais, NÃO leia credentials.yaml e NÃO faça recon web black-box: o alvo é o AMBIENTE ${domainPack.label} do tenant/conta "${eng.target}", acessado via API/CLI. Siga ESTRITAMENTE a metodologia do DOMAIN PACK abaixo (read-only primeiro).
${aggressiveRule}`
        : (framework.slashCommands
          ? `- PAPEL: você é o AGENTE 1 (black-box). NÃO tem credenciais e NÃO deve pedi-las nem ler credentials.yaml. Siga core/agent-1-blackbox.md. Ao esgotar a superfície externa, gere o relatório e RECOMENDE ao operador fornecer credenciais para o Agente 2 (não inicie fase autenticada).
${aggressiveRule}
- QUANDO O OPERADOR PEDE RELATÓRIO: execute /pentest-report imediatamente, sem fazer mais testes`
          : `- PAPEL: você é um agente de pentest black-box (sem credenciais). Foque na superfície externa autorizada e siga as REGRAS DO FRAMEWORK abaixo.
${aggressiveRule}
- Esta versão NÃO tem slash-commands (/pentest-*). Ao pedir relatório, gere um resumo consolidado dos findings em ${canonicalFindingsDir}.`)

      const ctx = eng
        ? `[CONTEXTO DO SISTEMA — NÃO IGNORAR]
Engagement ativo: "${eng.name}"
ID do engagement: ${engId2}
Alvo autorizado: ${isAuthPack ? `ambiente ${domainPack.label} do tenant/conta "${eng.target}" (acesso via credencial no ambiente do run)` : `${eng.target} e *.${eng.target}`}
Status: ${eng.status}
Versão do agente: ${framework.label}
Diretório de contexto: context/${engId2}/
Escopo em: config/scope.yaml
Findings dir: ${canonicalFindingsDir}
Reports dir:  clients/${slug}/${date}/reports/

REGRAS OBRIGATÓRIAS:
${fwGuidance}
- Responda SEMPRE em português brasileiro
- ${isAuthPack ? `Opere SOMENTE no tenant/subscription autorizado ("${eng.target}") usando a credencial do ambiente — NÃO faça recon web/DNS de ${eng.target}; a superfície aqui é a do ambiente ${domainPack.label} (recursos, RBAC, identidades), não um site` : `Opere APENAS sobre o alvo ${eng.target} — qualquer outro alvo está fora de escopo`}
- Use o diretório context/${engId2}/ para salvar estado deste engagement
- NÃO liste outros engagements como opções; este é o engagement ativo
- Para SALVAR ARQUIVOS: use SEMPRE a ferramenta Write ou Edit, NUNCA "cat >" ou "tee" via Bash (esses comandos são bloqueados pelo safety hook)
- CADA finding deve ser salvo como um arquivo YAML em ${canonicalFindingsDir}{id}.yaml (um por finding), com ao menos: id, title, severity (critical|high|medium|low|info), type, location, description, evidence, recommendation. É assim que o painel do Rift captura os findings em tempo real. Sempre que capturar valores reais (IDs, e-mails, tokens, tenant/client_id, paths expostos), COLOQUE-OS na evidência — o relatório os destaca.
- Cloudflare Email Protection: se encontrar "[email protected]" ou \`data-cfemail="HEX"\` / \`/cdn-cgi/l/email-protection\`, o e-mail real está no HEX — decodifique (1º byte = chave; XOR cada byte seguinte com ela) e registre o e-mail real, não o placeholder. Ex.: \`python3 -c "h='HEX';b=bytes.fromhex(h);print(''.join(chr(x^b[0]) for x in b[1:]))"\`
- Se existir context/${engId2}/session-summary.md, leia-o no início para retomar o contexto compactado${historyCtx}${fwRulesBlock}${packBlock}${checkpointBlock}
[OPERADOR — MENSAGEM ATUAL]
`
        : ''

      // A-STATE-5 "Começar do zero": o front pede um run limpo (resetSession=true).
      // Descartamos o claude session_id (memória + banco) → o próximo run NÃO usa
      // --resume e a conversa começa do zero. O estado do engagement em disco
      // (escopo, fase, findings) permanece — é só a memória do agente que zera.
      if (msg.resetSession === true) {
        agentRunner.clearSession(runnerKey)
        if (sessionId !== 'default') {
          await db.ChatSession.findByIdAndUpdate(sessionId, { claudeSessionId: null, contextTokens: 0 }).catch(() => {})
        }
        // CRÍTICO: resetar também o engagement-state.yaml do framework. Sem isto, a
        // guarda de re-execução (skills/phase-state.md) vê recon/enum/vuln "concluídos"
        // e o agente PULA as fases → cada re-run rendia MENOS. scope + findings ficam.
        if (eng) { try { resetEngagementState(eng, framework.path, domainPack.id, ws._tenant?.slug) } catch (e) { console.warn('[reset] state:', e.message) } }
        broadcastSession(engId, sessionId, { type: 'context_usage', tokens: 0, limit: CONTEXT_LIMIT, percent: 0 })
        broadcastSession(engId, sessionId, { type: 'phase_update', phase: 'recon', progress: 0 })
      }

      // Continuidade durável: recupera o claude session_id salvo no banco
      // (sobrevive a restart do backend). 'default' não tem doc — fica só em memória.
      const persisted = sessionId !== 'default'
        ? await db.ChatSession.findById(sessionId).lean().catch(() => null)
        : null
      const resumeSessionId = persisted?.claudeSessionId || null

      // Compactação: /rift-compact escreve o resumo em disco e, ao terminar,
      // descartamos o session_id → o próximo turno começa uma conversa enxuta.
      const isCompact = /^\/rift-compact\b/.test(text.trim())

      // PORTA DE ORÇAMENTO (pré-turno). O `claude --print` só reporta o custo do
      // turno NO FINAL — não dá pra abortar no meio quando estoura. Logo o único
      // enforcement real do teto declarado no intake (scope.spendingUsd) é recusar
      // INICIAR um novo turno quando o custo acumulado do engagement já o atingiu.
      // Exceções: relatório e compactação continuam liberados (o operador precisa
      // conseguir extrair o resultado e enxugar a sessão mesmo no teto).
      const isReport = /\/pentest-report\b/.test(text)
      const budget = Number(eng?.scope?.spendingUsd)
      if (budget > 0 && !isCompact && !isReport) {
        const spent = await sumUsageUsd(db, engId).catch(() => 0)
        if (spent >= budget) {
          broadcastSession(engId, sessionId, {
            type: 'agent_message',
            text: `🛑 Orçamento do engagement atingido: US$ ${spent.toFixed(2)} gastos de um teto de US$ ${budget.toFixed(2)} (definido no intake). Para continuar, aumente o "Gasto máximo" do engagement. Relatório (/pentest-report) e compactação seguem liberados.`,
          })
          setRunState(db, engId, 'stopped', 'budget')
          return
        }
      }

      const persistClaudeSession = sessionId !== 'default'
        ? (cid) => db.ChatSession.findByIdAndUpdate(sessionId, { claudeSessionId: cid }).catch(() => {})
        : undefined

      // A-STATE: marca o run como ativo (persiste + transmite run_state='running').
      // O painel de Execução espelha isto — trava o "Iniciar" e mostra "Parar".
      setRunState(db, engId, 'running')

      // Item 4: acompanha o maior % de contexto visto neste turno → decide auto-compact.
      let lastContextPercent = 0

      // Jobs: abre o Job deste run (fluxo de tarefas). O backend o avança pelas etapas
      // a partir da atividade real (phase_update) e o fecha no desfecho (onClose).
      let jobId = null
      try {
        // job_update é transmitido pelo notifier global (jobs.setNotifier no boot).
        jobId = await jobs.startJob(db, { engagementId: engId, sessionId, frameworkId: framework.id, domainPackId: domainPack.id })
      } catch (e) { console.warn('[jobs] start falhou:', e.message) }

      // AUTO-REPORT: dispara um turno EXTRA de geração de relatório ao fim de um run
      // automático concluído com sucesso (chamado do onClose). Retoma a sessão se ela
      // ainda existir (tem todo o contexto); se foi compactada, o prompt é auto-contido
      // (aponta os dirs de findings/reports) e o comando de relatório lê os YAML do disco.
      // NÃO passa pela porta de orçamento (relatório é sempre permitido) nem re-arma o
      // auto-report (o onClose deste turno só ajusta o runState) → sem loop.
      function triggerAutoReport() {
        const reportPrompt = `Gere agora o RELATÓRIO FINAL deste engagement (resumo executivo + relatório técnico) a partir dos findings já salvos em clients/${slug}/${date}/findings/. Salve os arquivos do relatório em clients/${slug}/${date}/reports/. Use a rotina de relatório do framework/pack (ex.: /pentest-report). NÃO execute novos testes nem re-scan — apenas consolide os findings existentes. Responda em pt-BR e informe os caminhos gerados ao terminar.`
        broadcastSession(engId, sessionId, { type: 'agent_message', text: '📝 Run concluído — gerando o relatório final automaticamente…' })
        setRunState(db, engId, 'running')
        agentRunner.run(
          runnerKey, engId2, reportPrompt,
          (event) => broadcastSession(engId, sessionId, event),
          (usd, tokens) => appendUsage(db, { usd, tokens, engagementId: engId, engagementName: eng?.name, userId: user.id, userName: user.name, userEmail: user.email, ts: new Date() }).catch(() => {}),
          (event) => saveMsg(engId, sessionId, event),
          eng, user,
          {
            frameworkPath: framework.path,
            // Frente 0: o runner usa isto para o contexto do agente em disco.
            tenantSlug: ws._tenant?.slug,
            systemContext: '',
            allowAggressive: isAdminUser,
            agentRole: domainPacks.needsCredentials(domainPack) ? 'authenticated' : 'blackbox',
            onClaudeSession: persistClaudeSession,
            onClose: (c) => setRunState(db, engId, c === 0 ? 'completed' : 'stopped'),
          },
        )
      }

      // Broadcaster VIVO: re-resolve os clientes atuais da sessão a cada evento
      // (via broadcastSession) → reconexão de WS não quebra o feed ao vivo. Antes
      // passávamos um Set capturado no início, que morria na 1ª reconexão.
      agentRunner.run(
        runnerKey, engId2, text, (event) => broadcastSession(engId, sessionId, event),
        (usd, tokens) => appendUsage(db, {
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
          if (event.type === 'context_usage') {
            if (typeof event.percent === 'number') lastContextPercent = Math.max(lastContextPercent, event.percent)
            if (sessionId !== 'default') {
              db.ChatSession.findByIdAndUpdate(sessionId, { contextTokens: event.tokens }).catch(() => {})
            }
          }
          // Jobs: a fase derivada da atividade real avança a etapa do fluxo (broadcast via notifier).
          if (event.type === 'phase_update' && jobId) {
            jobs.advanceStep(db, jobId, event.phase).catch(() => {})
          }
        },
        eng,
        user,
        {
          // Versão do agente escolhida (seletor A/B/C): o claude roda com cwd nesta
          // pasta. Sem isto, todo run usaria sempre o v2 default.
          frameworkPath: framework.path,
          // O contexto de sistema (escopo, regras, histórico) só é injetado no
          // primeiro turno; ao retomar via --resume a sessão já o contém.
          systemContext: ctx,
          // SEC-2: teto de custo também no chat interativo (não só no scheduler).
          // O operador declara um orçamento no intake (scope.spendingUsd) — até aqui
          // esse número era só decorativo (só ia pro scope.yaml do framework, nunca
          // era aplicado). Usa o teto do engagement quando existir; cai pro env global
          // como fallback (ex.: engagements antigos sem spendingUsd definido).
          costCeiling: (Number(eng?.scope?.spendingUsd) > 0 ? Number(eng.scope.spendingUsd) : null) || INTERACTIVE_COST_CEILING || undefined,
          // SEC-3: só admin libera fases agressivas neste run.
          allowAggressive: isAdminUser,
          // Papel do agente: pack autenticado (Azure/…) roda como Agente 2
          // (authenticated); os demais como Agente 1 (black-box).
          agentRole: domainPacks.needsCredentials(domainPack) ? 'authenticated' : 'blackbox',
          // Credenciais efêmeras do pack autenticado → env SÓ deste run ({} p/ web).
          credentialEnv,
          resumeSessionId,
          onClaudeSession: persistClaudeSession,
          onClose: async (code, info) => {
            // A-STATE-4/5 (1.3): deriva o desfecho REAL das 4 saídas possíveis
            // (ver src/run-outcome.js). Falha técnica (safeguard/timeout/erro) e
            // run que parou antes de Vulnerabilidades NUNCA viram "concluído".
            const operatorStopped = stopRequested.delete(runnerKey)
            // Credencial efêmera: descarta ao fim do run (nada em repouso).
            try { credVault.clear(packVaultKey) } catch {}
            const { runState, stopReason } = deriveRunOutcome({
              code,
              operatorStopped,
              budgetExceeded:     info?.budgetExceeded,
              blockedBySafeguard: info?.blockedBySafeguard,
              timedOut:           info?.timedOut,
              phasesReached:      info?.phasesReached,
            })
            setRunState(db, engId, runState, stopReason)
            // Jobs: fecha o fluxo com o desfecho real + totais (findings/custo).
            if (jobId) {
              const [fc, spent] = await Promise.all([
                countFindings(db, engId).catch(() => undefined),
                sumUsageUsd(db, engId).catch(() => undefined),
              ])
              const jobStatus = ['completed', 'stopped', 'failed'].includes(runState) ? runState : 'stopped'
              jobs.closeJob(
                db,
                jobId,
                { status: jobStatus, reason: stopReason, findingsCount: fc, spentUsd: spent, phasesReached: info?.phasesReached || [] },
              ).catch((e) => console.warn('[jobs] close falhou:', e.message))
            }
            // Compactação: /rift-compact escreve o resumo em disco e, ao terminar,
            // descartamos o session_id → o próximo turno começa uma conversa enxuta.
            if (isCompact) {
              agentRunner.clearSession(runnerKey)
              if (sessionId !== 'default') {
                db.ChatSession.findByIdAndUpdate(sessionId, { claudeSessionId: null, contextTokens: 0 }).catch(() => {})
              }
              broadcastSession(engId, sessionId, { type: 'context_usage', tokens: 0, limit: CONTEXT_LIMIT, percent: 0 })
              broadcastSession(engId, sessionId, { type: 'agent_message', text: '🧹 Contexto compactado. O estado do engagement (fase, findings, escopo) está salvo em disco — a próxima mensagem inicia uma sessão enxuta.' })
            } else if (
              CONTEXT_AUTOCOMPACT_PERCENT > 0 &&
              lastContextPercent >= CONTEXT_AUTOCOMPACT_PERCENT
            ) {
              // Item 4: auto-compactação. O contexto ficou alto neste turno → descarta o
              // session_id do claude para o PRÓXIMO turno começar enxuto (sem reenviar o
              // transcript inteiro). O estado durável (findings/fase/escopo) está em disco
              // e é recarregado pelo contexto de sistema + CLAUDE.md do framework. Reusa a
              // mesma mecânica do /rift-compact, só que disparada por limite de contexto.
              agentRunner.clearSession(runnerKey)
              if (sessionId !== 'default') {
                db.ChatSession.findByIdAndUpdate(sessionId, { claudeSessionId: null, contextTokens: 0 }).catch(() => {})
              }
              broadcastSession(engId, sessionId, { type: 'context_usage', tokens: 0, limit: CONTEXT_LIMIT, percent: 0 })
              broadcastSession(engId, sessionId, {
                type: 'agent_message',
                text: `🧹 Contexto atingiu ${lastContextPercent}% — compactado automaticamente para conter custo. O estado (findings/fase/escopo) está salvo; a próxima mensagem inicia uma sessão enxuta.`,
              })
            }

            // AUTO-REPORT: run automático concluído com SUCESSO e sem relatório em disco
            // → gera o relatório final num turno extra. Só para runs marcados autoReport
            // (Iniciar/Continuar/Começar do zero); nunca para /pentest-report (evita loop)
            // nem para /rift-compact. Se o agente já gerou um relatório, apenas avisa.
            if (autoReport && runState === 'completed' && !isReport && !isCompact && slug && date) {
              const reportsDir = require('path').join(require('./tenant-paths').readClientDir(framework.path, ws._tenant?.slug, slug, date), 'reports')
              let hasReport = false
              try {
                const fsm = require('fs')
                hasReport = fsm.existsSync(reportsDir) && fsm.readdirSync(reportsDir).some((f) => /\.(md|html|pdf|json)$/i.test(f))
              } catch {}
              if (hasReport) {
                broadcastSession(engId, sessionId, { type: 'agent_message', text: '📄 Relatório disponível na aba Relatório.' })
              } else {
                // fora do stack do onClose atual (a sessão já foi liberada no agent-runner).
                setTimeout(() => { try { triggerAutoReport() } catch (e) { console.warn('[auto-report]', e.message) } }, 800)
              }
            }
          },
        },
      )
    }
  }

  if (msg.type === 'agent_stop') {
    // Marca ANTES de matar: o onClose (SIGTERM → code 143) lê isto para rotular
    // como parada do operador, não como "concluído".
    stopRequested.add(runnerKey)
    agentRunner.stop(runnerKey)
    // A-STATE-3/5: grava 'stopped'/operador já (não espera o processo morrer) → o
    // painel troca "Parar" por "Continuar / Começar do zero" na hora. onClose reforça.
    setRunState(db, engId, 'stopped', 'operator')
    broadcastSession(engId, sessionId, { type: 'agent_message', text: '⏹ Agente parado pelo operador.' })
  }
}

const PORT = process.env.PORT || 3001

connect()
  .then(async () => {
    // A-STATE-4: no boot, nenhum processo claude sobrevive (stopAll matou tudo no
    // shutdown anterior). Qualquer engagement gravado como 'running' é órfão →
    // reconcilia para 'stopped' para o painel não "mentir" que ainda roda.
    // Frente 0: fan-out por tenant. Um `updateMany` global reconciliaria só o
    // banco compartilhado e deixaria os engagements de cada tenant mentindo
    // "running" para sempre.
    try {
      const results = await forEachTenant(async ({ db }) =>
        (await db.Engagement.updateMany({ runState: 'running' }, { $set: { runState: 'stopped', stopReason: 'interrupted' } })).modifiedCount || 0)
      const total = results.filter((r) => r.ok).reduce((n, r) => n + r.value, 0)
      if (total) console.log(`[rift] reconciliados ${total} engagement(s) 'running' → 'stopped' no boot`)
    } catch (err) {
      console.warn('[rift] reconcile de runState falhou:', err?.message)
    }
    // Jobs órfãos ('running' sem run vivo após restart): os agendados retomáveis voltam
    // pra fila (resume:true → o worker os re-despacha com `claude --resume`, "forçando
    // até o fim"); o resto (interativos/sem sessão/sem tentativa) → 'failed'/interrupted.
    try {
      const { requeued, failed } = await jobs.recoverInterruptedJobs()
      if (requeued || failed) console.log(`[rift] recuperação de jobs no boot: ${requeued} re-enfileirado(s) p/ resume, ${failed} encerrado(s)`)
    } catch (err) {
      console.warn('[rift] recuperação de jobs falhou:', err?.message)
    }
    // ASM: scans in-process não sobrevivem a restart → reconcilia 'scanning' órfão.
    try {
      const n = await asmScanner.recoverInterruptedScans()
      if (n) console.log(`[rift] reconciliados ${n} scan(s) ASM 'scanning' → 'failed' no boot`)
    } catch (err) {
      console.warn('[rift] recuperação de scans ASM falhou:', err?.message)
    }
    // P1-14: mata qualquer processo (+ grupo) do agente que sobreviveu a um
    // crash duro do backend anterior (OOM/kill -9 — não passou pelo shutdown
    // gracioso, que já mata a árvore sozinho).
    try {
      const n = agentRunner.reconcileOrphanedProcesses()
      if (n) console.log(`[rift] ${n} processo(s) órfão(s) de crash anterior encerrado(s) no boot`)
    } catch (err) {
      console.warn('[rift] reconciliação de processos órfãos falhou:', err?.message)
    }
    httpServer.listen(PORT, () => {
      console.log(`[rift] backend em http://localhost:${PORT}`)
      // P0-8: torna visível no log quando o agente está rodando com credencial
      // compartilhada (assinatura pessoal) em vez de chave dedicada ao deployment.
      agentRunner.warnIfSharedCredential()
    })
    scheduler.start()
    // Worker de Jobs: o único a despachar runs agendados/headless (lê a fila a cada ~2s).
    jobsWorker.start()
    // Monitoramento contínuo do ASM (re-scan recorrente de domínios) — sem fila,
    // ver asm-scheduler.js.
    asmScheduler.start()
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
  try { jobsWorker.stop() } catch {}
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
