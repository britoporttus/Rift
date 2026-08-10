#!/usr/bin/env node
'use strict'
/**
 * Cria/atualiza as contas de demonstração da Frente 0 — uma de cada lado da
 * fronteira, para conferir na tela o que o cliente enxerga:
 *
 *   operador@porttus.com   role=admin   tenant=porttus    (a operação)
 *   cliente@trustsis.com   role=client  tenant=trustsis   (o primeiro cliente)
 *
 *   node scripts/seed-tenant-users.js                 # senhas aleatórias, impressas 1x
 *   node scripts/seed-tenant-users.js --password=...  # senha fixa para os dois
 *
 * Idempotente: rodar de novo só re-vincula o tenant e (se pedido) troca a senha.
 * A senha só aparece no stdout desta execução — não é gravada em lugar nenhum.
 */
require('dotenv').config()
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')

const args = process.argv.slice(2)
const arg = (n) => { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : null }
const FIXED_PASSWORD = arg('password')

const ACCOUNTS = [
  { email: 'operador@porttus.com', name: 'Operador Porttus', role: 'admin',  tenantSlug: 'porttus' },
  { email: 'cliente@trustsis.com', name: 'Cliente Trustsis', role: 'client', tenantSlug: 'trustsis' },
]

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rift')
  const User = require('../src/models/User')
  const Tenant = require('../src/models/Tenant')

  const out = []
  for (const acc of ACCOUNTS) {
    const tenant = await Tenant.findOne({ slug: acc.tenantSlug }).lean()
    if (!tenant) throw new Error(`Tenant "${acc.tenantSlug}" não existe — rode tenant-migrate.js primeiro`)

    const password = FIXED_PASSWORD || crypto.randomBytes(9).toString('base64url')
    const passwordHash = await bcrypt.hash(password, 10)

    const existing = await User.findOne({ email: acc.email })
    if (existing) {
      // tokenVersion++ invalida qualquer JWT antigo desta conta (P1-11) — a troca
      // de senha/tenant não pode deixar uma sessão anterior viva.
      await User.updateOne({ _id: existing._id }, {
        $set: { name: acc.name, role: acc.role, tenantId: String(tenant._id), passwordHash, provider: 'local' },
        $inc: { tokenVersion: 1 },
      })
      out.push({ ...acc, password, status: 'atualizado' })
    } else {
      await User.create({
        email: acc.email, name: acc.name, role: acc.role,
        tenantId: String(tenant._id), passwordHash, provider: 'local',
      })
      out.push({ ...acc, password, status: 'criado' })
    }
  }

  console.log('\n  ┌─ contas de demonstração ────────────────────────────────────────')
  for (const a of out) {
    console.log(`  │ ${a.status.padEnd(10)} ${a.email}`)
    console.log(`  │   senha:  ${a.password}`)
    console.log(`  │   papel:  ${a.role}   tenant: ${a.tenantSlug}`)
    console.log('  │')
  }
  console.log('  └─ a senha só aparece agora; não fica gravada em lugar nenhum.\n')

  await mongoose.disconnect()
}

main().catch((err) => { console.error('ERRO:', err.message); process.exit(1) })
