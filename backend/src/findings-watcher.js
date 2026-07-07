const chokidar = require('chokidar')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const yaml = require('js-yaml')
const Finding = require('./models/Finding')

const FRAMEWORK_PATH = process.env.FRAMEWORK_PATH || '/home/digitalbath/pentest-framework-v2'

const VALID_STATES = ['confirmed', 'probable', 'informational', 'false_positive']

// Deriva o estado de validação respeitando a taxonomia, com retrocompatibilidade:
// findings antigos só têm `confirmed` (bool) — mapeamos para o novo `state`.
function deriveState(finding) {
  const raw = (finding.state || '').toLowerCase()
  if (VALID_STATES.includes(raw)) return raw
  // Sem campo `state`: inferir do esquema antigo
  if (finding.confirmed === true) return 'confirmed'
  const sev = (finding.severity || 'info').toLowerCase()
  if (sev === 'info') return 'informational'
  return 'probable' // não-confirmado, com severidade → indício
}

// Fingerprint estável para diff entre scans (regressão).
function computeFingerprint(finding) {
  if (finding.fingerprint) return finding.fingerprint
  const loc = String(finding.location || finding.endpoint || '')
    .split('?')[0].replace(/\/\d+/g, '/{id}')
  const basis = `${finding.type || ''}|${loc}|${finding.parameter || ''}`
  return crypto.createHash('sha1').update(basis).digest('hex').slice(0, 16)
}

// engagementId -> chokidar.FSWatcher
const watchers = new Map()

// Arquivos já enviados ao feed AO VIVO — evita spam no 'change' e re-broadcast do
// que já existe quando o watcher re-varre no restart. (A persistência no banco é
// idempotente pelo upsert, então não precisa de set próprio.)
const broadcasted = new Set()

async function persistFinding(engagementId, engagementName, finding, sourceFile) {
  try {
    const state = deriveState(finding)
    const fingerprint = computeFingerprint(finding)
    // Upsert by sourceFile so re-running the watcher doesn't create duplicates
    await Finding.findOneAndUpdate(
      { engagementId, sourceFile },
      {
        $set: {
          engagementId,
          engagementName: engagementName || engagementId,
          severity:       (finding.severity || 'info').toLowerCase(),
          title:          finding.title || 'Finding sem título',
          type:           finding.type || null,
          location:       finding.location || finding.endpoint || null,
          parameter:      finding.parameter || null,
          payload:        finding.payload || null,
          description:    finding.description || null,
          evidence:       finding.evidence || null,
          impact:         finding.impact || null,
          recommendation: finding.recommendation || finding.remediation || null,
          cvss:           finding.cvss ? parseFloat(finding.cvss) : null,
          // `confirmed` agora deriva do state — só é true para vulnerabilidade de fato
          confirmed:      state === 'confirmed',
          sourceFile,

          // Taxonomia
          state,
          confidence:     (finding.confidence || 'medium').toLowerCase(),
          reproducible:   finding.reproducible !== undefined ? Boolean(finding.reproducible) : null,
          poc:            finding.poc || null,
          needsToConfirm: finding.needs_to_confirm || null,
          ruledOutReason: finding.ruled_out_reason || null,
          cvssVector:     finding.cvss_vector || null,
          owasp:          finding.owasp || null,
          owaspApi:       finding.owasp_api || null,
          cwe:            finding.cwe || null,
          mitre:          finding.mitre || null,
          discoveredBy:   finding.discovered_by || null,

          // Regressão
          fingerprint,
          remediationStatus: finding.remediation_status || 'open',
          lastSeen:          finding.last_seen || null,
        },
        // first_seen nunca é sobrescrito em re-scan
        $setOnInsert: { firstSeen: finding.first_seen || finding.last_seen || null },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    console.log(`[watcher] finding persistido [${state}]: ${finding.title}`)
  } catch (e) {
    console.error('[watcher] erro ao persistir finding no MongoDB:', e.message)
  }
}

function watch(engagementId, slug, dateStr, onFinding, engagementName) {
  if (watchers.has(engagementId)) return

  const dir = path.join(FRAMEWORK_PATH, 'clients', slug, dateStr, 'findings')
  fs.mkdirSync(dir, { recursive: true })

  // Processa um arquivo de finding. isNew = evento 'add' (vs 'change').
  function handleFile(filePath, isNew) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const ext = path.extname(filePath).toLowerCase()

      let finding
      if (ext === '.yaml' || ext === '.yml') {
        finding = yaml.load(raw)
      } else if (ext === '.json') {
        finding = JSON.parse(raw)
      } else {
        // .md or other: try to extract a minimal finding from front-matter or first line
        const titleMatch = raw.match(/^#\s+(?:Finding\s+\w+:\s*)?(.+)$/m)
        const sevMatch   = raw.match(/\*\*Severity[:\*]+\s*(critical|high|medium|low|info)/i)
        if (!titleMatch) return // can't parse, skip
        finding = {
          title:    titleMatch[1].trim(),
          severity: sevMatch ? sevMatch[1].toLowerCase() : 'info',
          description: raw.slice(0, 800),
        }
      }

      if (!finding || !finding.title) return

      const state = deriveState(finding)

      const event = {
        type:        'finding',
        id:          finding.id || path.basename(filePath, ext),
        state,
        confidence:  (finding.confidence || 'medium').toLowerCase(),
        severity:    (finding.severity || 'info').toLowerCase(),
        title:       finding.title || 'Finding sem título',
        description: finding.description,
        cvss:        finding.cvss,
        evidence:    finding.evidence,
        engagement_id: engagementId,
      }

      // Broadcast ao feed AO VIVO: só findings NOVOS, não-false_positive, uma vez.
      // false_positive é persistido (abaixo) mas não aparece no feed — o
      // remediation-verifier ainda o vê como já descartado.
      const bkey = `${engagementId}::${filePath}`
      if (isNew && state !== 'false_positive' && !broadcasted.has(bkey)) {
        broadcasted.add(bkey)
        onFinding(event)
      }

      // Persiste sempre (add e change): upsert por sourceFile é idempotente e
      // atualiza campos em re-scan (last_seen, remediation_status, etc.).
      persistFinding(engagementId, engagementName, finding, filePath)

    } catch (e) {
      console.error('[watcher] erro ao processar finding:', filePath, e.message)
    }
  }

  // REL-4: awaitWriteFinish evita ler um YAML escrito pela metade (o parse falha
  // e o finding se perde). Handler 'change' reprocessa quando o arquivo é
  // atualizado. ignoreInitial:false → arquivos existentes são pegos ao iniciar.
  const watcher = chokidar.watch(dir, {
    ignoreInitial: false,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  })
  watcher.on('add',    (fp) => handleFile(fp, true))
  watcher.on('change', (fp) => handleFile(fp, false))

  watchers.set(engagementId, watcher)
  console.log(`[watcher] observando ${dir}`)
}

function unwatch(engagementId) {
  const w = watchers.get(engagementId)
  if (w) { w.close(); watchers.delete(engagementId) }
}

// REL-2: fecha todos os watchers no shutdown gracioso.
function closeAll() {
  for (const [, w] of watchers) { try { w.close() } catch {} }
  watchers.clear()
}

module.exports = { watch, unwatch, closeAll, deriveState, computeFingerprint }
