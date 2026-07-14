#!/usr/bin/env node
'use strict'
// Remove FISICAMENTE findings órfãos — cujo engagementId não corresponde a nenhum
// engagement existente (ex.: engagements removidos, ou importados por scripts antigos
// com id que não bate). A contagem já os ignora (ver src/findings-count.js); este
// script apaga os documentos mortos do banco.
//
// Uso:
//   node scripts/clean-orphan-findings.js            # DRY-RUN (só relatório, não apaga)
//   node scripts/clean-orphan-findings.js --apply     # apaga de fato
//
// Idempotente: rodar de novo após aplicar não encontra mais órfãos.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const mongoose = require('mongoose')
const Finding = require('../src/models/Finding')
const Engagement = require('../src/models/Engagement')

const APPLY = process.argv.includes('--apply')

;(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rift')

  const engIds = new Set((await Engagement.find({}, { _id: 1 }).lean()).map((e) => String(e._id)))
  const all = await Finding.find({}, { engagementId: 1, engagementName: 1 }).lean()
  const orphans = all.filter((f) => !engIds.has(String(f.engagementId)))

  // Agrupa por engagementId :: nome para o relatório.
  const byGroup = {}
  for (const f of orphans) {
    const k = `${f.engagementId} :: ${f.engagementName || '(sem nome)'}`
    byGroup[k] = (byGroup[k] || 0) + 1
  }

  console.log(`Findings no banco: ${all.length} | engagements existentes: ${engIds.size}`)
  console.log(`Órfãos encontrados: ${orphans.length}`)
  for (const [k, n] of Object.entries(byGroup).sort((a, b) => b[1] - a[1])) {
    console.log(`  [${String(n).padStart(3)}] ${k}`)
  }

  if (!orphans.length) {
    console.log('Nada a limpar. ✅')
  } else if (!APPLY) {
    console.log('\nDRY-RUN — nada foi apagado. Rode com --apply para remover.')
  } else {
    const ids = orphans.map((f) => f._id)
    const r = await Finding.deleteMany({ _id: { $in: ids } })
    console.log(`\nRemovidos: ${r.deletedCount} findings órfãos. ✅`)
  }

  await mongoose.disconnect()
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1) })
