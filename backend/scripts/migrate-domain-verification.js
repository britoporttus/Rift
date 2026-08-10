#!/usr/bin/env node
'use strict'
/**
 * Marca os domínios JÁ CADASTRADOS como `legacy` na prova de posse.
 *
 *   node scripts/migrate-domain-verification.js            # dry-run
 *   node scripts/migrate-domain-verification.js --apply
 *
 * Por que `legacy` e não `verified`:
 *
 * A regra decidida em 2026-08-03 é "bloqueia tudo até verificar, ninguém
 * dispensa". Aplicada literalmente ao que já existe, ela PARARIA a operação
 * hoje — os domínios em produção foram cadastrados pelo operador sob o modelo
 * antigo, em que quem cadastrava respondia pelo que fazia.
 *
 * Marcá-los como `verified` seria mentir: ninguém provou posse de
 * `scanme.nmap.org`. `legacy` diz a verdade — "cadastrado antes da regra, roda,
 * mas está pendente de regularização" — e a UI pode cobrar isso sem que a
 * plataforma trave. É a diferença entre uma exceção auditável e uma aprovação
 * silenciosa.
 *
 * Idempotente: só toca em documentos sem status definido.
 */
require('dotenv').config()
const mongoose = require('mongoose')
const { forEachTenant } = require('../src/tenancy')

const APPLY = process.argv.includes('--apply')

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rift')
  console.log(`\n${APPLY ? '⚙  APLICANDO' : '🔍 DRY-RUN (nada será escrito)'}\n`)

  let totalLegacy = 0, totalJa = 0
  await forEachTenant(async ({ tenant, db }) => {
    const todos = await db.Domain.find({}).select('domain verification').lean()
    const semStatus = todos.filter((d) => !d.verification || !d.verification.status)
    const comStatus = todos.length - semStatus.length

    console.log(`  ${tenant.slug}: ${todos.length} domínio(s) — ${semStatus.length} sem status, ${comStatus} já definido(s)`)
    for (const d of semStatus) console.log(`      ${d.domain} → legacy`)

    if (APPLY && semStatus.length) {
      await db.Domain.updateMany(
        { _id: { $in: semStatus.map((d) => d._id) } },
        { $set: { 'verification.status': 'legacy', 'verification.method': null } },
      )
    }
    totalLegacy += semStatus.length
    totalJa += comStatus
  })

  console.log(`\n  ${totalLegacy} marcado(s) como legacy · ${totalJa} já tinham status`)
  if (!APPLY) console.log('\n🔍 dry-run: nada foi escrito. Rode com --apply para executar.\n')
  else console.log('\n✅ pronto. Domínios legacy CONTINUAM escaneando, mas aparecem como pendentes de verificação na UI.\n')

  await mongoose.disconnect()
}

main().catch((err) => { console.error('ERRO:', err.message); process.exit(1) })
