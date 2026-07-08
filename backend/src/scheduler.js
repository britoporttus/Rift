// Agendador de scans recorrentes — "monitoramento contínuo da superfície de ataque".
// Varre engagements com schedule.enabled e nextRunAt vencido, dispara um run headless
// (sem operador conectado), persiste findings via watcher e respeita o teto de custo.
const Engagement = require('./models/Engagement')
const agentRunner = require('./agent-runner')
const findingsWatcher = require('./findings-watcher')
const { getEngagement, updateEngagement, appendUsage, countFindings } = require('./store')

const CHECK_INTERVAL_MS = 5 * 60 * 1000 // varre a cada 5 min
const FREQUENCY_MS = { daily: 24 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000 }

let timer = null

function deriveEngId2(eng) {
  const slug = eng.slug || eng.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || ''
  const date = eng.date || ''
  return slug && date ? `${slug}-${date.replace(/-/g, '')}` : ''
}

// Monta o prompt do pipeline conforme as fases escolhidas e o gating de exploração.
function buildPipelinePrompt(eng, engId2, schedule) {
  const slug = eng.slug || ''
  const date = eng.date || ''

  const steps = ['/pentest-recon']
  if (schedule.phases === 'recon_enum' || schedule.phases === 'full') steps.push('/pentest-enum')
  if (schedule.phases === 'full') {
    steps.push('/pentest-vuln')
    if (schedule.autoExploit) { steps.push('/pentest-exploit'); steps.push('/pentest-post') }
  }
  steps.push('/pentest-report')

  const gatingRule = schedule.autoExploit
    ? '- Exploração autônoma LIBERADA para este scan agendado.'
    : `- NÃO execute fases agressivas (exploit/post) sem aprovação humana. Ao chegar em um checkpoint crítico (RCE, SQLi, etc.), PARE, registre o achado como "probable" com needs_to_confirm preenchido, e siga para o relatório. Quem aprova exploração é o admin, depois.`

  return `[EXECUÇÃO AGENDADA AUTÔNOMA — SEM OPERADOR CONECTADO]
Engagement: "${eng.name}"
ID do engagement: ${engId2}
Alvo autorizado: ${eng.target} e *.${eng.target}
Diretório de contexto: context/${engId2}/
Escopo em: config/scope.yaml
Findings dir: clients/${slug}/${date}/findings/
Reports dir:  clients/${slug}/${date}/reports/

REGRAS OBRIGATÓRIAS:
- Responda SEMPRE em português brasileiro.
- Opere APENAS sobre o alvo ${eng.target} — qualquer outro alvo está fora de escopo.
- Este é um scan de MONITORAMENTO CONTÍNUO: o objetivo é detectar mudanças na superfície de ataque e regressões de findings já corrigidos.
- Use a ferramenta Write/Edit para salvar arquivos (nunca "cat >"/"tee" via Bash).
${gatingRule}
- Não peça confirmação ao operador (não há ninguém conectado). Execute o fluxo e finalize com o relatório.

TAREFA: execute, em ordem, o fluxo completo e finalize com o relatório:
${steps.join(' → ')}
`
}

async function triggerRun(eng) {
  const engId    = eng._id
  const engId2   = deriveEngId2(eng)
  const schedule = eng.schedule || {}
  const sessionId = `scheduled-${engId}`

  if (agentRunner.isRunning(sessionId)) {
    console.log(`[scheduler] run já em andamento para ${engId}, pulando`)
    return
  }

  console.log(`[scheduler] iniciando scan agendado: ${eng.name} (${schedule.phases}, teto US$ ${schedule.costCeilingUsd})`)
  await updateEngagement(engId, {
    schedule: { ...schedule, lastRunAt: new Date(), lastRunStatus: 'running' },
    status: 'active',
  })

  // Watcher de findings (sem WS): persiste no Mongo e atualiza a contagem
  // internamente (BUG-3). O broadcast ao vivo, se alguém conectar, vai pelo notifier.
  findingsWatcher.watch(engId, eng.slug, eng.date, eng.name)

  const prompt = buildPipelinePrompt(eng, engId2, schedule)
  // Usuário sintético do sistema; role reflete a permissão de exploração autônoma.
  const sysUser = {
    id: 'scheduler', name: 'Agendador Rift', email: 'scheduler@rift',
    role: schedule.autoExploit ? 'admin' : 'user',
  }

  agentRunner.run(
    sessionId, engId2, prompt, new Set(),
    (usd, tokens) => appendUsage({
      usd, tokens, engagementId: engId, engagementName: eng.name,
      userId: 'scheduler', userName: 'Agendador Rift', userEmail: 'scheduler@rift',
      scheduled: true, ts: new Date(),
    }).catch(() => {}),
    null,
    eng,
    sysUser,
    {
      costCeiling: schedule.costCeilingUsd,
      onBudgetExceeded: async () => {
        const cur = await getEngagement(engId)
        await updateEngagement(engId, { schedule: { ...(cur?.schedule || schedule), lastRunStatus: 'budget_exceeded' } })
      },
      onClose: async (code, info) => {
        const cur = await getEngagement(engId)
        const sch = cur?.schedule || schedule
        if (sch.lastRunStatus === 'budget_exceeded') return // já registrado
        await updateEngagement(engId, {
          schedule: { ...sch, lastRunStatus: (code === 0 || info?.budgetExceeded) ? 'completed' : 'error' },
        })
        console.log(`[scheduler] scan de ${eng.name} finalizado (código ${code})`)
      },
    }
  )
}

function nextRunFrom(date, frequency) {
  return new Date(date.getTime() + (FREQUENCY_MS[frequency] || FREQUENCY_MS.weekly))
}

async function tick() {
  try {
    const now = new Date()
    const due = await Engagement.find({ 'schedule.enabled': true }).lean()
    for (const eng of due) {
      const sch = eng.schedule || {}
      const next = sch.nextRunAt ? new Date(sch.nextRunAt) : null
      if (next && next > now) continue // ainda não venceu

      // Reagenda ANTES de disparar (evita re-disparo se o run demorar mais que o intervalo)
      await updateEngagement(eng._id, {
        schedule: { ...sch, nextRunAt: nextRunFrom(now, sch.frequency || 'weekly') },
      })
      await triggerRun(eng).catch((e) => console.error('[scheduler] erro ao disparar run:', e.message))
    }
  } catch (e) {
    console.error('[scheduler] erro no tick:', e.message)
  }
}

function start() {
  if (timer) return
  timer = setInterval(tick, CHECK_INTERVAL_MS)
  console.log(`[scheduler] ativo (varre a cada ${CHECK_INTERVAL_MS / 60000} min)`)
  // primeiro tick logo após o boot
  setTimeout(() => tick(), 15000)
}

function stop() {
  if (timer) { clearInterval(timer); timer = null }
}

module.exports = { start, stop, triggerRun, nextRunFrom }
