/**
 * Import myakdmi findings (YAML format) into MongoDB
 * Run: node backend/scripts/import-myakdmi.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

const Engagement = require('../src/models/Engagement')
const Finding = require('../src/models/Finding')

const FRAMEWORK_PATH = process.env.FRAMEWORK_PATH || '/home/digitalbath/pentest-framework-v2'
const FINDINGS_DIR = path.join(FRAMEWORK_PATH, 'clients', 'myakdmi', '2026-05-22', 'findings')

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rift')
  console.log('[import-myakdmi] conectado ao MongoDB')

  // Find the myakdmi engagement
  const eng = await Engagement.findOne({
    $or: [
      { slug: 'myakdmi' },
      { target: /myakdmi/i },
      { name: /myakdmi/i },
    ]
  }).lean()

  if (!eng) {
    console.error('[import-myakdmi] ❌ Engagement myakdmi não encontrado no MongoDB')
    console.log('Engagements disponíveis:')
    const all = await Engagement.find({}, { name: 1, slug: 1, target: 1, date: 1 }).lean()
    all.forEach(e => console.log(`  - ${e.name} | slug=${e.slug} | date=${e.date} | id=${e._id}`))
    await mongoose.disconnect()
    process.exit(1)
  }

  console.log(`[import-myakdmi] ✓ Engagement encontrado: ${eng.name} (${eng._id})`)

  // List YAML files
  const files = fs.readdirSync(FINDINGS_DIR).filter(f => /\.(yaml|yml|json)$/.test(f))
  console.log(`[import-myakdmi] ${files.length} findings encontrados em ${FINDINGS_DIR}`)

  let imported = 0
  let skipped = 0

  for (const file of files) {
    const filePath = path.join(FINDINGS_DIR, file)
    try {
      const raw = fs.readFileSync(filePath, 'utf8')
      const finding = yaml.load(raw)

      if (!finding || !finding.title) {
        console.warn(`  [skip] ${file} — sem título`)
        skipped++
        continue
      }

      await Finding.findOneAndUpdate(
        { engagementId: eng._id.toString(), sourceFile: filePath },
        {
          engagementId:   eng._id.toString(),
          engagementName: eng.name,
          severity:       (finding.severity || 'info').toLowerCase(),
          title:          finding.title,
          type:           finding.type || null,
          location:       finding.location || finding.endpoint || null,
          description:    finding.description || null,
          evidence:       finding.evidence || null,
          impact:         finding.impact || null,
          recommendation: finding.recommendation || finding.remediation || null,
          cvss:           finding.cvss ? parseFloat(finding.cvss) : null,
          confirmed:      finding.confirmed !== undefined ? Boolean(finding.confirmed) : true,
          sourceFile:     filePath,
        },
        { upsert: true, new: true }
      )

      console.log(`  ✓ ${finding.id || file} — ${finding.title} (${finding.severity})`)
      imported++
    } catch (e) {
      console.warn(`  [error] ${file}: ${e.message}`)
      skipped++
    }
  }

  // Update findingsCount on the engagement
  await Engagement.findByIdAndUpdate(eng._id, { findingsCount: imported })

  await mongoose.disconnect()
  console.log(`\n[import-myakdmi] ✅ concluído — ${imported} importados, ${skipped} ignorados`)
}

main().catch(err => {
  console.error('[import-myakdmi] erro:', err.message)
  process.exit(1)
})
