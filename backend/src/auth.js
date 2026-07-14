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
    { sub: user._id || user.id, email: user.email, role: user.role, name: user.name },
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
  res.cookie(COOKIE_NAME, token, cookieOptions)
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

function requireAuth(roles = []) {
  return (req, res, next) => {
    const header = req.headers.authorization ?? ''
    const headerToken = header.startsWith('Bearer ') ? header.slice(7) : null
    const token = req.cookies?.[COOKIE_NAME] || headerToken
    if (!token) return res.status(401).json({ error: 'Token ausente' })

    try {
      const payload = jwt.verify(token, JWT_SECRET)
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

module.exports = { router, requireAuth, signToken, JWT_SECRET, COOKIE_NAME, cookieOptions }
