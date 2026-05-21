const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const httpProxy = require('http-proxy')

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT || '3000', 10)
const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001'

const app = next({ dev })
const handle = app.getRequestHandler()

const proxy = httpProxy.createProxyServer({
  target: backendUrl,
  changeOrigin: true,
})

proxy.on('error', (err, _req, res) => {
  console.error('[proxy] error:', err.message)
  if (res && !res.headersSent && res.writeHead) {
    res.writeHead(502)
    res.end('Backend unavailable')
  }
})

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true)
    handle(req, res, parsedUrl)
  })

  // Proxy WebSocket upgrades to backend
  server.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/ws')) {
      proxy.ws(req, socket, head, { target: backendUrl })
    } else {
      socket.destroy()
    }
  })

  server.listen(port, () => {
    console.log(`[rift] frontend em http://localhost:${port}`)
  })
})
