const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { Router } = require('express')

const router = Router()

// Roles: admin | user
// Single-VPS setup: users seeded from env or defaults.
// ADMIN_PASSWORD_HASH can be generated with: node -e "console.log(require('bcryptjs').hashSync('senha', 10))"
const USERS = [
  {
    id: '1',
    email: process.env.ADMIN_EMAIL || 'admin@rift.local',
    passwordHash: process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'rift2024', 10),
    role: 'admin',
    name: 'Admin',
  },
]

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '12h' }
  )
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {}

  if (!email || !password) {
    return res.status(400).json({ error: 'email e password obrigatórios' })
  }

  const user = USERS.find((u) => u.email === email)
  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas' })
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    return res.status(401).json({ error: 'Credenciais inválidas' })
  }

  const token = signToken(user)
  return res.json({
    token,
    user: { id: user.id, email: user.email, role: user.role, name: user.name },
  })
})

// GET /api/auth/me  — requer token
router.get('/me', requireAuth(), (req, res) => {
  res.json({ user: req.user })
})

// Middleware de autenticação — exportado para uso nas outras rotas
function requireAuth(roles = []) {
  return (req, res, next) => {
    const header = req.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null

    if (!token) {
      return res.status(401).json({ error: 'Token ausente' })
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret')
      // Support both local tokens ({ sub, email, role, name }) and SSO tokens ({ user: {...} })
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

module.exports = { router, requireAuth }
