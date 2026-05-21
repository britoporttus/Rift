/**
 * One-time migration: JSON files → MongoDB
 * Run: node backend/scripts/migrate.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

const Engagement = require('../src/models/Engagement')
const Usage = require('../src/models/Usage')

const DATA_DIR = path.join(__dirname, '../data')

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rift')
  console.log('[migrate] conectado ao MongoDB')

  // Engagements
  const engFile = path.join(DATA_DIR, 'engagements.json')
  if (fs.existsSync(engFile)) {
    const raw = JSON.parse(fs.readFileSync(engFile, 'utf8'))
    let imported = 0
    for (const e of raw) {
      const _id = e._id || e.id
      if (!_id) continue
      await Engagement.findByIdAndUpdate(
        _id,
        { ...e, _id },
        { upsert: true, new: true }
      )
      imported++
    }
    console.log(`[migrate] ${imported} engagements importados`)
  }

  // Usage
  const usageFile = path.join(DATA_DIR, 'usage.json')
  if (fs.existsSync(usageFile)) {
    const raw = JSON.parse(fs.readFileSync(usageFile, 'utf8'))
    if (Array.isArray(raw) && raw.length > 0) {
      await Usage.insertMany(raw, { ordered: false }).catch(() => {})
      console.log(`[migrate] ${raw.length} usage entries importadas`)
    }
  }

  await mongoose.disconnect()
  console.log('[migrate] concluído')
}

main().catch((err) => {
  console.error('[migrate] erro:', err.message)
  process.exit(1)
})
