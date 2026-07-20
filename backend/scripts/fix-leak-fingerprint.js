#!/usr/bin/env node
'use strict'
// P0-2 (auditoria 2026-07-20): antes do fix em src/leaks/search.js, o campo
// `fingerprint` de LeakedCredential era uma string composta com o e-mail CRU
// embutido (não o `account` mascarado) — vazando PII mesmo com o mascaramento
// LGPD aplicado no resto do documento. Este script regrava o fingerprint de
// documentos já persistidos para o hash sha256 (mesmo algoritmo agora usado
// em `buildFingerprint`), sem alterar nenhum outro campo.
//
// Uso:
//   node scripts/fix-leak-fingerprint.js            # DRY-RUN (só relatório)
//   node scripts/fix-leak-fingerprint.js --apply     # regrava de fato
//
// Idempotente: rodar de novo após aplicar não encontra mais fingerprint em
// formato antigo (heurística: contém '@' ou não é hex-64).
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const mongoose = require('mongoose')
const LeakedCredential = require('../src/models/LeakedCredential')
const { buildFingerprint } = require('../src/leaks/search')

const APPLY = process.argv.includes('--apply')
const HEX64 = /^[0-9a-f]{64}$/

;(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rift')

  const all = await LeakedCredential.find({}).lean()
  const legacy = all.filter((c) => !HEX64.test(c.fingerprint || ''))

  console.log(`Credenciais no banco: ${all.length}`)
  console.log(`Com fingerprint em formato antigo (potencial PII embutida): ${legacy.length}`)

  if (!legacy.length) {
    console.log('Nada a fazer.')
    await mongoose.disconnect()
    return
  }

  if (!APPLY) {
    console.log('DRY-RUN — rode com --apply para regravar. Nenhuma alteração feita.')
    await mongoose.disconnect()
    return
  }

  let updated = 0
  for (const c of legacy) {
    const newFp = buildFingerprint(c.domain, {
      provider: c.provider, category: c.category, account: c.account,
      sourceUrl: c.sourceUrl, breachName: c.breachName, seenDate: c.seenDate,
    })
    // Se a nova hash colidir com um documento já existente (raro — dois
    // registros que já eram duplicatas lógicas), mescla removendo o mais
    // antigo em vez de violar unicidade futura do índice.
    const collision = await LeakedCredential.findOne({ fingerprint: newFp, _id: { $ne: c._id } }).lean()
    if (collision) {
      await LeakedCredential.deleteOne({ _id: c._id })
      console.log(`  [merge] ${c._id} duplicava ${collision._id} (mesmo fingerprint novo) — removido`)
      continue
    }
    await LeakedCredential.updateOne({ _id: c._id }, { $set: { fingerprint: newFp } })
    updated++
  }
  console.log(`Atualizados: ${updated} | mesclados/removidos: ${legacy.length - updated}`)
  await mongoose.disconnect()
})()
