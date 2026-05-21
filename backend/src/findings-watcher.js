const chokidar = require('chokidar')
const path = require('path')
const fs = require('fs')
const yaml = require('js-yaml')

const FRAMEWORK_PATH = process.env.FRAMEWORK_PATH || '/home/digitalbath/pentest-framework-v2'

// engagementId -> chokidar.FSWatcher
const watchers = new Map()

function watch(engagementId, slug, dateStr, onFinding) {
  if (watchers.has(engagementId)) return

  const dir = path.join(FRAMEWORK_PATH, 'clients', slug, dateStr, 'findings')
  fs.mkdirSync(dir, { recursive: true })

  const watcher = chokidar.watch(dir, { ignoreInitial: false, persistent: true })

  watcher.on('add', (filePath) => {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const finding = /\.ya?ml$/.test(filePath) ? yaml.load(raw) : JSON.parse(raw)
      if (!finding) return

      onFinding({
        type: 'finding',
        id: finding.id || path.basename(filePath, path.extname(filePath)),
        severity: (finding.severity || 'info').toLowerCase(),
        title: finding.title || 'Finding sem título',
        description: finding.description,
        cvss: finding.cvss,
        evidence: finding.evidence,
        engagement_id: engagementId,
      })
    } catch (e) {
      console.error('[watcher] erro ao parsear finding:', filePath, e.message)
    }
  })

  watchers.set(engagementId, watcher)
  console.log(`[watcher] observando ${dir}`)
}

function unwatch(engagementId) {
  const w = watchers.get(engagementId)
  if (w) { w.close(); watchers.delete(engagementId) }
}

module.exports = { watch, unwatch }
