require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const express = require('express')
const { createServer } = require('http')
const { WebSocketServer } = require('ws')
const { URL } = require('url')
const cors = require('cors')
const jwt = require('jsonwebtoken')

const { connect } = require('./db')
const { router: authRouter } = require('./auth')
const authMicrosoftRouter = require('./api/auth-microsoft')
const engagementsRouter = require('./api/engagements')
const findingsRouter = require('./api/findings')
const reportsRouter = require('./api/reports')
const adminRouter = require('./api/admin')
const usersRouter = require('./api/users')
const agentRunner = require('./agent-runner')
const findingsWatcher = require('./findings-watcher')
const { getEngagement, updateEngagement, appendUsage } = require('./store')

const app = express()
const httpServer = createServer(app)
const wss = new WebSocketServer({ noServer: true })

// engagementId -> Set<WebSocket>
const engagementClients = new Map()

function broadcast(engagementId, event) {
  const clients = engagementClients.get(engagementId)
  if (!clients) return
  const json = JSON.stringify(event)
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(json)
  }
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(s => s.trim())
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    if (/\.trycloudflare\.com$/.test(origin) || /\.cloudflareaccess\.com$/.test(origin)) return cb(null, true)
    cb(new Error('Not allowed by CORS'))
  },
  credentials: true,
}))
app.use(express.json())

app.get('/api/health', (_req, res) => res.json({ status: 'ok', version: '0.1.0' }))
app.use('/api/auth', authRouter)
app.use('/api/auth', authMicrosoftRouter)
app.use('/api/engagements', engagementsRouter)
app.use('/api/findings', findingsRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/admin', adminRouter)
app.use('/api/users', usersRouter)

// WebSocket upgrade — authenticate via token query param
httpServer.on('upgrade', (req, socket, head) => {
  const urlObj = new URL(req.url, 'http://localhost')
  const token = urlObj.searchParams.get('token')
  const engagementId = urlObj.searchParams.get('engagementId')

  if (!token || !engagementId) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret')
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws._user = payload
      ws._engagementId = engagementId
      wss.emit('connection', ws)
    })
  } catch {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
  }
})

wss.on('connection', async (ws) => {
  const engId = ws._engagementId
  const user = ws._user

  if (!engagementClients.has(engId)) engagementClients.set(engId, new Set())
  engagementClients.get(engId).add(ws)

  console.log(`[ws] ${user.email} → engagement ${engId}`)

  const engagement = await getEngagement(engId)
  if (engagement) {
    findingsWatcher.watch(engId, engagement.slug, engagement.date, async (event) => {
      broadcast(engId, event)
      try {
        const current = await getEngagement(engId)
        if (current) {
          await updateEngagement(engId, { findingsCount: (current.findingsCount || 0) + 1 })
        }
      } catch {}
    })
  }

  ws.send(JSON.stringify({ type: 'agent_message', text: '🔗 Rift conectado.' }))

  ws.on('message', (raw) => {
    try {
      handleMessage(JSON.parse(raw.toString()), engId, user)
    } catch {
      console.warn('[ws] mensagem inválida')
    }
  })

  ws.on('close', () => {
    engagementClients.get(engId)?.delete(ws)
    if (engagementClients.get(engId)?.size === 0) engagementClients.delete(engId)
    console.log(`[ws] ${user.email} desconectou de ${engId}`)
  })
})

async function handleMessage(msg, engId, user) {
  const clients = engagementClients.get(engId)
  if (!clients) return

  if (msg.type === 'operator_message' || msg.type === 'operator_answer') {
    const text = msg.text || msg.option || ''
    if (!text) return

    // echo operator message back so it appears in the feed for all connected clients
    broadcast(engId, { type: 'operator_message', text })

    if (agentRunner.isRunning(engId)) {
      agentRunner.sendInput(engId, text)
    } else {
      const eng = await getEngagement(engId)
      const ctx = eng
        ? `[CONTEXTO DO SISTEMA]\nEngagement ativo: "${eng.name}" | Alvo: ${eng.target} | Status: ${eng.status}\nResponda SEMPRE em português. Mantenha contexto somente deste engagement.\n\n[OPERADOR]\n`
        : ''
      agentRunner.run(engId, ctx + text, clients, (usd, tokens) => {
        appendUsage({ usd, tokens, engagementId: engId, date: new Date().toISOString() }).catch(() => {})
      })
    }
  }

  if (msg.type === 'agent_stop') {
    agentRunner.stop(engId)
    broadcast(engId, { type: 'agent_message', text: '⏹ Agente parado pelo operador.' })
  }
}

const PORT = process.env.PORT || 3001

connect()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`[rift] backend em http://localhost:${PORT}`)
    })
  })
  .catch((err) => {
    console.error('[db] falha ao conectar MongoDB:', err.message)
    process.exit(1)
  })
