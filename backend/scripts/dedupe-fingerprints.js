#!/usr/bin/env node
'use strict'
// P1-17 (auditoria 2026-07-20): antes de aplicar `unique: true` no índice de
// `fingerprint` (DomainAsset e LeakedCredential — models já atualizados),
// qualquer duplicata JÁ existente em produção faria a criação do índice falhar
// silenciosamente (mongoose só loga um erro assíncrono, não derruba o boot —
// o índice simplesmente não fica unique, deixando a correção sem efeito).
// Este script remove duplicatas ANTES do deploy, mantendo o doc mais recente
// (maior `lastSeen`, empate por `updatedAt`).
//
// Uso:
//   node scripts/dedupe-fingerprints.js            # DRY-RUN (só relatório)
//   node scripts/dedupe-fingerprints.js --apply     # remove de fato
//
// Idempotente: rodar de novo após aplicar não encontra mais duplicatas.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const mongoose = require('mongoose')
const DomainAsset = require('../src/models/DomainAsset')
const LeakedCredential = require('../src/models/LeakedCredential')
const { pickDuplicatesToRemove } = require('../src/dedupe-logic')

const APPLY = process.argv.includes('--apply')

async function dedupeCollection(Model, label) {
  const all = await Model.find({ fingerprint: { $ne: null } })
    .select('fingerprint lastSeen updatedAt')
    .lean()

  const toRemove = pickDuplicatesToRemove(all)
  const dupGroupCount = new Set(toRemove.map((d) => d.fingerprint)).size

  console.log(`[${label}] documentos: ${all.length} | fingerprints duplicados: ${dupGroupCount} | docs a remover: ${toRemove.length}`)
  if (!toRemove.length) return 0

  if (APPLY) {
    const ids = toRemove.map((d) => d._id)
    await Model.deleteMany({ _id: { $in: ids } })
  }
  return toRemove.length
}

;(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rift')

  const removedAssets = await dedupeCollection(DomainAsset, 'DomainAsset')
  const removedCreds = await dedupeCollection(LeakedCredential, 'LeakedCredential')

  if (!APPLY && (removedAssets || removedCreds)) {
    console.log('DRY-RUN — rode com --apply para remover de fato. Nenhuma alteração feita.')
  } else if (APPLY) {
    console.log(`Removidos: ${removedAssets} DomainAsset + ${removedCreds} LeakedCredential.`)
    console.log('Agora é seguro reiniciar o backend — o índice unique de fingerprint deve criar sem erro.')
  }

  await mongoose.disconnect()
})()
