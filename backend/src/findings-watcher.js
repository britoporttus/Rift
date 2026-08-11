const chokidar = require('chokidar')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const yaml = require('js-yaml')
const { updateEngagement, countFindings } = require('./store')
const { getFramework, resolveFindingsDirs } = require('./frameworks')
const { reingestTransition } = require('./finding-lifecycle')

// BUG-3: notifier GLOBAL para broadcast ao vivo (setado 1x pelo server). Antes o
// broadcast vinha de um callback do PRIMEIRO a abrir o watcher — se o scheduler
// abrisse antes da conexão WS, o feed do operador nunca ligava. Agora a contagem
// é feita dentro do watcher e o broadcast passa por este notifier único.
let notifier = null
function setNotifier(fn) { notifier = fn }

// Extensões que podem conter um finding. Guarda contra ler binários (a pasta
// evidence/ da v3 tem screenshots/saídas cruas) e contra parse desnecessário.
const FINDING_EXTS = ['.yaml', '.yml', '.json', '.md']

const VALID_STATES = ['confirmed', 'probable', 'informational', 'false_positive']

// framework pode chegar como objeto (do registro) OU id (string) OU nada.
function normalizeFramework(framework) {
  if (framework && typeof framework === 'object' && framework.findingsDirs) return framework
  return getFramework(typeof framework === 'string' ? framework : framework?.id)
}

// Parser de findings em Markdown. Cobre DOIS formatos:
//   (a) v2/genérico: título em `# Heading` + `**Severity:** high`
//   (b) legacy (cursor): bloco `=== FINDING [STATE] ===` com chaves PLANAS
//       (`Severity:`, `Title:`, `Type:`, `Endpoint:`, `Evidence:`, `Impact:`,
//       `Recommendation:`). Sem cobrir (b), TODO finding do agente legacy era
//       descartado silenciosamente (não tem `#` nem `**Severity**`).
// Retorna um objeto-finding (mesma forma do YAML) ou null se não parecer finding.
function parseMarkdownFinding(raw, fallbackId) {
  // `Chave: valor` tolerante a markdown bold (**Chave:** valor), hífen de lista e
  // blockquote. Remove asteriscos residuais do início/fim do valor (bold de fechamento).
  const field = (key) => {
    const m = raw.match(new RegExp('^[\\s\\-*>]*(?:\\*\\*)?' + key + '\\s*(?:\\*\\*)?\\s*[:\\-]\\s*(.+?)\\s*$', 'im'))
    return m ? m[1].replace(/^\**\s*/, '').replace(/\s*\**$/, '').trim() : null
  }
  const heading = raw.match(/^#\s+(?:Finding\s+[\w-]+:\s*)?(.+)$/m)
  const title = field('Title') || (heading ? heading[1].trim() : null)
  if (!title) return null   // sem título reconhecível → não dá pra criar finding
  const severity = field('Severity')
  const stateTok = (raw.match(/===\s*FINDING\s*\[([A-Za-z_]+)\]/i) || [])[1]
  return {
    id:             fallbackId,
    title,
    severity:       severity ? severity.toLowerCase() : undefined,
    type:           field('Type') || null,
    location:       field('Endpoint') || field('Location') || field('URL') || null,
    parameter:      field('Parameter') || null,
    payload:        field('Payload') || null,
    evidence:       field('Evidence') || null,
    impact:         field('Impact') || null,
    recommendation: field('Recommendation') || field('Remediation') || null,
    description:    field('Description') || raw.slice(0, 800),
    state:          stateTok ? stateTok.toLowerCase() : undefined,
  }
}

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

async function persistFinding(db, engagementId, engagementName, finding, sourceFile) {
  try {
    const state = deriveState(finding)
    const fingerprint = computeFingerprint(finding)
    // Coerção defensiva: domain packs (ex.: Azure) gravam campos ricos como OBJETO/array
    // (location: {tenant_id, app_id,…}, evidence: {...}), mas o schema Finding tipa esses
    // campos como String → Mongoose dava "Cast to string failed" e DESCARTAVA o finding
    // inteiro. Serializa objeto/array para string; string/número passam direto.
    const str = (v) => v == null ? null
      : (typeof v === 'string' ? v
      : (typeof v === 'object' ? JSON.stringify(v) : String(v)))
    // Ciclo de vida (Fase 5): o OPERADOR é dono do `remediationStatus`, `owner`,
    // `dueDate` e `statusHistory`. O watcher relata o que o SCANNER vê — nunca
    // sobrescreve a decisão humana. Regra que não pode quebrar: um achado marcado
    // "corrigido"/"aceito" NÃO pode ser ressuscitado por um re-scan. Antes o
    // `$set: remediationStatus` resetava para 'open' toda re-varredura.
    const existing = await db.Finding.findOne({ engagementId, sourceFile })
      .select('remediationStatus').lean()
    // Regra de re-ingestão (finding-lifecycle.js, testado): operador é dono do
    // estado; fixed→regressed quando o scanner volta a ver; o resto mantém.
    const { status: remediationStatus, historyEntry } =
      reingestTransition(existing?.remediationStatus, new Date(), finding.remediation_status)

    const setFields = {
      engagementId,
      engagementName: engagementName || engagementId,
      severity:       (finding.severity || 'info').toLowerCase(),
      title:          str(finding.title) || 'Finding sem título',
      type:           str(finding.type),
      location:       str(finding.location || finding.endpoint),
      parameter:      str(finding.parameter),
      payload:        str(finding.payload),
      description:    str(finding.description),
      evidence:       str(finding.evidence),
      impact:         str(finding.impact),
      recommendation: str(finding.recommendation || finding.remediation),
      cvss:           finding.cvss ? parseFloat(finding.cvss) : null,
      confirmed:      state === 'confirmed',
      sourceFile,
      state,
      confidence:     (finding.confidence || 'medium').toLowerCase(),
      reproducible:   finding.reproducible !== undefined ? Boolean(finding.reproducible) : null,
      poc:            str(finding.poc),
      needsToConfirm: str(finding.needs_to_confirm),
      ruledOutReason: str(finding.ruled_out_reason),
      cvssVector:     str(finding.cvss_vector),
      owasp:          str(finding.owasp),
      owaspApi:       str(finding.owasp_api),
      cwe:            str(finding.cwe),
      mitre:          str(finding.mitre),
      discoveredBy:   str(finding.discovered_by),
      fingerprint,
      remediationStatus,           // computado acima — respeita o operador
      lastSeen:          finding.last_seen || null,
    }
    const update = {
      $set: setFields,
      $setOnInsert: { firstSeen: finding.first_seen || finding.last_seen || null },
    }
    if (historyEntry) update.$push = { statusHistory: historyEntry }

    await db.Finding.findOneAndUpdate(
      { engagementId, sourceFile }, update,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    console.log(`[watcher] finding persistido [${state}]: ${finding.title}`)
  } catch (e) {
    console.error('[watcher] erro ao persistir finding no MongoDB:', e.message)
  }
}

// framework = objeto do registro (ou id) da versão do agente deste engagement.
// target é usado só pelo dir de fallback do legacy (results/{target}_{date}/findings).
function watch(db, engagementId, slug, dateStr, engagementName, framework, target) {
  const fw = normalizeFramework(framework)
  const existing = watchers.get(engagementId)
  if (existing) {
    // Já observando: se é a MESMA versão, no-op. Se o operador trocou a versão
    // (seletor A/B/C), re-aponta para os dirs da nova versão — senão os findings
    // dela nunca apareceriam (o watch ficaria preso nos dirs da versão anterior).
    if (existing.frameworkId === fw.id) return
    try { existing.watcher.close() } catch {}
    watchers.delete(engagementId)
  }

  // Dirs onde ESTA versão pode gravar findings, escopados por engagement (nunca a
  // raiz de clients/ — senão varreria o histórico antigo das cópias).
  const dirs = resolveFindingsDirs(fw, slug, dateStr, target)
  for (const d of dirs) { try { fs.mkdirSync(d, { recursive: true }) } catch {} }

  // Processa um arquivo de finding. isNew = evento 'add' (vs 'change').
  async function handleFile(filePath, isNew) {
    try {
      const ext = path.extname(filePath).toLowerCase()
      // Só arquivos que podem ser finding — evita ler binários (evidence/ da v3).
      if (!FINDING_EXTS.includes(ext)) return
      const raw = fs.readFileSync(filePath, 'utf-8')

      let finding
      if (ext === '.yaml' || ext === '.yml') {
        finding = yaml.load(raw)
      } else if (ext === '.json') {
        finding = JSON.parse(raw)
      } else {
        // .md: cobre tanto o formato v2/genérico quanto o legacy (=== FINDING ===).
        finding = parseMarkdownFinding(raw, path.basename(filePath, ext))
        if (!finding) return // não parece finding, skip
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
      // Persiste sempre (add e change): upsert por sourceFile é idempotente e
      // atualiza campos em re-scan (last_seen, remediation_status, etc.).
      await persistFinding(db, engagementId, engagementName, finding, filePath)

      // REL-4/BUG-3: contagem real (idempotente) feita AQUI — vale para scan
      // agendado e para conexão WS, sem depender de callback do chamador.
      try { await updateEngagement(engagementId, { findingsCount: await countFindings(db, engagementId) }) } catch {}

      // Broadcast ao vivo (via notifier global): só findings NOVOS, não-false_positive, uma vez.
      const bkey = `${engagementId}::${filePath}`
      if (isNew && state !== 'false_positive' && !broadcasted.has(bkey)) {
        broadcasted.add(bkey)
        if (notifier) notifier(engagementId, event)
      }
    } catch (e) {
      console.error('[watcher] erro ao processar finding:', filePath, e.message)
    }
  }

  // REL-4: awaitWriteFinish evita ler um YAML escrito pela metade (o parse falha
  // e o finding se perde). Handler 'change' reprocessa quando o arquivo é
  // atualizado. ignoreInitial:false → arquivos existentes são pegos ao iniciar.
  const watcher = chokidar.watch(dirs, {
    ignoreInitial: false,
    persistent: true,
    // Não observa arquivos que não são finding (screenshots/saída crua da v3).
    // Dirs têm extname '' → não são ignorados → a árvore é percorrida normalmente.
    ignored: (p) => {
      const e = path.extname(p).toLowerCase()
      return !!e && !FINDING_EXTS.includes(e)
    },
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  })
  watcher.on('add',    (fp) => handleFile(fp, true))
  watcher.on('change', (fp) => handleFile(fp, false))

  watchers.set(engagementId, { watcher, frameworkId: fw.id })
  console.log(`[watcher] observando (${fw.id}): ${dirs.join(' | ')}`)
}

// P1-26 (auditoria 2026-07-20): remove do Set `broadcasted` toda chave deste
// engagement (`${engagementId}::${filePath}`) — sem isto, o Set cresce pra
// sempre em um processo de longa duração (nunca é limpo, nem no unwatch nem na
// exclusão do engagement), um memory leak lento.
function clearBroadcasted(engagementId) {
  const prefix = `${engagementId}::`
  for (const key of broadcasted) {
    if (key.startsWith(prefix)) broadcasted.delete(key)
  }
}

function unwatch(engagementId) {
  const w = watchers.get(engagementId)
  if (w) { try { w.watcher.close() } catch {}; watchers.delete(engagementId) }
  clearBroadcasted(engagementId)
}

// REL-2: fecha todos os watchers no shutdown gracioso.
function closeAll() {
  for (const [, w] of watchers) { try { w.watcher.close() } catch {} }
  watchers.clear()
  broadcasted.clear()
}

module.exports = { watch, unwatch, closeAll, setNotifier, deriveState, computeFingerprint, parseMarkdownFinding, broadcasted, clearBroadcasted }
