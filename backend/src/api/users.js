const { Router } = require('express')
const bcrypt = require('bcryptjs')
const { requireAuth, bumpTokenVersion } = require('../auth')
const { isLastAdmin } = require('../rbac')
const User = require('../models/User')

const router = Router()
router.use(requireAuth(['admin']))

const countAdmins = () => User.countDocuments({ role: 'admin' })

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
// P2-31 (auditoria 2026-07-20): pra uma conta provider:'microsoft' (SSO), a role
// setada aqui é SOBRESCRITA no próximo login pelo grupo AAD (ver api/auth-microsoft.js)
// — comportamento intencional (SSO é a fonte da verdade), mas surpreende quem não
// souber disso. Se precisar de uma promoção/rebaixamento que sobreviva ao próximo
// login de uma conta SSO, ajuste a associação de grupo no Azure AD, não aqui.
router.patch('/:id', async (req, res) => {
  const { role, name } = req.body ?? {}
  const patch = {}
  if (role && ['admin', 'user'].includes(role)) patch.role = role
  if (name) patch.name = name

  // BUG-2: não rebaixar o último admin (senão ninguém mais administra).
  if (patch.role === 'user') {
    const target = await User.findById(req.params.id).lean()
    if (target && isLastAdmin(target.role, await countAdmins())) {
      return res.status(400).json({ error: 'Não é possível rebaixar o último administrador.' })
    }
  }

  const user = await User.findByIdAndUpdate(req.params.id, patch, { new: true })
    .select('-passwordHash')
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' })
  // P1-11: mudou a role → revoga qualquer JWT já emitido pra essa conta (não
  // espera as até 12h de janela do token expirarem sozinhas).
  if (patch.role) await bumpTokenVersion(req.params.id)
  res.json(toDto(user))
})

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  // BUG-2: não deletar a própria conta nem o último admin (anti-lockout).
  if (String(req.params.id) === String(req.user?.id)) {
    return res.status(400).json({ error: 'Você não pode excluir a própria conta.' })
  }
  const target = await User.findById(req.params.id).lean()
  if (target && isLastAdmin(target.role, await countAdmins())) {
    return res.status(400).json({ error: 'Não é possível excluir o último administrador.' })
  }
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
  // P1-11: reset de senha também revoga sessões existentes dessa conta.
  await bumpTokenVersion(req.params.id)
  res.json({ ok: true })
})

module.exports = router
