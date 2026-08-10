// Migração one-off (2026-08-10): o bug pré-Fase 2 gravava host como
// DomainAsset type:'web' com o MESMO fingerprint do subdomínio, sobrescrevendo-o.
// O tipo 'web' foi aposentado (agora o httpx enriquece o subdomínio no lugar),
// então TODO asset type:'web' remanescente é, na verdade, um subdomínio que a UI
// escondia. Converte web→subdomain em todos os tenants e recomputa contadores.
//
// Idempotente: rodar de novo não faz nada (não sobram 'web').
//   node scripts/migrate-web-to-subdomain.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const mongoose = require('mongoose')

async function run() {
  await mongoose.connect(process.env.MONGO_URI)
  const client = mongoose.connection.getClient()
  const { databases } = await client.db().admin().listDatabases()

  let totalConverted = 0, totalDomains = 0
  for (const d of databases) {
    if (['admin', 'local', 'config'].includes(d.name)) continue
    const db = client.db(d.name)
    const cols = (await db.listCollections().toArray()).map((c) => c.name)
    if (!cols.includes('domainassets')) continue

    // 1) web → subdomain
    const res = await db.collection('domainassets').updateMany({ type: 'web' }, { $set: { type: 'subdomain' } })
    if (!res.modifiedCount) { continue }
    totalConverted += res.modifiedCount

    // 2) recomputa contadores dos domínios afetados (todos, por simplicidade)
    const domains = await db.collection('domains').find({}).toArray()
    for (const dom of domains) {
      const assets = await db.collection('domainassets').find({ domainId: dom._id }).toArray()
      const subs = assets.filter((a) => a.type === 'subdomain')
      const webAlive = subs.filter((a) => a.alive).length
      await db.collection('domains').updateOne({ _id: dom._id }, { $set: {
        assetCount: assets.length,
        subdomainCount: subs.length,
        webAliveCount: webAlive,
        aliveCount: webAlive,
        portCount: assets.filter((a) => a.type === 'port').length,
        exposureCount: assets.filter((a) => a.type === 'exposure').length,
      } })
      totalDomains++
    }
    console.log(`[${d.name}] convertidos ${res.modifiedCount} assets web→subdomain, ${domains.length} domínios recomputados`)
  }
  console.log(`\n✓ total: ${totalConverted} assets convertidos, ${totalDomains} domínios recomputados`)
  await mongoose.disconnect()
}
run().catch((e) => { console.error('ERRO:', e.message); process.exit(1) })
