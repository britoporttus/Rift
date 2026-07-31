// Storage de screenshots do recon visual (Fase 4). O httpx (-ss) captura os PNGs;
// este módulo cuida de ONDE eles ficam e de servi-los com segurança.
//
// Local: <backend>/.asm-data/screenshots/<domainId>/<host>.png (gitignored). O
// deploy faz `git reset --hard`, que NÃO toca arquivos ignorados → screenshots
// sobrevivem a deploy; num checkout novo simplesmente são regerados no próximo scan.
//
// Helpers de caminho são PUROS/testáveis (sanitização + guard de path traversal);
// a captura em si (storeScreenshot) faz I/O de arquivo.
const os = require('os')
const fs = require('fs')
const path = require('path')

const SCREENSHOT_DIR = process.env.ASM_SCREENSHOT_DIR
  || path.join(__dirname, '..', '..', '.asm-data', 'screenshots')

// Candidatos de binário do Chrome/Chromium para o -system-chrome do httpx.
const CHROME_CANDIDATES = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']
function findChrome() {
  for (const c of CHROME_CANDIDATES) { try { if (fs.existsSync(c)) return c } catch {} }
  return null
}

// Nome de arquivo seguro a partir de um host: só [a-z0-9._-], resto vira '_'. Evita
// separadores/'..' e qualquer coisa que escape do diretório do domínio.
function sanitizeName(host) {
  const base = String(host || '').toLowerCase().replace(/[^a-z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 120)
  return base || 'host'
}

// Caminho relativo canônico armazenado no asset: "<domainId>/<host>.png".
function relPathFor(domainId, host) {
  return `${sanitizeName(domainId)}/${sanitizeName(host)}.png`
}

// Resolve um relPath para caminho absoluto DENTRO de SCREENSHOT_DIR. Retorna null
// se escapar da raiz (defesa contra path traversal vindo do parâmetro da rota).
function absFor(relPath) {
  if (!relPath || typeof relPath !== 'string') return null
  const abs = path.resolve(SCREENSHOT_DIR, relPath)
  const root = path.resolve(SCREENSHOT_DIR)
  if (abs !== root && !abs.startsWith(root + path.sep)) return null
  return abs
}

// Move/copia um PNG já capturado (srcAbs, no dir temporário do httpx) para o
// storage permanente. Retorna o relPath a persistir no asset, ou null se falhar.
function storeScreenshot(domainId, host, srcAbs) {
  try {
    if (!srcAbs || !fs.existsSync(srcAbs)) return null
    const rel = relPathFor(domainId, host)
    const dest = absFor(rel)
    if (!dest) return null
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(srcAbs, dest)
    return rel
  } catch { return null }
}

// Diretório temporário isolado para uma rodada de captura do httpx.
function makeWorkDir(domainId) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `rift-ss-${sanitizeName(domainId)}-`))
}

module.exports = { SCREENSHOT_DIR, findChrome, sanitizeName, relPathFor, absFor, storeScreenshot, makeWorkDir }
