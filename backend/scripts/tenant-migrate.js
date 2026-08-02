#!/usr/bin/env node
'use strict'
/**
 * Frente 0 — migração dos dados atuais (banco único) para bancos por tenant.
 *
 *   node scripts/tenant-migrate.js               # dry-run (padrão, não escreve nada)
 *   node scripts/tenant-migrate.js --apply       # executa
 *   node scripts/tenant-migrate.js --apply --orphans=porttus
 *
 * Propriedades exigidas pelo spec:
 *   · **dry-run por padrão** — só escreve com --apply explícito;
 *   · **idempotente** — rodar 2x deixa o mesmo estado (upsert por _id);
 *   · **não destrutivo** — COPIA para o banco do tenant; o banco de origem fica
 *     intacto e vira o backup natural até o cutover ser validado.
 *
 * Atribuição (decisão do operador em 2026-08-01):
 *   Engagement → tenant do CRIADOR, derivado de Usage.userEmail (é a única
 *   coleção com atribuição de usuário; Engagement não tem campo de posse).
 *   Sem criador derivável → tenant de quarentena `unassigned`, salvo se
 *   --orphans=<slug> disser outra coisa.
 *
 *   Domain / InternalNetwork não têm NENHUM sinal de dono no schema. Vão para o
 *   tenant interno padrão (--internal, default porttus). O dry-run mostra a
 *   contagem para o operador confirmar antes de aplicar.
 */
require('dotenv').config()
const mongoose = require('mongoose')
const { tenantUri, tenantDbName } = require('../src/tenancy')

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const arg = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.split('=').slice(1).join('=') : dflt
}
const ORPHANS  = arg('orphans', 'unassigned')
const INTERNAL = arg('internal', 'porttus')

// Tenants-semente. `unassigned` é quarentena: existe para nada ficar sem casa
// nem cair silenciosamente num tenant errado.
// Decisão do operador (2026-08-01): **Porttus é a operação; Trustsis é o
// primeiro CLIENTE.** Não são dois tenants internos — essa distinção é o que
// permite entrar com duas contas e ver de verdade como a plataforma fica do
// lado do cliente.
const SEED_TENANTS = [
  { slug: 'porttus',    name: 'Porttus',    allowedEmailDomains: ['porttus.com'],  kind: 'internal' },
  { slug: 'trustsis',   name: 'Trustsis',   allowedEmailDomains: ['trustsis.com'], kind: 'customer' },
  { slug: 'unassigned', name: 'Não atribuído (quarentena)', allowedEmailDomains: [], kind: 'internal',
    notes: 'Dados sem dono derivável na migração. Reclassificar manualmente.' },
]

// Coleções que seguem o engagement (chaveadas por engagementId).
const BY_ENGAGEMENT = ['findings', 'chatsessions', 'chatmessages', 'usages', 'jobs', 'reportnarratives']
// Coleções top-level sem sinal de dono → tenant interno.
const TOP_LEVEL = [
  'domains', 'domainassets', 'domainscans',
  'internalnetworks', 'internalhosts', 'internalscans',
  'leakdomains', 'leakedcredentials',
]

function emailDomain(email) {
  const at = String(email || '').lastIndexOf('@')
  return at === -1 ? null : String(email).slice(at + 1).toLowerCase().trim()
}

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rift'
  await mongoose.connect(uri)
  const src = mongoose.connection.db
  console.log(`\n${APPLY ? '⚙  APLICANDO' : '🔍 DRY-RUN (nada será escrito)'} — origem: ${src.databaseName}\n`)

  // ── 1. Semear o registry de tenants (control plane) ───────────────────────
  const Tenant = require('../src/models/Tenant')
  const tenants = {}
  for (const seed of SEED_TENANTS) {
    let t = await Tenant.findOne({ slug: seed.slug }).lean()
    if (!t) {
      if (APPLY) t = (await Tenant.create(seed)).toObject()
      else t = { ...seed, _id: `(novo:${seed.slug})` }
      console.log(`  tenant ${APPLY ? 'criado' : 'seria criado'}: ${seed.slug}`)
    } else {
      console.log(`  tenant já existe: ${seed.slug}`)
    }
    tenants[seed.slug] = t
  }
  if (!tenants[INTERNAL]) throw new Error(`--internal=${INTERNAL} não é um tenant conhecido`)
  if (!tenants[ORPHANS]) throw new Error(`--orphans=${ORPHANS} não é um tenant conhecido`)

  // Mapa domínio de e-mail → slug, a partir do próprio registry.
  const domainToSlug = {}
  for (const t of Object.values(tenants)) {
    for (const d of t.allowedEmailDomains || []) domainToSlug[d] = t.slug
  }

  // ── 2. Atribuir cada engagement a um tenant ───────────────────────────────
  const engagements = await src.collection('engagements').find({}).toArray()
  const engToSlug = new Map()
  const plan = {}
  const bump = (slug, key) => {
    plan[slug] = plan[slug] || {}
    plan[slug][key] = (plan[slug][key] || 0) + 1
  }

  for (const e of engagements) {
    const firstUsage = await src.collection('usages')
      .find({ engagementId: String(e._id), userEmail: { $nin: [null, ''] } })
      .sort({ ts: 1 }).limit(1).toArray()
    const email = firstUsage[0] && firstUsage[0].userEmail
    const slug = (email && domainToSlug[emailDomain(email)]) || ORPHANS
    engToSlug.set(String(e._id), slug)
    bump(slug, 'engagements')
  }

  // ── 3. Contar o que segue cada engagement ─────────────────────────────────
  for (const coll of BY_ENGAGEMENT) {
    const docs = await src.collection(coll).find({}, { projection: { engagementId: 1 } }).toArray()
    for (const d of docs) {
      const slug = engToSlug.get(String(d.engagementId)) || ORPHANS
      bump(slug, coll)
    }
  }
  for (const coll of TOP_LEVEL) {
    const n = await src.collection(coll).countDocuments()
    if (n) bump(INTERNAL, coll)
    if (n) plan[INTERNAL][coll] = n
  }

  // ── 4. Mostrar o plano ────────────────────────────────────────────────────
  console.log('\n── plano de migração ──')
  for (const [slug, counts] of Object.entries(plan)) {
    const t = tenants[slug]
    console.log(`\n  ${slug}  →  ${tenantDbName(t.slug ? t : { slug })}`)
    for (const [k, v] of Object.entries(counts)) console.log(`      ${String(v).padStart(6)}  ${k}`)
  }
  const orphanCount = (plan[ORPHANS] && plan[ORPHANS].engagements) || 0
  if (orphanCount) {
    console.log(`\n  ⚠  ${orphanCount} engagement(s) sem criador derivável → "${ORPHANS}".`)
    console.log(`     Para mandá-los a um tenant específico: --orphans=<slug>`)
  }
  console.log(`\n  ℹ  Domain/InternalNetwork não têm campo de dono no schema — vão para "${INTERNAL}".`)

  if (!APPLY) {
    console.log('\n🔍 dry-run: nada foi escrito. Rode de novo com --apply para executar.\n')
    await mongoose.disconnect()
    return
  }

  // ── 5. Copiar (upsert por _id → idempotente) ──────────────────────────────
  const conns = {}
  const connFor = async (slug) => {
    if (!conns[slug]) conns[slug] = await mongoose.createConnection(tenantUri(tenants[slug])).asPromise()
    return conns[slug]
  }

  async function copy(coll, docs, slug) {
    if (!docs.length) return 0
    const conn = await connFor(slug)
    const ops = docs.map((d) => ({ replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true } }))
    const res = await conn.db.collection(coll).bulkWrite(ops, { ordered: false })
    return (res.upsertedCount || 0) + (res.modifiedCount || 0) + (res.matchedCount || 0)
  }

  console.log('\n── copiando ──')
  // engagements + tudo que os segue
  for (const slug of new Set(engToSlug.values())) {
    const ids = engagements.filter((e) => engToSlug.get(String(e._id)) === slug).map((e) => e._id)
    const n = await copy('engagements', engagements.filter((e) => ids.includes(e._id)), slug)
    console.log(`  ${slug}: engagements ${n}`)
    const idSet = new Set(ids.map(String))
    for (const coll of BY_ENGAGEMENT) {
      const docs = (await src.collection(coll).find({}).toArray())
        .filter((d) => idSet.has(String(d.engagementId)))
      const c = await copy(coll, docs, slug)
      if (c) console.log(`  ${slug}: ${coll} ${c}`)
    }
  }
  // top-level → tenant interno
  for (const coll of TOP_LEVEL) {
    const docs = await src.collection(coll).find({}).toArray()
    const c = await copy(coll, docs, INTERNAL)
    if (c) console.log(`  ${INTERNAL}: ${coll} ${c}`)
  }

  // ── 6. Conferência origem ↔ destino ───────────────────────────────────────
  // Registros ÓRFÃOS (que referenciam um engagement já deletado) não são
  // migrados de propósito: são lixo de engagements removidos. A conferência
  // precisa saber disso, senão acusa "faltou dado" num descarte correto — foi
  // exatamente o que aconteceu na primeira execução (1 job `failed` de um
  // engagement inexistente). Contar e DIZER o que foi descartado é melhor que
  // afrouxar a comparação: silenciar um descarte é como um bug de migração
  // passa despercebido.
  const engIdSet = new Set(engagements.map((e) => String(e._id)))
  console.log('\n── conferência ──')
  let mismatch = 0
  let droppedTotal = 0
  for (const coll of [...BY_ENGAGEMENT, ...TOP_LEVEL, 'engagements']) {
    const before = await src.collection(coll).countDocuments()
    let after = 0
    for (const slug of Object.keys(conns)) after += await conns[slug].db.collection(coll).countDocuments()

    let dropped = 0
    if (BY_ENGAGEMENT.includes(coll)) {
      const docs = await src.collection(coll).find({}, { projection: { engagementId: 1 } }).toArray()
      dropped = docs.filter((d) => !engIdSet.has(String(d.engagementId))).length
    }
    droppedTotal += dropped

    const ok = (after + dropped) >= before
    if (!ok) mismatch++
    const note = dropped ? `  (${dropped} órfão(s) descartado(s))` : ''
    console.log(`  ${ok ? '✓' : '✗'} ${coll.padEnd(20)} origem ${String(before).padStart(6)}  destino ${String(after).padStart(6)}${note}`)
  }
  if (droppedTotal) {
    console.log(`\n  ℹ  ${droppedTotal} registro(s) órfão(s) NÃO migrado(s) — referenciam engagement que já não existe.`)
  }

  await Promise.allSettled(Object.values(conns).map((c) => c.close()))
  await mongoose.disconnect()
  console.log(mismatch === 0
    ? '\n✅ migração concluída — contagens batem. Banco de origem intacto (backup natural).\n'
    : `\n❌ ${mismatch} coleção(ões) com contagem menor no destino. NÃO faça o cutover.\n`)
  process.exitCode = mismatch === 0 ? 0 : 1
}

main().catch((err) => { console.error('ERRO:', err.message); process.exit(1) })
