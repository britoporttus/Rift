const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '..', 'data')
const ENGAGEMENTS_FILE = path.join(DATA_DIR, 'engagements.json')
const USAGE_FILE = path.join(DATA_DIR, 'usage.json')

function ensure() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(ENGAGEMENTS_FILE)) fs.writeFileSync(ENGAGEMENTS_FILE, '[]')
  if (!fs.existsSync(USAGE_FILE)) fs.writeFileSync(USAGE_FILE, '[]')
}

function readEngagements() {
  ensure()
  return JSON.parse(fs.readFileSync(ENGAGEMENTS_FILE, 'utf-8'))
}

function writeEngagements(data) {
  ensure()
  fs.writeFileSync(ENGAGEMENTS_FILE, JSON.stringify(data, null, 2))
}

function readUsage() {
  ensure()
  return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf-8'))
}

function appendUsage(entry) {
  const data = readUsage()
  data.push({ ...entry, ts: new Date().toISOString() })
  fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2))
}

module.exports = { readEngagements, writeEngagements, readUsage, appendUsage }
