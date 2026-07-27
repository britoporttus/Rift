const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { Router } = require('express')
const User = require('./models/User')

// Fail-fast: nunca rodar com segredo ausente ou com um placeholder conhecido.
// Sem isso, qualquer um forja um token { role: 'admin' } e assume a plataforma.
const JWT_SECRET = process.env.JWT_SECRET
const INSECURE_SECRETS = new Set(['dev-secret', 'change-me-in-production', 'changeme', 'secret', ''])
if (!JWT_SECRET || INSECURE_SECRETS.has(JWT_SECRET) || JWT_SECRET.length < 32) {
  console.error('[FATAL] JWT_SECRET ausente, fraco ou usando valor placeholder. ' +
    'Defina JWT_SECRET no .env com pelo menos 32 caracteres aleatórios ' +
    '(ex: `node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"`).')
  process.exit(1)
}

const router = Router()

// Cookie HttpOnly no lugar de token no localStorage — inacessível a JS (mitiga
// roubo via XSS). SameSite=Lax cobre o fluxo de SSO (cookie é setado por fetch
// same-origin no POST /exchange, não pelo redirect cross-site do Microsoft).
const COOKIE_NAME = 'rift_token'
const isProd = process.env.NODE_ENV === 'production'
const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/',
  maxAge: 12 * 60 * 60 * 1000, // mesma janela do JWT (expiresIn: '12h')
}
// `secure` fixo em `isProd` quebra login em qualquer acesso direto por HTTP puro
// (staging local, porta solta sem TLS na frente) — o browser recusa silenciosamente
// gravar um cookie Secure fora de HTTPS, então o login "funciona" (200) mas a sessão
// nunca gruda. Continua `secure:true` pra QUALQUER host que não seja localhost —
// produção (atrás de proxy HTTPS) não muda de comportamento.
// IMPORTANTE: o rewrite do Next.js (`/api/:path*` → http://localhost:3001) faz o
// backend enxergar sempre `Host: localhost:3001`, não o host que o navegador usou —
// por isso é `x-forwarded-host` (que o Next preserva) que precisa ser checado aqui,
// nunca `req.hostname`/`req.headers.host` puro (sempre daria "localhost" pra tudo).
function cookieOptionsFor(req) {
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(':')[0].toLowerCase()
  const host = forwardedHost || (req.hostname || '').toLowerCase()
  const isLocal = host === 'localhost' || host === '127.0.0.1'
  return { ...cookieOptions, secure: isProd && !isLocal }
}

// SEC-2: rate limit em memória para /login (app interno, 1 instância) — trava
// brute force sem dependência externa. Chaveado por e-mail (dimensão que importa
// aqui, já que o proxy do frontend colapsa os IPs em localhost).
const LOGIN_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS) || 10
const LOGIN_WINDOW_MS    = Number(process.env.LOGIN_WINDOW_MS) || 15 * 60 * 1000
const loginAttempts = new Map() // key -> { count, resetAt }

function loginRateLimit(req, res, next) {
  const email = (req.body?.email || '').toLowerCase().trim()
  const key = email || req.ip || 'unknown'
  const now = Date.now()
  let rec = loginAttempts.get(key)
  if (!rec || now > rec.resetAt) { rec = { count: 0, resetAt: now + LOGIN_WINDOW_MS }; loginAttempts.set(key, rec) }
  rec.count += 1
  if (rec.count > LOGIN_MAX_ATTEMPTS) {
    const retry = Math.ceil((rec.resetAt - now) / 1000)
    res.setHeader('Retry-After', String(retry))
    return res.status(429).json({ error: `Muitas tentativas de login. Tente novamente em ${Math.ceil(retry / 60)} min.` })
  }
  next()
}
// Limpeza periódica dos registros expirados (evita crescimento ilimitado do Map).
const loginCleanup = setInterval(() => {
  const now = Date.now()
  for (const [k, r] of loginAttempts) if (now > r.resetAt) loginAttempts.delete(k)
}, LOGIN_WINDOW_MS)
if (loginCleanup.unref) loginCleanup.unref()

function signToken(user) {
  return jwt.sign(
    // tv (tokenVersion): P1-11 — permite revogar o token tecnicamente em mudança
    // de role/reset de senha, sem esperar a expiração de 12h. `|| 0` cobre users
    // criados antes do campo existir (default do schema já é 0, mas o objeto
    // passado aqui pode ser um .lean()/toObject() de um doc antigo em cache).
    { sub: user._id || user.id, email: user.email, role: user.role, name: user.name, tv: user.tokenVersion || 0 },
    JWT_SECRET,
    { expiresIn: '12h' }
  )
}

// POST /api/auth/login
router.post('/login', loginRateLimit, async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) return res.status(400).json({ error: 'email e password obrigatórios' })

  const user = await User.findOne({ email: email.toLowerCase(), provider: 'local' })
  if (!user || !user.passwordHash) return res.status(401).json({ error: 'Credenciais inválidas' })

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' })

  await User.findByIdAndUpdate(user._id, { lastLogin: new Date() })

  const token = signToken(user)
  res.cookie(COOKIE_NAME, token, cookieOptionsFor(req))
  return res.json({
    user: { id: user._id, email: user.email, role: user.role, name: user.name },
  })
})

// GET /api/auth/me
router.get('/me', requireAuth(), (req, res) => {
  res.json({ user: req.user })
})

// POST /api/auth/logout — limpa o cookie no servidor (o browser não pode, é HttpOnly).
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: cookieOptions.path })
  res.json({ ok: true })
})

// P1-11: valida o JWT E confere que `tv` (tokenVersion) do token ainda bate com
// o do usuário no banco — se um admin rebaixar role ou resetar senha de outra
// conta, `bumpTokenVersion` incrementa o contador e QUALQUER token emitido antes
// disso passa a ser rejeitado aqui, mesmo dentro da janela de 12h. Usuário
// excluído (findById retorna null) também cai neste 401.
async function checkTokenVersion(payload) {
  const user = await User.findById(payload.sub).select('tokenVersion').lean()
  if (!user) return false
  return (payload.tv || 0) === (user.tokenVersion || 0)
}

function requireAuth(roles = []) {
  return async (req, res, next) => {
    // P2-34 (auditoria 2026-07-20): o fallback `Authorization: Bearer` reabria
    // a superfície que o cookie HttpOnly existe pra fechar (roubo de token via
    // XSS/log/extensão de browser). Confirmado sem uso real: nenhum client
    // deste repo (frontend/lib/api.ts, CI, scripts) manda esse header pro
    // próprio backend do Rift — removido.
    const token = req.cookies?.[COOKIE_NAME]
    if (!token) return res.status(401).json({ error: 'Token ausente' })

    try {
      const payload = jwt.verify(token, JWT_SECRET)
      const stillValid = await checkTokenVersion(payload)
      if (!stillValid) return res.status(401).json({ error: 'Sessão revogada — faça login novamente.' })

      req.user = payload.user
        ? payload.user
        : { id: payload.sub, email: payload.email, role: payload.role, name: payload.name }

      if (roles.length > 0 && !roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Acesso negado' })
      }
      next()
    } catch {
      return res.status(401).json({ error: 'Token inválido ou expirado' })
    }
  }
}

// Incrementa tokenVersion — chame sempre que a role ou a senha de um usuário
// mudar (ver api/users.js). Idempotente/seguro mesmo se chamado em duplicidade.
async function bumpTokenVersion(userId) {
  await User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } }).catch(() => {})
}

module.exports = { router, requireAuth, signToken, checkTokenVersion, bumpTokenVersion, JWT_SECRET, COOKIE_NAME, cookieOptions, cookieOptionsFor }
