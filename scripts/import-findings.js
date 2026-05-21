#!/usr/bin/env node
// Converte findings .md do framework para .json enriquecidos (type, instances, cwe, owasp)
const fs = require('fs')
const path = require('path')

const FRAMEWORK = '/home/digitalbath/pentest-framework-v2/clients'

const TARGETS = [
  ['juice-shop',  '20260416-localhost'],
  ['grcbuilder',  '20260520'],
  ['lorenipsun.dev.br', '20260418-lorenipsun'],
]

function parseSeverity(text) {
  const m = text.match(/\b(critical|high|medium|low|info)\b/i)
  return m ? m[1].toLowerCase() : 'info'
}
function parseCvss(text) {
  const m = text.match(/CVSS[:\s v3.1]*([0-9]+\.?[0-9]*)/i)
  return m ? parseFloat(m[1]) : null
}
function parseTitle(text) {
  const m = text.match(/^#\s+(?:Finding\s+\d+[:\-]\s*)?(.+)/m)
  return m ? m[1].trim() : 'Finding'
}
function parseCwe(text) {
  const m = text.match(/CWE[- ](\d+)/i)
  return m ? `CWE-${m[1]}` : null
}
function parseOwasp(text) {
  const m = text.match(/OWASP\s+(A\d{2}:\d{4}[^\n—–-]*)/i)
  return m ? m[1].trim().replace(/[—–-].*/, '').trim() : null
}
function parseDescription(text) {
  const m = text.match(/##\s+Description\s*\n+([\s\S]+?)(?=\n##|\Z)/i)
  return m ? m[1].trim().slice(0, 1200) : ''
}
function parseSolution(text) {
  const m = text.match(/##\s+(?:Remediation|Solution|Fix)\s*\n+([\s\S]+?)(?=\n##|\Z)/i)
  return m ? m[1].trim().slice(0, 800) : ''
}

function extractInstances(text) {
  const pocSection = text.match(/##\s+(?:Proof of Concept|Evidence|Affected Endpoint)\s*\n+([\s\S]+?)(?=\n##|\Z)/i)
  const src = pocSection ? pocSection[1] : text

  // Named HTTP requests: "GET /rest/user/login" or "POST https://..."
  const reqs = []
  const httpPat = /\b(GET|POST|PUT|DELETE|PATCH|HEAD)\s+(https?:\/\/[^\s\n`'"]+|\/[^\s\n`'"]*)/g
  let m
  while ((m = httpPat.exec(src)) !== null) {
    const uri = m[2].replace(/[.,;)'"`]+$/, '')
    const evidence = extractEvidence(text, uri)
    reqs.push({ method: m[1], uri, evidence })
  }
  if (reqs.length) return reqs.slice(0, 6)

  // Bare URLs
  const urlPat = /https?:\/\/[^\s\n`'"<>)]+/g
  const urls = []
  while ((m = urlPat.exec(src)) !== null) {
    const uri = m[0].replace(/[.,;)'"`]+$/, '')
    urls.push({ method: 'GET', uri, evidence: '' })
  }
  return urls.slice(0, 6)
}

function extractEvidence(text, uri) {
  // Try to find a response/evidence line near the URL
  const escaped = uri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = text.match(new RegExp(escaped + '[\\s\\S]{0,200}?(→|=>|\\d{3} OK|response[:\\s])([^\n]+)', 'i'))
  if (m) return m[2].trim().slice(0, 100)
  return ''
}

// Classify finding type based on title + content + severity
function classifyType(title, text, severity) {
  const t = (title + ' ' + text).toLowerCase()

  // Informational observations
  if (severity === 'info') return 'observation'
  const obsKw = ['robots.txt', 'version disclosure', 'security question', 'suspicious comment',
    'timestamp disclosure', 'modern web application', 'no impact', 'informational',
    'nosql analysis', 'summary']
  if (severity === 'low' && obsKw.some(k => t.includes(k))) return 'observation'
  if (obsKw.slice(0, 2).some(k => t.includes(k))) return 'observation'

  // Confirmed vulnerabilities (actively exploited)
  const vulnKw = ['sql injection', 'idor', 'authentication bypass', 'auth bypass',
    'mass assignment', 'business logic', 'ftp directory listing', 'track order',
    'product creation without', 'rce', 'remote code execution', 'command injection',
    'path traversal', 'ssrf', 'xxe', 'nosql injection', 'ldap injection', 'broken access']
  if (vulnKw.some(k => t.includes(k))) return 'vulnerability'
  if (severity === 'critical') return 'vulnerability'
  if (severity === 'high' && t.includes('confirmed')) return 'vulnerability'

  // Everything else is a weakness (missing header, config issue, weak policy)
  return 'weakness'
}

let total = 0
for (const [slug, date] of TARGETS) {
  const findingsDir = path.join(FRAMEWORK, slug, date, 'findings')
  if (!fs.existsSync(findingsDir)) { console.log(`[skip] ${slug}/${date}/findings`); continue }

  const mdFiles = fs.readdirSync(findingsDir).filter(f => f.endsWith('.md'))
  console.log(`\n[${slug}/${date}] ${mdFiles.length} findings`)

  for (const f of mdFiles) {
    const id = f.replace('.md', '')
    const jsonPath = path.join(findingsDir, id + '.json')
    const text = fs.readFileSync(path.join(findingsDir, f), 'utf-8')

    const title = parseTitle(text)
    const severity = parseSeverity(text)
    const finding_type = classifyType(title, text, severity)
    const instances = extractInstances(text)

    const finding = {
      id,
      title,
      severity,
      finding_type,
      cvss: parseCvss(text),
      cwe: parseCwe(text),
      owasp: parseOwasp(text),
      description: parseDescription(text),
      solution: parseSolution(text),
      instances,
      source_file: f,
    }

    fs.writeFileSync(jsonPath, JSON.stringify(finding, null, 2))
    const inst = instances.length ? ` [${instances.length} URLs]` : ''
    console.log(`  [${finding_type.padEnd(11)}][${severity.padEnd(8)}] ${title.slice(0, 55)}${inst}`)
    total++
  }
}
console.log(`\n✓ ${total} findings`)
