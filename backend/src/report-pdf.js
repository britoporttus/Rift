'use strict'
// Converte o HTML do relatório em PDF via Chromium headless (print-to-pdf). Preserva o
// design dark exato (print-color-adjust:exact no CSS). Self-contained: o HTML não tem
// recursos externos, então não precisa de rede.
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const CHROMIUM = process.env.CHROMIUM_PATH || '/usr/bin/chromium'
const PDF_TIMEOUT_MS = Number(process.env.PDF_TIMEOUT_MS) || 60000
// P2-33 (auditoria 2026-07-20): cada chamada a ?format=pdf spawna um Chromium
// completo, sem teto de instâncias simultâneas — qualquer usuário autenticado
// (relatório técnico também gera PDF, não só admin) podia disparar várias em
// paralelo e esgotar CPU/RAM da VPS única.
const MAX_CONCURRENT_PDF = Number(process.env.MAX_CONCURRENT_PDF) || 3
let activePdfCount = 0

class PdfConcurrencyLimitError extends Error {
  constructor() {
    super(`Muitas gerações de PDF em andamento (máx ${MAX_CONCURRENT_PDF} simultâneas) — tente novamente em instantes.`)
    this.code = 'PDF_CONCURRENCY_LIMIT'
  }
}

function htmlToPdf(html) {
  if (activePdfCount >= MAX_CONCURRENT_PDF) {
    return Promise.reject(new PdfConcurrencyLimitError())
  }
  activePdfCount++
  return new Promise((resolveP, rejectP) => {
    const resolve = (v) => { activePdfCount--; resolveP(v) }
    const reject = (e) => { activePdfCount--; rejectP(e) }
    const base = path.join(os.tmpdir(), `rift-report-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`)
    const htmlPath = `${base}.html`
    const pdfPath = `${base}.pdf`
    const userDir = `${base}-udd`
    const cleanup = () => {
      for (const p of [htmlPath, pdfPath]) { try { fs.unlinkSync(p) } catch {} }
      try { fs.rmSync(userDir, { recursive: true, force: true }) } catch {}
    }
    try { fs.writeFileSync(htmlPath, html, 'utf8') } catch (e) { return reject(e) }

    const args = [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--no-pdf-header-footer', '--hide-scrollbars',
      `--user-data-dir=${userDir}`,
      `--print-to-pdf=${pdfPath}`,
      `file://${htmlPath}`,
    ]
    const proc = spawn(CHROMIUM, args, { stdio: 'ignore' })
    const timer = setTimeout(() => { try { proc.kill('SIGKILL') } catch {}; cleanup(); reject(new Error('timeout na geração do PDF')) }, PDF_TIMEOUT_MS)
    if (timer.unref) timer.unref()
    proc.on('error', (e) => { clearTimeout(timer); cleanup(); reject(new Error(`Chromium não pôde ser iniciado (${CHROMIUM}): ${e.message}`)) })
    proc.on('close', (code) => {
      clearTimeout(timer)
      try {
        if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size < 100) {
          throw new Error(`Chromium não gerou o PDF (código ${code})`)
        }
        const buf = fs.readFileSync(pdfPath)
        cleanup()
        resolve(buf)
      } catch (e) { cleanup(); reject(e) }
    })
  })
}

module.exports = { htmlToPdf, PdfConcurrencyLimitError, MAX_CONCURRENT_PDF }
