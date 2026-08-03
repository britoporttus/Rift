const { Router } = require('express')
const path = require('path')
const fs = require('fs')
const { requireAuth } = require('../auth')
const { tenantScope } = require('../tenancy')
const { getEngagement } = require('../store')
const { getFrameworkPath } = require('../frameworks')
const { renderReport } = require('../report')
const { htmlToPdf, PdfConcurrencyLimitError } = require('../report-pdf')
const { generateExecNarrative } = require('../report-ai')
const { isExecutiveReport } = require('../report-kind')
const { readClientDir } = require('../tenant-paths')
const { planFor } = require('../plans')

const router = Router()
router.use(requireAuth())
// Frente 0: resolve o tenant do usuário e injeta req.db (models ligados ao
// banco DELE). Sem tenant resolvido, nega — nunca segue para os models globais.
router.use(tenantScope())

// Diretório de reports do engagement, na VERSÃO do framework escolhida (seletor A/B/C).
// Antes era um FRAMEWORK_PATH fixo → os relatórios de legacy/v3 (e da cópia v2) nunca
// eram encontrados. Agora resolve pelo frameworkId do engagement.
// Frente 0: o diretório é resolvido sob o tenant. `slug` deriva do NOME do
// engagement, então dois clientes com nomes parecidos caíam na mesma pasta.
// `readClientDir` cai no layout legado para engagements pré-Frente 0.
function reportsDir(e, tenantSlug) {
  return path.join(readClientDir(getFrameworkPath(e.frameworkId), tenantSlug, e.slug, e.date), 'reports')
}

// Relatório executivo (C-level) é restrito a admin pela tabela de ROLES.
// P0-6 (auditoria 2026-07-20): a convenção REAL do framework (ver
// Agentes-Pentest/*/.claude/commands/pentest-report.md) nomeia o C-level como
// `clevel-{date}.md`/`clevel-surface-{date}.md` — sem a substring "exec". A
// P0-6: a classificação saiu daqui para `src/report-kind.js`, agora com
// precedência de diretório (`reports/executive/`) sobre nome e política
// FAIL-CLOSED — nome desconhecido vira executivo (restrito) em vez de técnico
// (visível a qualquer autenticado), que era como o buraco existia.

async function costFor(db, engagementId) {
  const [row] = await db.Usage.aggregate([
    { $match: { engagementId } },
    { $group: { _id: null, usd: { $sum: '$usd' } } },
  ])
  return row?.usd || 0
}

// ── Relatório GERADO pelo Rift a partir dos findings (sempre funciona, bonito) ──────
// type=technical (default) | executive (admin). Renderiza HTML self-contained; seguro
// para embutir inline (template nosso, conteúdo escapado). ?download=1 força baixar.
router.get('/:engagementId/generated', async (req, res) => {
  const e = await getEngagement(req.db, req.params.engagementId)
  if (!e) return res.status(404).json({ error: 'not found' })

  const type = req.query.type === 'executive' ? 'executive' : 'technical'
  if (type === 'executive' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Relatório executivo restrito a administradores' })
  }

  const findings = await req.db.Finding.find({ engagementId: e._id }).lean().catch(() => [])
  const visible = findings.filter((f) => (f.state || '').toLowerCase() !== 'false_positive')
  const costUsd = await costFor(req.db, e._id).catch(() => undefined)
  // Executivo: embute o resumo por IA se já foi gerado (cache). Técnico não usa IA.
  const narrative = type === 'executive'
    ? await req.db.ReportNarrative.findById(e._id).lean().catch(() => null)
    : null
  // Plano free recebe o relatório RESUMIDO (ver src/plans.js): o que foi
  // encontrado e a gravidade, sem o detalhe técnico que é o produto pago.
  const detail = planFor(req.tenant).reportDetail
  const html = renderReport(e, visible, { type, costUsd, narrative, detail })
  const slug = (e.slug || 'engagement')

  // PDF: converte o HTML via Chromium headless (design dark preservado). Sempre attachment.
  if (req.query.format === 'pdf') {
    try {
      const pdf = await htmlToPdf(html)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="rift-${slug}-${type}.pdf"`)
      res.setHeader('X-Content-Type-Options', 'nosniff')
      return res.send(pdf)
    } catch (err) {
      // P2-33: teto de concorrência vira 429 (tente de novo), não 502 (falha real).
      if (err instanceof PdfConcurrencyLimitError) return res.status(429).json({ error: err.message })
      return res.status(502).json({ error: `Falha ao gerar PDF: ${err.message}` })
    }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // CSP permissiva o suficiente para o nosso template (estilos inline), sem scripts.
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:")
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (req.query.download) {
    res.setHeader('Content-Disposition', `attachment; filename="rift-${slug}-${type}.html"`)
  }
  res.send(html)
})

// ── Resumo executivo por IA (opt-in, cacheado) ──────────────────────────────────────
// GET: devolve a narrativa salva (+ se está desatualizada vs findings atuais).
router.get('/:engagementId/narrative', async (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Resumo executivo restrito a administradores' })
  const e = await getEngagement(req.db, req.params.engagementId)
  if (!e) return res.status(404).json({ error: 'not found' })
  const n = await req.db.ReportNarrative.findById(e._id).lean().catch(() => null)
  if (!n) return res.json({ exists: false })
  const current = await req.db.Finding.countDocuments({ engagementId: e._id, state: { $ne: 'false_positive' } }).catch(() => n.findingsCount)
  res.json({ exists: true, ...n, stale: current !== n.findingsCount, currentFindings: current })
})

// POST: GERA (1 passada do modelo sobre os findings) e salva. Admin — é o "executivo".
router.post('/:engagementId/narrative', async (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Resumo executivo restrito a administradores' })
  const e = await getEngagement(req.db, req.params.engagementId)
  if (!e) return res.status(404).json({ error: 'not found' })

  const findings = await req.db.Finding.find({ engagementId: e._id, state: { $ne: 'false_positive' } }).lean().catch(() => [])
  if (!findings.length) return res.status(400).json({ error: 'Sem findings para consolidar.' })

  try {
    const n = await generateExecNarrative(e, findings)
    const doc = await req.db.ReportNarrative.findByIdAndUpdate(
      e._id,
      { $set: { _id: e._id, engagementId: e._id, ...n, findingsCount: findings.length, generatedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean()
    // Contabiliza o custo da geração (transparência no painel admin).
    if (n.costUsd > 0) {
      await req.db.Usage.create({
        usd: n.costUsd, tokens: 0, engagementId: e._id, engagementName: e.name,
        userId: req.user.id, userName: req.user.name, userEmail: req.user.email,
        kind: 'report_narrative', ts: new Date(),
      }).catch(() => {})
    }
    res.json({ ok: true, ...doc })
  } catch (err) {
    res.status(502).json({ error: err.message || 'Falha ao gerar o resumo executivo.' })
  }
})

// ── Arquivos de relatório escritos pelo AGENTE (narrativa) — secundários ────────────
router.get('/:engagementId', async (req, res) => {
  const e = await getEngagement(req.db, req.params.engagementId)
  if (!e) return res.status(404).json({ error: 'not found' })

  const dir = reportsDir(e, req.tenant?.slug)
  if (!fs.existsSync(dir)) return res.json([])

  const isAdmin = req.user?.role === 'admin'
  const files = fs.readdirSync(dir)
    .filter((f) => isAdmin || !isExecutiveReport(f))
    .map((f) => {
      const ext = path.extname(f).toLowerCase()
      const id = e._id
      return {
        name: f,
        url: `/api/reports/${id}/download/${f}`,
        viewUrl: `/api/reports/${id}/view/${f}`,
        size: fs.statSync(path.join(dir, f)).size,
        ext,
      }
    })
  res.json(files)
})

router.get('/:engagementId/view/:filename', async (req, res) => {
  const e = await getEngagement(req.db, req.params.engagementId)
  if (!e) return res.status(404).json({ error: 'not found' })

  const filename = path.basename(req.params.filename)
  if (isExecutiveReport(filename) && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Relatório executivo restrito a administradores' })
  }
  const filePath = path.join(reportsDir(e, req.tenant?.slug), filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file not found' })

  const ext = path.extname(filename).toLowerCase()
  const mime = ext === '.html' ? 'text/html' : ext === '.md' ? 'text/plain' : 'application/octet-stream'
  // Evita XSS: relatórios HTML do AGENTE são tratados como download, não renderizados inline.
  res.setHeader('Content-Type', mime)
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:")
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.sendFile(filePath)
})

router.get('/:engagementId/download/:filename', async (req, res) => {
  const e = await getEngagement(req.db, req.params.engagementId)
  if (!e) return res.status(404).json({ error: 'not found' })

  const filename = path.basename(req.params.filename)
  if (isExecutiveReport(filename) && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Relatório executivo restrito a administradores' })
  }
  const filePath = path.join(reportsDir(e, req.tenant?.slug), filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file not found' })

  res.download(filePath)
})

module.exports = router
module.exports.isExecutiveReport = isExecutiveReport
