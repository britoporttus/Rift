const { Router } = require('express')
const bcrypt = require('bcryptjs')
const { requireAuth } = require('../auth')
const User = require('../models/User')

const router = Router()
router.use(requireAuth(['admin']))

function toDto(u) {
  const obj = u.toObject ? u.toObject() : u
  return {
    id:        String(obj._id),
    email:     obj.email,
    name:      obj.name,
    role:      obj.role,
    provider:  obj.provider,
    lastLogin: obj.lastLogin || null,
    createdAt: obj.createdAt,
  }
}

// GET /api/users
router.get('/', async (_req, res) => {
  const users = await User.find().select('-passwordHash').sort({ createdAt: -1 })
  res.json(users.map(toDto))
})

// POST /api/users — cria usuário local
router.post('/', async (req, res) => {
  const { email, name, password, role } = req.body ?? {}
  if (!email || !name || !password) {
    return res.status(400).json({ error: 'email, name e password obrigatórios' })
  }

  const exists = await User.findOne({ email: email.toLowerCase() })
  if (exists) return res.status(409).json({ error: 'Usuário já existe' })

  const passwordHash = await bcrypt.hash(password, 10)
  const user = await User.create({
    email: email.toLowerCase(),
    name,
    role: role === 'admin' ? 'admin' : 'user',
    passwordHash,
    provider: 'local',
  })

  res.status(201).json(toDto(user))
})

// PATCH /api/users/:id — atualiza role ou nome
router.patch('/:id', async (req, res) => {
  const { role, name } = req.body ?? {}
  const patch = {}
  if (role && ['admin', 'user'].includes(role)) patch.role = role
  if (name) patch.name = name

  const user = await User.findByIdAndUpdate(req.params.id, patch, { new: true })
    .select('-passwordHash')
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' })
  res.json(toDto(user))
})

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  await User.findByIdAndDelete(req.params.id)
  res.status(204).end()
})

// PATCH /api/users/:id/reset-password — apenas usuários locais
router.patch('/:id/reset-password', async (req, res) => {
  const { password } = req.body ?? {}
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' })
  }

  const user = await User.findById(req.params.id)
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' })
  if (user.provider !== 'local') {
    return res.status(400).json({ error: 'Não é possível redefinir senha de usuário SSO' })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  await User.findByIdAndUpdate(req.params.id, { passwordHash })
  res.json({ ok: true })
})

module.exports = router
