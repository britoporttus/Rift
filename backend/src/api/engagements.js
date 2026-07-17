const { Router } = require('express')
const { v4: uuid } = require('uuid')
const { requireAuth } = require('../auth')
const { readEngagements, getEngagement, createEngagement, updateEngagement, deleteEngagement } = require('../store')
const ChatMessage = require('../models/ChatMessage')
const ChatSession = require('../models/ChatSession')
const Finding = require('../models/Finding')
const Usage = require('../models/Usage')
const findingsWatcher = require('../findings-watcher')
const scheduler = require('../scheduler')
const { writeEngagementScope } = require('../scope')
const { isValidFrameworkId, getFrameworkPath } = require('../frameworks')
const { isValidDomainPackId, isRunnableDomainPackId, getDomainPack, needsCredentials, validateCredentials } = require('../domain-packs')
const credVault = require('../cred-vault')
const jobs = require('../jobs')

const router = Router()
router.use(requireAuth())

function toDto(e) {
  return { ...e, id: e._id }
}

// Custo ACUMULADO do engagement = soma dos registros de Usage (cada turno do agente
// grava um). O custo mostrado na UI vem daqui (persiste entre reloads); os eventos
// cost_update do WS só somam o turno em andamento por cima deste baseline.
async function costFor(engagementId) {
  const [row] = await Usage.aggregate([
    { $match: { engagementId } },
    { $group: { _id: null, usd: { $sum: '$usd' }, tokens: { $sum: '$tokens' } } },
  ])
  return { costUsd: row?.usd || 0, tokensTotal: row?.tokens || 0 }
}

router.get('/', async (_req, res) => {
  const engs = await readEngagements()
  // Uma agregação só, agrupada por engagement (evita N queries).
  const rows = await Usage.aggregate([
    { $group: { _id: '$engagementId', usd: { $sum: '$usd' }, tokens: { $sum: '$tokens' } } },
  ])
  const byId = Object.fromEntries(rows.map((r) => [String(r._id), r]))
  res.json(engs.map((e) => {
    const u = byId[String(e._id)]
    return { ...toDto(e), costUsd: u?.usd || 0, tokensTotal: u?.tokens || 0 }
  }))
})

router.get('/:id', async (req, res) => {
  const e = await getEngagement(req.params.id)
  if (!e) return res.status(404).json({ error: 'not found' })
  const cost = await costFor(req.params.id)
  res.json({ ...toDto(e), ...cost })
})

router.post('/', async (req, res) => {
  const { name, target, scope, domainPackId } = req.body ?? {}
  // A-INTAKE: nome é opcional (default = alvo). Só o alvo é obrigatório — mesma
  // filosofia da skill pentest-intake ("só o alvo é obrigatório, o resto tem default").
  const finalName = (name && String(name).trim()) || (target && String(target).trim())
  if (!target || !finalName) return res.status(400).json({ error: 'alvo obrigatório' })

  // Domain pack (tipo de teste). Só packs executáveis podem ser escolhidos no intake;
  // um id inválido/planned cai no default 'web' em vez de recusar (intake é permissivo).
  const pack = isRunnableDomainPackId(domainPackId) ? domainPackId : 'web'

  const now = new Date()
  const engagement = await createEngagement({
    _id: uuid(),
    name: finalName,
    target: String(target).trim(),
    domainPackId: pack,
    // scope carrega as respostas do intake guiado (environment, appType, intensity,
    // waf, foco, exclusões, gasto…). Persistido no Mongo e materializado em YAML abaixo.
    scope: scope && typeof scope === 'object' ? scope : {},
    status: 'idle',
    // A-STATE: novo engagement nasce 'idle' — sem run, mostra "Iniciar mapeamento".
    runState: 'idle',
    phase: null,
    progress: 0,
    findingsCount: 0,
    slug: finalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    date: now.toISOString().slice(0, 10),
    createdAt: now,
    updatedAt: now,
  })

  // A-INTAKE-3: materializa scope.yaml + engagement-state.yaml (idle) no framework.
  // Best-effort: uma falha de FS não deve impedir a criação do engagement no Mongo.
  try { writeEngagementScope(engagement, getFrameworkPath(engagement.frameworkId), pack) } catch (err) {
    console.warn('[engagements] falha ao escrever scope do intake:', err?.message)
  }

  res.status(201).json(toDto(engagement))
})

router.patch('/:id', async (req, res) => {
  const allowed = ['name', 'status', 'phase', 'progress', 'findingsCount']
  // target e scope definem a autorização do framework — alterá-los é mudar o escopo.
  // Restrito a admin para evitar que um `user` repontar o engagement para outro alvo.
  const adminOnly = ['target', 'scope']
  const patch = {}
  for (const key of allowed) {
    if (req.body[key] !== undefined) patch[key] = req.body[key]
  }
  // Versão do agente (seletor A/B/C): validado contra o registro; qualquer operador
  // autenticado pode trocar (é escolha de teste, não muda o escopo autorizado).
  if (req.body.frameworkId !== undefined) {
    if (!isValidFrameworkId(req.body.frameworkId)) {
      return res.status(400).json({ error: 'Versão de agente inválida.' })
    }
    patch.frameworkId = req.body.frameworkId
  }
  // Domain pack (módulo de pentest, ETAPA 0). Só permite selecionar packs EXECUTÁVEIS
  // (status 'ready'). azure/ad/sap existem no registro mas estão 'planned' → recusa com
  // mensagem clara em vez de persistir um pack que não roda.
  if (req.body.domainPackId !== undefined) {
    if (!isValidDomainPackId(req.body.domainPackId)) {
      return res.status(400).json({ error: 'Domain pack inválido.' })
    }
    if (!isRunnableDomainPackId(req.body.domainPackId)) {
      const p = getDomainPack(req.body.domainPackId)
      return res.status(400).json({ error: `O domain pack "${p.label}" ainda está em construção (roadmap multi-domínio).` })
    }
    patch.domainPackId = req.body.domainPackId
  }
  if (req.user?.role === 'admin') {
    for (const key of adminOnly) {
      if (req.body[key] !== undefined) patch[key] = req.body[key]
    }
  } else if (adminOnly.some((k) => req.body[k] !== undefined)) {
    return res.status(403).json({ error: 'Apenas administradores podem alterar target/scope' })
  }
  const updated = await updateEngagement(req.params.id, patch)
  if (!updated) return res.status(404).json({ error: 'not found' })
  res.json(toDto(updated))
})

router.delete('/:id', requireAuth(['admin']), async (req, res) => {
  const id = req.params.id
  // BUG-1: para o watcher e apaga TUDO que pertence ao engagement — senão sobram
  // findings órfãos no banco global e um chokidar observando um dir morto.
  try { findingsWatcher.unwatch(id) } catch {}
  await deleteEngagement(id)
  await Promise.all([
    Finding.deleteMany({ engagementId: id }).catch(() => {}),
    ChatMessage.deleteMany({ engagementId: id }).catch(() => {}),
    ChatSession.deleteMany({ engagementId: id }).catch(() => {}),
  ])
  res.status(204).end()
})

// ── Agendamento de scans recorrentes (admin) ───────────────────────────────────
// Agendar execução autônoma do agente é ação de admin (custo + roda sem supervisão).
const FREQ = ['daily', 'weekly']
const PHASES = ['recon', 'recon_enum', 'full']

router.patch('/:id/schedule', requireAuth(['admin']), async (req, res) => {
  const e = await getEngagement(req.params.id)
  if (!e) return res.status(404).json({ error: 'not found' })

  const cur = e.schedule || {}
  const body = req.body ?? {}
  const next = {
    enabled:        typeof body.enabled === 'boolean' ? body.enabled : (cur.enabled || false),
    frequency:      FREQ.includes(body.frequency) ? body.frequency : (cur.frequency || 'weekly'),
    phases:         PHASES.includes(body.phases) ? body.phases : (cur.phases || 'full'),
    autoExploit:    typeof body.autoExploit === 'boolean' ? body.autoExploit : (cur.autoExploit || false),
    costCeilingUsd: typeof body.costCeilingUsd === 'number'
      ? Math.min(Math.max(body.costCeilingUsd, 0.5), 100)
      : (cur.costCeilingUsd ?? 5),
    nextRunAt:      cur.nextRunAt || null,
    lastRunAt:      cur.lastRunAt || null,
    lastRunStatus:  cur.lastRunStatus || null,
  }
  // Ao habilitar pela primeira vez, agenda um scan-base já para o próximo ciclo do agendador.
  if (next.enabled && !next.nextRunAt) next.nextRunAt = new Date()
  if (!next.enabled) next.nextRunAt = null

  const updated = await updateEngagement(req.params.id, { schedule: next })
  res.json(toDto(updated))
})

// Disparo manual imediato (admin) — útil para testar e para um "scan agora".
router.post('/:id/run-now', requireAuth(['admin']), async (req, res) => {
  const e = await getEngagement(req.params.id)
  if (!e) return res.status(404).json({ error: 'not found' })
  // Usa a config de schedule existente (ou defaults seguros) para o run manual.
  const sched = e.schedule && e.schedule.phases ? e.schedule : { phases: 'full', autoExploit: false, costCeilingUsd: 5 }
  scheduler.triggerRun({ ...e, schedule: sched }).catch((err) => console.error('[run-now]', err.message))
  res.status(202).json({ ok: true, message: 'Scan iniciado em background.' })
})

// ── Credenciais efêmeras de pack autenticado (Azure/AD/SAP) ─────────────────────
// Cofre in-memory por-run (src/cred-vault.js): a credencial NÃO é persistida — vive
// só na memória do backend, chaveada por `${engagementId}:${sessionId}`, e é limpa no
// fim do run. Submeter/limpar é ação de admin (dado sensível). Nunca retornamos os
// VALORES — só metadados (describe). Ver docs/ROADMAP-MULTI-DOMINIO.md (ETAPA 1).
// Chave por-ENGAGEMENT (não por-sessão): a credencial é "a do próximo run autenticado
// deste engagement". Evita descasar a chave entre o intake e o run. O server.js usa a
// MESMA chave no gate. Ver src/cred-vault.js e domain-packs (ETAPA 1).
function vaultKey(id) { return `cred:${id}` }

router.post('/:id/credentials', requireAuth(['admin']), async (req, res) => {
  const e = await getEngagement(req.params.id)
  if (!e) return res.status(404).json({ error: 'not found' })
  const pack = getDomainPack(e.domainPackId)
  if (!needsCredentials(pack)) {
    return res.status(400).json({ error: `O domínio "${pack.label}" não usa credenciais.` })
  }
  const creds = req.body?.credentials
  if (!creds || typeof creds !== 'object') return res.status(400).json({ error: 'credentials (objeto) obrigatório' })
  const { ok, missing } = validateCredentials(pack, creds)
  if (!ok) return res.status(400).json({ error: `Campos obrigatórios ausentes: ${missing.join(', ')}` })
  const key = vaultKey(req.params.id)
  credVault.set(key, creds)
  res.status(201).json({ ok: true, ...credVault.describe(key) })   // só metadados
})

router.get('/:id/credentials', async (req, res) => {
  const meta = credVault.describe(vaultKey(req.params.id))
  res.json(meta ? { set: true, ...meta } : { set: false })
})

router.delete('/:id/credentials', requireAuth(['admin']), async (req, res) => {
  credVault.clear(vaultKey(req.params.id))
  res.status(204).end()
})

// ── Messages (filtered by session) ────────────────────────────────────────────
router.get('/:id/messages', async (req, res) => {
  const limit     = Math.min(parseInt(req.query.limit ?? '500'), 1000)
  const sessionId = req.query.sessionId || 'default'
  const msgs = await ChatMessage.find({ engagementId: req.params.id, sessionId })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean()
  res.json(msgs.map((m) => ({ ...m.payload, type: m.type, _dbId: String(m._id) })))
})

// ── Sessions ──────────────────────────────────────────────────────────────────
router.get('/:id/sessions', async (req, res) => {
  const sessions = await ChatSession.find({ engagementId: req.params.id })
    .sort({ lastMessageAt: -1 })
    .lean()

  // Attach message count per session
  const counts = await ChatMessage.aggregate([
    { $match: { engagementId: req.params.id } },
    { $group: { _id: '$sessionId', count: { $sum: 1 } } },
  ])
  const countMap = Object.fromEntries(counts.map(c => [c._id, c.count]))

  const result = sessions.map(s => ({
    id: s._id,
    name: s.name,
    createdAt: s.createdAt,
    lastMessageAt: s.lastMessageAt,
    messageCount: countMap[s._id] ?? 0,
  }))

  // If no sessions exist, return a synthetic default so UI always shows at least one
  if (!result.length) {
    const defaultCount = countMap['default'] ?? 0
    return res.json([{
      id: 'default',
      name: 'Chat',
      createdAt: new Date(0).toISOString(),
      lastMessageAt: new Date(0).toISOString(),
      messageCount: defaultCount,
    }])
  }

  res.json(result)
})

// Jobs/Work deste engagement — histórico de runs com o fluxo de etapas (fases).
router.get('/:id/jobs', async (req, res) => {
  const list = await jobs.listJobs(req.params.id).catch(() => [])
  res.json(list)
})

router.post('/:id/sessions', async (req, res) => {
  const engagement = await getEngagement(req.params.id)
  if (!engagement) return res.status(404).json({ error: 'not found' })

  const name = (req.body?.name || 'Novo chat').trim().slice(0, 80)
  const session = await ChatSession.create({ engagementId: req.params.id, name })
  res.status(201).json({
    id: session._id,
    name: session.name,
    createdAt: session.createdAt,
    lastMessageAt: session.lastMessageAt,
    messageCount: 0,
  })
})

router.patch('/:id/sessions/:sid', async (req, res) => {
  const session = await ChatSession.findOneAndUpdate(
    { _id: req.params.sid, engagementId: req.params.id },
    { name: (req.body?.name || '').trim().slice(0, 80) },
    { new: true }
  ).lean()
  if (!session) return res.status(404).json({ error: 'not found' })
  res.json({ id: session._id, name: session.name })
})

router.delete('/:id/sessions/:sid', async (req, res) => {
  await ChatSession.deleteOne({ _id: req.params.sid, engagementId: req.params.id })
  await ChatMessage.deleteMany({ engagementId: req.params.id, sessionId: req.params.sid })
  res.status(204).end()
})

module.exports = router
