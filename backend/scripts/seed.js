/**
 * Seed default admin user (local auth)
 * Run: node backend/scripts/seed.js
 * Safe to re-run — skips if email already exists
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const User = require('../src/models/User')

const EMAIL = process.env.ADMIN_EMAIL || 'admin@rift.local'
const PASSWORD = process.env.ADMIN_PASSWORD

// SEC-2: nunca criar admin com senha default/fraca. Exige ADMIN_PASSWORD forte.
const WEAK = new Set(['rift2024', 'admin', 'password', 'changeme', '123456'])
function assertStrongPassword() {
  if (!PASSWORD || PASSWORD.length < 10 || WEAK.has(PASSWORD)) {
    console.error('[seed] ERRO: defina ADMIN_PASSWORD no .env com >= 10 caracteres ' +
      'e sem valores triviais. Ex: node -e "console.log(require(\'crypto\').randomBytes(12).toString(\'base64url\'))"')
    process.exit(1)
  }
}

async function main() {
  assertStrongPassword()
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rift')
  console.log('[seed] conectado ao MongoDB')

  const exists = await User.findOne({ email: EMAIL.toLowerCase() })
  if (exists) {
    console.log(`[seed] usuário ${EMAIL} já existe (role: ${exists.role}) — nada a fazer`)
    await mongoose.disconnect()
    return
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10)
  await User.create({
    email: EMAIL.toLowerCase(),
    name: 'Admin',
    role: 'admin',
    passwordHash,
    provider: 'local',
  })

  console.log(`[seed] admin criado: ${EMAIL}`)
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('[seed] erro:', err.message)
  process.exit(1)
})
