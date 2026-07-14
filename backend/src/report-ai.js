'use strict'
// Gera o RESUMO EXECUTIVO por IA a partir dos findings (1 passada do modelo). É a única
// parte do relatório que usa o LLM. Restrito aos findings fornecidos (proibido inventar).
// Reusa o binário/credenciais do Claude CLI (assinatura), sem tools, cwd neutro.
const { spawn } = require('child_process')
const os = require('os')
const { buildAgentEnv, CLAUDE_BIN } = require('./agent-runner')
const { getAgentModel } = require('./settings')

const GEN_TIMEOUT_MS = Number(process.env.REPORT_AI_TIMEOUT_MS) || 120000

// Compacta os findings para o prompt (só o essencial — sem evidência crua, para conter tokens).
function findingsDigest(findings) {
  return findings.slice(0, 120).map((f, i) => {
    const sev = (f.severity || 'info').toLowerCase()
    const st = (f.state || (f.confirmed ? 'confirmed' : 'informational')).toLowerCase()
    const loc = f.location || f.endpoint || ''
    return `${i + 1}. [${sev}/${st}] ${f.title || 'sem título'}${f.type ? ` (${f.type})` : ''}${loc ? ` @ ${loc}` : ''}` +
      (f.impact ? `\n   impacto: ${String(f.impact).slice(0, 240)}` : '')
  }).join('\n')
}

function buildPrompt(engagement, findings) {
  return `Você é um consultor sênior de segurança escrevendo o RESUMO EXECUTIVO (alto nível, para C-level)
de um pentest já concluído. Alvo: ${engagement.target || 'n/d'}. Engagement: ${engagement.name || 'n/d'}.

Abaixo estão TODOS os findings confirmados/prováveis do engagement. Use SOMENTE eles.

REGRAS ESTRITAS:
- NÃO invente vulnerabilidades, hosts, dados ou cadeias que não estejam nos findings.
- Se não houver base para uma cadeia de ataque real, retorne a lista de cadeias vazia.
- Linguagem de negócio (risco, impacto ao negócio), NÃO técnica-profunda. Português brasileiro.
- Seja conciso e honesto. Não infle severidade.

FINDINGS:
${findingsDigest(findings)}

Responda APENAS com um objeto JSON válido (sem texto fora do JSON, sem markdown), no formato:
{
  "summary": "2 a 4 parágrafos de resumo executivo em prosa (postura geral de segurança, principais riscos ao negócio, tom para diretoria)",
  "riskLevel": "critical|high|medium|low|info",
  "attackChains": ["cada item: uma cadeia plausível conectando findings REAIS, ex: 'Exposição de Tenant ID (F-x) + ausência de PKCE (F-y) → risco de phishing OAuth direcionado'"],
  "recommendations": ["3 a 6 prioridades de remediação em ordem de importância, linguagem executiva"]
}`
}

// Extrai o primeiro objeto JSON de um texto (tolerante a cercas ```json e prosa ao redor).
function extractJson(text) {
  if (!text) return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try { return JSON.parse(body.slice(start, end + 1)) } catch { return null }
}

// Roda `claude --print --output-format json` (one-shot, sem tools) e devolve {result,costUsd}.
function runClaudeOnce(prompt) {
  return new Promise((resolve, reject) => {
    const model = getAgentModel()
    const args = ['--print', '--output-format', 'json']
    if (model) args.push('--model', model)
    args.push(prompt)
    const proc = spawn(CLAUDE_BIN, args, {
      cwd: os.tmpdir(),                 // cwd neutro: não carrega CLAUDE.md de framework
      env: buildAgentEnv({}),           // credenciais do CLI, sem segredos do backend
    })
    let out = '', err = ''
    const timer = setTimeout(() => { try { proc.kill('SIGKILL') } catch {}; reject(new Error('timeout na geração da narrativa')) }, GEN_TIMEOUT_MS)
    if (timer.unref) timer.unref()
    proc.stdout.on('data', (d) => { out += d.toString() })
    proc.stderr.on('data', (d) => { err += d.toString() })
    proc.on('error', (e) => { clearTimeout(timer); reject(e) })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0 && !out.trim()) return reject(new Error(err.trim() || `claude saiu com código ${code}`))
      try {
        const env = JSON.parse(out)
        resolve({ result: env.result || '', costUsd: Number(env.total_cost_usd ?? env.cost_usd ?? 0) || 0, raw: env })
      } catch {
        // Sem --output-format json parseável → usa o stdout cru como resultado.
        resolve({ result: out, costUsd: 0, raw: null })
      }
    })
  })
}

// Gera a narrativa executiva. Retorna {summary, riskLevel, attackChains, recommendations, model, costUsd}.
async function generateExecNarrative(engagement, findings) {
  if (!findings || !findings.length) {
    return { summary: 'Nenhum finding registrado para consolidar.', riskLevel: 'info', attackChains: [], recommendations: [], model: getAgentModel(), costUsd: 0 }
  }
  const { result, costUsd } = await runClaudeOnce(buildPrompt(engagement, findings))
  // Detecta recusa por safeguard (não deve ocorrer no Sonnet, mas é honesto tratar).
  if (/safeguards?[^\n]*flagged|flagged[^\n]*safeguard/i.test(result)) {
    throw new Error('O modelo recusou por safeguard. Troque para a linha Sonnet no seletor de modelo.')
  }
  const parsed = extractJson(result)
  if (!parsed || typeof parsed.summary !== 'string') {
    throw new Error('Não consegui interpretar a resposta do modelo como resumo estruturado.')
  }
  const arr = (v) => Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).slice(0, 12) : []
  const risk = String(parsed.riskLevel || '').toLowerCase()
  return {
    summary: String(parsed.summary).slice(0, 6000),
    riskLevel: ['critical', 'high', 'medium', 'low', 'info'].includes(risk) ? risk : null,
    attackChains: arr(parsed.attackChains),
    recommendations: arr(parsed.recommendations),
    model: getAgentModel(),
    costUsd,
  }
}

module.exports = { generateExecNarrative }
