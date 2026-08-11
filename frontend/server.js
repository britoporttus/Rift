const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const httpProxy = require('http-proxy')

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT || '3000', 10)
const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001'

// Erros de rede transitórios em conexões proxiadas (backend reiniciando, cliente
// abortando, túnel caindo) NÃO podem derrubar o servidor inteiro. Sem isto, um
// ECONNRESET vira uncaughtException e o processo morre — era a causa do crash-loop
// (milhares de restarts no pm2) que apagava o chat e derrubava o WebSocket.
const TRANSIENT = new Set(['ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT', 'ECANCELED'])
function isTransientNetErr(err) {
  return !!err && (TRANSIENT.has(err.code) || /socket hang up/i.test(err.message || ''))
}
process.on('uncaughtException', (err) => {
  if (isTransientNetErr(err)) { console.warn('[server] erro de rede transitório ignorado:', err.message); return }
  console.error('[server] uncaughtException fatal:', err)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  if (isTransientNetErr(reason)) { console.warn('[server] rejection de rede transitória ignorada:', reason && reason.message); return }
  console.error('[server] unhandledRejection:', reason)
})

const app = next({ dev })
const handle = app.getRequestHandler()

const proxy = httpProxy.createProxyServer({
  target: backendUrl,
  changeOrigin: true,
})

// O 3º argumento é `res` (HTTP) ou o `socket` (upgrade WS) — tratar ambos.
proxy.on('error', (err, _req, resOrSocket) => {
  console.warn('[proxy] error:', err.message)
  if (resOrSocket && typeof resOrSocket.writeHead === 'function') {
    if (!resOrSocket.headersSent) resOrSocket.writeHead(502)
    try { resOrSocket.end('Backend unavailable') } catch {}
  } else if (resOrSocket && typeof resOrSocket.destroy === 'function') {
    try { resOrSocket.destroy() } catch {}
  }
})

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true)
    const pathname = parsedUrl.pathname || '/'

    // Rota de emergência para destravar um navegador que congelou o shell velho
    // em cache (guardado antes do no-store, quando o header ainda permitia
    // cachear por 1 ano). Clear-Site-Data: "cache" faz o próprio navegador
    // purgar o cache do site — mantém o login (não limpamos "cookies") — e em
    // seguida redireciona pra home. Basta o operador abrir /_flush uma vez.
    if (pathname === '/_flush') {
      res.statusCode = 303
      res.setHeader('Clear-Site-Data', '"cache"')
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Location', '/dominios')
      res.end('limpando cache do navegador...')
      return
    }

    // O shell HTML (e os payloads RSC de navegação) NÃO podem ser cacheados pelo
    // navegador. O Next marca páginas estáticas com `s-maxage=31536000,
    // stale-while-revalidate`; browsers (Brave em especial) passam a servir um
    // shell VELHO — que referencia chunks velhos — mesmo após um deploy novo, e
    // o usuário fica "preso" na versão anterior (menu/telas antigas) por mais que
    // dê refresh. Os assets em /_next/static são content-hashed (immutable) e
    // continuam cacheáveis normalmente. Forçamos `no-store` só nos documentos,
    // interceptando qualquer Cache-Control que o Next tente escrever.
    const cacheable =
      pathname.startsWith('/_next/static') ||
      pathname.startsWith('/_next/image') ||
      pathname === '/favicon.svg'
    if (!cacheable) {
      const origSetHeader = res.setHeader.bind(res)
      res.setHeader = (name, value) => {
        if (String(name).toLowerCase() === 'cache-control') {
          return origSetHeader('Cache-Control', 'no-store, must-revalidate')
        }
        return origSetHeader(name, value)
      }
      try { res.setHeader('Cache-Control', 'no-store, must-revalidate') } catch {}
    }

    handle(req, res, parsedUrl)
  })

  // Proxy WebSocket upgrades to backend
  server.on('upgrade', (req, socket, head) => {
    // Sem este listener, um erro no socket de upgrade vira uncaughtException.
    socket.on('error', (err) => console.warn('[ws-upgrade] socket error:', err.message))
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
