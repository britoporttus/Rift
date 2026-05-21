const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { Router } = require('express')
const User = require('./models/User')

const router = Router()

function signToken(user) {
  return jwt.sign(
    { sub: user._id || user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '12h' }
  )
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) return res.status(400).json({ error: 'email e password obrigatórios' })

  const user = await User.findOne({ email: email.toLowerCase(), provider: 'local' })
  if (!user || !user.passwordHash) return res.status(401).json({ error: 'Credenciais inválidas' })

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' })

  await User.findByIdAndUpdate(user._id, { lastLogin: new Date() })

  const token = signToken(user)
  return res.json({
    token,
    user: { id: user._id, email: user.email, role: user.role, name: user.name },
  })
})

// GET /api/auth/me
router.get('/me', requireAuth(), (req, res) => {
  res.json({ user: req.user })
})

function requireAuth(roles = []) {
  return (req, res, next) => {
    const header = req.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return res.status(401).json({ error: 'Token ausente' })

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret')
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

module.exports = { router, requireAuth, signToken }
