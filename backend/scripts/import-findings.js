/**
 * Import all findings from pentest-framework-v2 into MongoDB
 * Run: node backend/scripts/import-findings.js
 * Safe to re-run — clears and re-imports findings per engagement
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')
const { v4: uuid } = require('uuid')

const Engagement = require('../src/models/Engagement')
const Finding = require('../src/models/Finding')

const FRAMEWORK_PATH = process.env.FRAMEWORK_PATH || '/home/digitalbath/pentest-framework-v2'
const CLIENTS_DIR = path.join(FRAMEWORK_PATH, 'clients')

// ── Markdown parser — handles 3 formats found in the codebase ─────────────────
function section(text, ...headers) {
  for (const h of headers) {
    // ## Header\nvalue  OR  ## Header: value  OR  **Header:** value
    const re1 = new RegExp(`##\\s+${h}\\s*:\\s*([^\\n]+)`, 'i')
    const re2 = new RegExp(`##\\s+${h}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|\\*\\*\\w|$)`, 'i')
    const re3 = new RegExp(`\\*\\*${h}:\\*\\*\\s*([^\\n]+)`, 'i')
    let m = text.match(re1) || text.match(re3)
    if (m) return m[1].trim()
    m = text.match(re2)
    if (m) return m[1].trim() || null
  }
  return null
}

function parseSeverity(text) {
  const raw = section(text, 'Severity', 'Severidade') || ''
  const w = raw.toLowerCase().replace(/[^a-z]/g, '')
  if (w.includes('critical') || w.includes('critico')) return 'critical'
  if (w.includes('high') || w.includes('alto')) return 'high'
  if (w.includes('medium') || w.includes('medio') || w.includes('médio')) return 'medium'
  if (w.includes('low') || w.includes('baixo')) return 'low'
  return 'info'
}

function parseCvss(text) {
  // **CVSS:** 7.5 (...)  OR  CVSS:3.1/... = **5.3 OR  ## CVSS\n7.5
  const patterns = [
    /\*\*CVSS[^*]*\*\*\s*[:\-]?\s*([\d.]+)/i,
    /CVSS[:\s]+[\w.\/]+\s*[=→]\s*\*?\*?([\d.]+)/i,
    /##\s+CVSS\s*\n\s*([\d.]+)/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) { const v = parseFloat(m[1]); if (v > 0 && v <= 10) return v }
  }
  return null
}

function parseTitle(text, filename) {
  const firstLine = text.trim().split('\n')[0].replace(/^#+\s*/, '').trim()
  // Strip "Finding 001: ", "FINDING-001: ", "Finding N: " prefixes
  return firstLine.replace(/^(?:FINDING|Finding)\s*[-\d]+[:\s]+/i, '').trim() || filename
}

function parseFinding(filepath) {
  const text = fs.readFileSync(filepath, 'utf8')
  const filename = path.basename(filepath, '.md')

  // Confirmed flag — look for "## Confirmed" section or "Status: Confirmed"
  const confirmed = /##\s+Confirmed\b|\bStatus:\s+Confirmed\b|confirmed\s*$/im.test(text)

  // Phase
  const phaseMatch = text.match(/##\s+Phase\s*\n\s*(\d+)/i)
  const phase = phaseMatch ? parseInt(phaseMatch[1]) : null

  return {
    title:          parseTitle(text, filename),
    severity:       parseSeverity(text),
    cvss:           parseCvss(text),
    type:           section(text, 'Type', 'Tipo', 'Category', 'Categoria') || null,
    location:       section(text, 'Location', 'Localização', 'Affected Endpoints', 'URL') || null,
    parameter:      section(text, 'Parameter', 'Parâmetro') || null,
    payload:        section(text, 'Payload') || null,
    description:    section(text, 'Description', 'Descrição') || section(text, 'Impact', 'Impacto') || null,
    evidence:       section(text, 'Evidence', 'Evidência', 'Proof of Concept', 'PoC') || null,
    impact:         section(text, 'Impact', 'Impacto') || null,
    recommendation: section(text, 'Recommendation', 'Recommendations', 'Remediation', 'Remediação') || null,
    confirmed,
    phase,
    sourceFile: path.relative(CLIENTS_DIR, filepath),
  }
}

// ── Known engagement mappings (client-dir → Rift engagement data) ─────────────
const ENGAGEMENT_DEFS = {
  'dvwa/20260416-localhost':              { name: 'DVWA',                target: 'localhost:8080',         status: 'completed' },
  'gds4u/20260420':                       { name: 'GDS4U',               target: 'gds4u.com',              status: 'completed' },
  'grcbuilder/20260520':                  { name: 'GRC Builder',         target: 'api.grcbuilder.tmp.br',  status: 'completed' },
  'juice-shop/20260416-localhost':        { name: 'Juice Shop',          target: 'localhost:3000',         status: 'completed' },
  'lorenipsun.dev.br/20260418-lorenipsun':{ name: 'LorenIpsum',          target: 'lorenipsun.dev.br',      status: 'completed' },
  'portus.com/20260417-trustsis':         { name: 'Portus (TrustSis)',   target: 'portus.com',             status: 'completed' },
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rift')
  console.log('[import-findings] conectado ao MongoDB')

  let totalFindings = 0
  let totalEngagements = 0

  for (const [key, def] of Object.entries(ENGAGEMENT_DEFS)) {
    const [clientSlug, date] = key.split('/')
    const findingsDir = path.join(CLIENTS_DIR, clientSlug, date, 'findings')
    if (!fs.existsSync(findingsDir)) { console.log(`  [skip] ${key} — sem pasta findings`); continue }

    const mdFiles = fs.readdirSync(findingsDir).filter(f => f.endsWith('.md'))
    if (!mdFiles.length) { console.log(`  [skip] ${key} — 0 .md files`); continue }

    // Find or create engagement
    let eng = await Engagement.findOne({ slug: clientSlug, date }).lean()
    if (!eng) {
      const slug = clientSlug
      const now = new Date()
      eng = await Engagement.findByIdAndUpdate(
        uuid(),
        {
          name: def.name, target: def.target, slug, date,
          scope: {}, status: def.status, phase: 'recon',
          progress: 100, findingsCount: mdFiles.length,
          createdAt: now, updatedAt: now,
        },
        { upsert: true, new: true }
      ).lean()
      console.log(`  [new engagement] ${def.name} (${eng._id})`)
      totalEngagements++
    } else {
      // Update findingsCount
      await Engagement.findByIdAndUpdate(eng._id, { findingsCount: mdFiles.length })
    }

    // Clear existing findings for this engagement and re-import
    await Finding.deleteMany({ engagementId: eng._id })

    let count = 0
    for (const f of mdFiles) {
      try {
        const data = parseFinding(path.join(findingsDir, f))
        await Finding.create({ ...data, engagementId: eng._id, engagementName: def.name })
        count++
      } catch (e) {
        console.warn(`    [warn] falha ao parsear ${f}: ${e.message}`)
      }
    }

    console.log(`  [ok] ${def.name}: ${count}/${mdFiles.length} findings importados`)
    totalFindings += count
  }

  await mongoose.disconnect()
  console.log(`\n[import-findings] concluído — ${totalFindings} findings, ${totalEngagements} novos engagements`)
}

main().catch(err => { console.error('[import-findings] erro:', err.message); process.exit(1) })
