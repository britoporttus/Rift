const { spawn } = require('child_process')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')
const { getAgentModel } = require('./settings')

const FRAMEWORK_PATH = process.env.FRAMEWORK_PATH || '/home/digitalbath/pentest-framework-v2'
// Janela de contexto do modelo (tokens) — base do medidor de "memória".
// Ajustável por env; 200k cobre Sonnet/Opus/Fable atuais.
const CONTEXT_LIMIT = Number(process.env.CONTEXT_LIMIT) || 200000

// A-LIVE-2: o framework NÃO emite phase_update de forma confiável, então o backend
// DERIVA a fase a partir do que o agente realmente faz — o binário de scanner no
// comando Bash é o sinal mais confiável (independe de como ele orquestra as skills).
// Ordem canônica das fases do Agente 1 (black-box) + agressivas.
const PHASE_ORDER = ['recon', 'enum', 'vuln', 'exploit', 'post']
// binário/ferramenta → fase. Regex por fase (word-boundary, case-insensitive).
const TOOL_PHASE = [
  { phase: 'recon',   re: /\b(subfinder|amass|assetfinder|findomain|dnsx|puredns|shuffledns|massdns|chaos|github-subdomains|waybackurls|gau|crt\.sh|dig|whois|theharvester)\b/i },
  { phase: 'enum',    re: /\b(nmap|naabu|masscan|rustscan|httpx|whatweb|wappalyzer|gowitness|katana|hakrawler|gospider|gobuster|ffuf|feroxbuster|dirsearch|wafw00f|arjun)\b/i },
  { phase: 'vuln',    re: /\b(nuclei|nikto|sqlmap|dalfox|testssl|sslscan|jaeles|wpscan|xsstrike|commix|retire)\b/i },
  { phase: 'exploit', re: /\b(msfconsole|msfvenom|metasploit|hydra|medusa|crackmapexec|impacket|evil-winrm|responder)\b/i },
]
const SLASH_PHASE_RE = /\/pentest-(recon|enum|vuln|exploit|post)\b/i

// Deriva a fase de UM evento WS (agent_action/agent_message). Retorna a key da
// fase ou null. Prioriza slash-command explícito; depois o binário no comando.
function inferPhaseFromEvent(ev) {
  if (!ev) return null
  const hay = ev.type === 'agent_action' ? String(ev.args || '')
            : ev.type === 'agent_message' ? String(ev.text || '')
            : ''
  if (!hay) return null
  const slash = hay.match(SLASH_PHASE_RE)
  if (slash) return slash[1].toLowerCase()
  // binário só conta em ação real (comando Bash), não em prosa do agente.
  if (ev.type === 'agent_action') {
    for (const { phase, re } of TOOL_PHASE) if (re.test(hay)) return phase
  }
  return null
}

// Normaliza um bloco tool_use (aninhado no assistant OU top-level) em agent_action.
// `args` legível por tipo de ferramenta — alimenta A-LIVE-1 (o que faz agora),
// A-LIVE-2 (inferência de fase) e a correlação de marcos (pelo toolId).
function buildToolUseEvent(b) {
  const name  = b.name || b.tool || 'tool'
  const input = b.input || {}
  let args = ''
  if (name === 'Bash' && typeof input.command === 'string') args = input.command
  else if (typeof input.file_path === 'string' || typeof input.path === 'string') args = String(input.file_path || input.path)
  else if (name === 'Task' && typeof input.description === 'string') args = input.description
  else args = input && Object.keys(input).length ? JSON.stringify(input) : ''
  return { type: 'agent_action', tool: name, status: 'running', args: args.slice(0, 300), toolId: b.id || b.tool_use_id || null }
}

// Remove códigos de escape ANSI (cores/cursor) da saída das ferramentas — senão
// vazam para os marcos como "[1;96mCloudflare" ou listas de URLs ilegíveis (wafw00f,
// katana e cia. colorem a saída mesmo sem TTY).
function stripAnsi(s) {
  return String(s)
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')                     // CSI (cores/cursor)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')       // OSC
    .replace(/\x1b[=>()][A-Za-z0-9]?/g, '')                      // outros escapes
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')            // control chars soltos (mantem \t \n)
}

// A-LIVE-2 (marcos): identifica o binário de scan dentro de um comando Bash.
function detectBinary(command) {
  const m = String(command || '').match(/\b(subfinder|amass|assetfinder|findomain|dnsx|dig|httpx|nmap|naabu|masscan|rustscan|whatweb|wappalyzer|wafw00f|katana|gau|waybackurls|hakrawler|gospider|gobuster|ffuf|feroxbuster)\b/i)
  return m ? m[1].toLowerCase() : null
}

// Extrai MARCOS ("host vivo", "N subdomínios", "stack detectada", "portas abertas"…)
// da SAÍDA real de uma ferramenta. Heurístico e conservador: se não reconhece um
// padrão claro, não emite nada (melhor silêncio que ruído/alucinação). Cada marco:
//   { kind, label, phase, source }
// Tokens que parecem "tech" entre colchetes mas NÃO são (métodos HTTP, status…).
const TECH_STOP = new Set(['OPTIONS', 'GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'PATCH', 'TRACE', 'CONNECT',
  'OK', 'MOVED', 'FOUND', 'FORBIDDEN', 'ERROR', 'FAILED', 'TIMEOUT', 'TITLE', 'REDIRECT'])

function extractMilestones(toolName, command, output) {
  const bin = toolName === 'Bash' ? detectBinary(command) : null
  if (!bin || !output) return []
  output = stripAnsi(output)   // limpa cores/escape antes de parsear (WAF/URLs saíam ilegíveis)
  // GUARDA: não parsear saída de comando que FALHOU. Antes, o help/erro do httpx
  // (Python httpx: "Usage: httpx [OPTIONS] URL / No such option: -l") era contado
  // como "25 hosts vivos". Se a saída tem sinal claro de falha, não gera marco.
  if (/\bUsage:\s|No such option|No such file or directory|command not found|Traceback \(most recent|\bExit code [1-9]/i.test(output)) return []
  const lines = output.split('\n').map((s) => s.trim()).filter(Boolean)
  const out = []
  // items = o QUE foi encontrado (para expandir no painel); dedup + cap p/ não inflar.
  const cap = (arr) => [...new Set(arr)].slice(0, 25).map((s) => String(s).slice(0, 200))
  const push = (kind, label, phase, items) => out.push({ kind, label, phase, source: bin, items: cap(items || []) })
  const plural = (n) => (n > 1 ? 's' : '')

  switch (bin) {
    case 'subfinder': case 'amass': case 'assetfinder': case 'findomain': {
      const subs = [...new Set(lines.filter((l) => /^[a-z0-9._-]+\.[a-z]{2,}$/i.test(l)))]
      if (subs.length) push('subdomains', `${subs.length} subdomínio${plural(subs.length)} descoberto${plural(subs.length)}`, 'recon', subs)
      break
    }
    case 'dnsx': case 'dig': {
      const ips = [...new Set(output.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) || [])]
      if (ips.length) push('dns', `Host resolvido — ${ips.length} IP${plural(ips.length)}`, 'recon', ips)
      break
    }
    case 'httpx': {
      // SÓ linhas que são de fato host vivo (URL ou status [200]). Sem fallback para
      // lines.length: saída sem hosts NÃO é "N hosts vivos" (era como o erro do httpx
      // Python virava marco). Se não achou host reconhecível, não emite nada.
      const hostLines = lines.filter((l) => /^https?:\/\//i.test(l) || /\[\d{3}\]/.test(l))
      const n = hostLines.length
      if (n) push('hosts', `${n} host${plural(n)} vivo${plural(n)} (HTTP)`, 'enum', hostLines)
      const tech = [...new Set([...output.matchAll(/\[([A-Za-z][\w .+/-]{1,28})\]/g)].map((m) => m[1].trim()))]
        .filter((t) => !/^\d+$/.test(t) && !/^https?/i.test(t) && !TECH_STOP.has(t.toUpperCase()))
      if (tech.length) push('tech', `Stack detectada: ${tech.slice(0, 6).join(', ')}`, 'enum', tech)
      break
    }
    case 'whatweb': case 'wappalyzer': {
      const names = [...new Set([...output.matchAll(/([A-Za-z][A-Za-z0-9.+-]{1,24})\[/g)].map((m) => m[1])
        .filter((t) => !TECH_STOP.has(t.toUpperCase())))]
      if (names.length) push('tech', `Stack detectada: ${names.slice(0, 6).join(', ')}`, 'enum', names)
      break
    }
    case 'wafw00f': {
      const m = output.match(/is behind (.+?)(?:\s*WAF|\s*\(|\.|\n|$)/i)
      if (m) push('waf', `WAF detectado: ${m[1].trim()}`, 'enum', [m[1].trim()])
      else if (/no WAF|No WAF detected|seems to be no/i.test(output)) push('waf', 'Nenhum WAF detectado', 'enum', [])
      break
    }
    case 'nmap': case 'naabu': case 'masscan': case 'rustscan': {
      const portLines = lines.filter((l) => /\b\d{1,5}\/tcp\s+open\b/i.test(l) || /Discovered open port \d+/i.test(l))
      if (portLines.length) push('ports', `${portLines.length} porta${plural(portLines.length)} aberta${plural(portLines.length)}`, 'enum', portLines)
      break
    }
    case 'katana': case 'gau': case 'waybackurls': case 'hakrawler': case 'gospider': {
      const urls = [...new Set(lines.filter((l) => /^https?:\/\//i.test(l)))]
      if (urls.length) push('urls', `${urls.length} URL${plural(urls.length)}/endpoint${plural(urls.length)} mapeado${plural(urls.length)}`, 'recon', urls)
      break
    }
    case 'gobuster': case 'ffuf': case 'feroxbuster': {
      const found = lines.filter((l) => /Status:\s*[23]\d\d/i.test(l))
      if (found.length) push('urls', `${found.length} caminho${plural(found.length)} encontrado${plural(found.length)} (fuzz)`, 'enum', found)
      break
    }
  }
  return out
}

// Extrai os blocos tool_result de um evento parseado (aninhado no `user` OU top-level).
function extractToolResults(parsed) {
  const results = []
  if (parsed?.type === 'user' && Array.isArray(parsed.message?.content)) {
    for (const b of parsed.message.content) if (b?.type === 'tool_result') results.push(b)
  } else if (parsed?.type === 'tool_result') {
    results.push(parsed)
  }
  return results.map((r) => ({
    toolId: r.tool_use_id || r.id || null,
    output: Array.isArray(r.content)
      ? r.content.map((c) => (typeof c === 'string' ? c : c?.text || '')).join('\n')
      : String(r.content ?? r.output ?? ''),
  }))
}

function writeScopeYaml(engagement) {
  const target = engagement.target || 'unknown'
  const slug   = engagement.slug   || engagement.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'engagement'
  const date   = engagement.date   || new Date().toISOString().slice(0, 10)
  const id     = `${slug}-${date.replace(/-/g, '')}`
  const now    = new Date().toISOString()

  const configDir = path.join(FRAMEWORK_PATH, 'config')
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true })

  // Create context dir + subdirs for this engagement
  const ctxDir = path.join(FRAMEWORK_PATH, 'context', id)
  if (!fs.existsSync(ctxDir)) fs.mkdirSync(ctxDir, { recursive: true })
  const parsedDir = path.join(ctxDir, 'parsed')
  if (!fs.existsSync(parsedDir)) fs.mkdirSync(parsedDir, { recursive: true })
  const rawDir = path.join(ctxDir, 'raw')
  if (!fs.existsSync(rawDir)) fs.mkdirSync(rawDir, { recursive: true })

  // Check for existing detailed scope created by /pentest-intake
  const ctxScopeFile = path.join(ctxDir, 'scope.yaml')
  const configScopeFile = path.join(configDir, 'scope.yaml')

  if (fs.existsSync(ctxScopeFile)) {
    // Intake already created a detailed scope — use it as the authoritative config
    // This preserves IP ranges, out_of_scope, intensity, WAF info, etc.
    const existingScope = fs.readFileSync(ctxScopeFile, 'utf8')
    fs.writeFileSync(configScopeFile, existingScope, 'utf8')
  } else {
    // No intake scope yet — write a baseline scope for framework authorization.
    // Serializado via yaml.dump: `target` é input do usuário e NÃO pode ser
    // interpolado cru numa string YAML (injeção quebraria o escopo de autorização).
    const scopeYaml = yaml.dump({
      engagement: {
        id,
        target,
        created: engagement.createdAt || now,
      },
      scope: {
        domains: [target, `*.${target}`],
        ip_ranges: [],
        out_of_scope: [],
        environment: 'production',
        app_type: 'web',
        fragile: false,
      },
      intensity: 'medium',
      targeted_vectors: [],
      operator_context: {
        known_stack: [],
        waf: { present: 'unknown', type: '', known_rules: [] },
        skip_findings: [],
        focus_areas: [],
        notes: '',
      },
      limits: { time_window: '', spending_usd: 5.0, notifications: 'checkpoint' },
    }, { lineWidth: -1 })
    fs.writeFileSync(configScopeFile, scopeYaml, 'utf8')
    // Also write to context dir so intake can update it later
    fs.writeFileSync(ctxScopeFile, scopeYaml, 'utf8')
  }

  // Write context/{id}/engagement-state.yaml — only if it doesn't exist yet
  const stateFile = path.join(ctxDir, 'engagement-state.yaml')
  if (!fs.existsSync(stateFile)) {
    fs.writeFileSync(stateFile, yaml.dump({
      engagement_id: id,
      credential_state: 'none',
      current_phase: 'idle',
      checkpoint_reached: false,
      started_at: now,
      last_updated: now,
      phases_completed: [],
      shadow_graph: { hosts: [], credentials: [], vulnerabilities: [], attack_chains: [] },
    }, { lineWidth: -1 }), 'utf8')
  }
}

// Resolve claude binary — prefer PATH, fall back to known locations
function findClaude() {
  try { return execSync('which claude', { encoding: 'utf8' }).trim() } catch {}
  // readdir do dir de extensões do VS Code envolvido em try: se não existir
  // (ex.: CI, outra máquina) não pode derrubar o boot do backend (achado #15).
  let vscodeCandidates = []
  try {
    vscodeCandidates = require('fs')
      .readdirSync('/home/digitalbath/.vscode-server/extensions', { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name.startsWith('anthropic.claude-code'))
      .map(d => `/home/digitalbath/.vscode-server/extensions/${d.name}/resources/native-binary/claude`)
  } catch {}
  const candidates = [
    '/home/digitalbath/.local/bin/claude',
    '/usr/local/bin/claude',
    ...vscodeCandidates,
  ]
  for (const p of candidates) {
    try { require('fs').accessSync(p, require('fs').constants.X_OK); return p } catch {}
  }
  return 'claude'
}
const CLAUDE_BIN = process.env.CLAUDE_PATH || findClaude()

// Modelo do agente. FIXADO explicitamente (--model) porque o default do CLI derivou
// para Opus 4.8, cujo safeguard de cibersegurança BLOQUEIA os prompts de pentest
// autorizado ("API Error: Opus 4.8's safeguards flagged this message…") — o run
// morria em ~30s e o painel voltava para "parado" num loop. Sonnet não aplica esse
// bloqueio. Agora é RUNTIME (getAgentModel() lê o store em settings.js, trocável pela
// UI); default vem do env AGENT_MODEL. String vazia = não fixa (usa o default do CLI).

// sessionId -> { proc, subscribers: Set<WebSocket> }
const runningSessions = new Map()

// Rift sessionId -> claude CLI session_id (para --resume entre turnos).
// Dá ao agente memória real da conversa: ele não re-roda recon nem
// reimprime status a cada mensagem. Em memória do processo do backend
// (sobrevive ao reset de limite de uso do Claude; perde-se só se o
// backend reiniciar, caso em que o histórico em texto cobre o gap).
const claudeSessions = new Map()

// Timeout de run (mata o claude se ele travar) + graça antes do SIGKILL.
const RUN_TIMEOUT_MS = Number(process.env.RUN_TIMEOUT_MS) || 45 * 60 * 1000
const KILL_GRACE_MS  = Number(process.env.KILL_GRACE_MS) || 5000

// SEC-1: NUNCA repassar todo o process.env ao agente. Ele roda bash arbitrário
// com --dangerously-skip-permissions e o prompt é 100% controlado pelo operador,
// então qualquer segredo no ambiente (JWT_SECRET, MONGO_URI, AZURE_*,
// ADMIN_PASSWORD…) seria exfiltrável por prompt injection. Passamos só o mínimo
// que o CLI do Claude precisa para rodar.
const ENV_ALLOWLIST = [
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'TERM', 'TMPDIR',
  'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_RUNTIME_DIR',
  // Credenciais do próprio Claude CLI (assinatura/API) — necessárias para o agente.
  'ANTHROPIC_API_KEY', 'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_OAUTH_TOKEN',
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
]
// Ferramentas ProjectDiscovery vivem em go/bin. Precisam ter PRECEDÊNCIA sobre
// homônimos do sistema: /usr/bin/httpx é o httpx do Python ("next generation HTTP
// client"), que NÃO entende `-l subs.txt` → a enumeração de hosts vivos falhava e o
// pipeline recon→enum→vuln morria de fome (resultado raso). Prependemos go/bin ao PATH.
const AGENT_TOOL_PATH = process.env.AGENT_TOOL_PATH || '/home/digitalbath/go/bin'
function buildAgentEnv(extra) {
  const env = {}
  for (const key of ENV_ALLOWLIST) {
    if (process.env[key] !== undefined) env[key] = process.env[key]
  }
  const merged = { ...env, ...extra }
  if (AGENT_TOOL_PATH && !(merged.PATH || '').split(':').includes(AGENT_TOOL_PATH)) {
    merged.PATH = `${AGENT_TOOL_PATH}:${merged.PATH || ''}`
  }
  return merged
}

// Mata o processo E seu grupo (as ferramentas que o claude spawnou: nmap,
// subfinder…). Com detached:true o filho vira líder de grupo → -pid mata o grupo.
function killTree(proc, signal) {
  if (!proc || proc.killed) return
  try { process.kill(-proc.pid, signal) } catch { try { proc.kill(signal) } catch {} }
}
// SIGTERM e, se não morrer no período de graça, SIGKILL.
function killTreeEscalated(proc) {
  killTree(proc, 'SIGTERM')
  const t = setTimeout(() => killTree(proc, 'SIGKILL'), KILL_GRACE_MS)
  if (t.unref) t.unref()
}

// `target` pode ser uma FUNÇÃO (event)=>void OU um Set de sockets.
// A forma-função é a correta: o server passa um broadcaster que re-resolve os
// clientes ATUAIS da sessão a cada evento — então uma reconexão de WS (aba
// dormindo, queda de rede) não deixa o run transmitindo para um Set morto
// (era a causa do "só atualiza no F5"). O Set fica só por retrocompat.
function broadcast(target, event) {
  if (typeof target === 'function') { try { target(event) } catch {} return }
  const json = JSON.stringify(event)
  for (const ws of target) {
    if (ws.readyState === 1) ws.send(json)
  }
}

function parseStreamLine(line) {
  try { return JSON.parse(line) } catch { return null }
}

// Detecta um bloco de pergunta interativa no texto do agente:
//   ```rift-question
//   {"text": "Pergunta?", "options": ["Sim", "Não"]}
//   ```
// Retorna o(s) evento(s) WS: a prosa que sobra (se houver) como agent_message
// e a pergunta como agent_question (renderizada com botões clicáveis no front).
function splitQuestion(text) {
  const m = text.match(/```rift-question\s*\n([\s\S]*?)```/)
  if (!m) return { type: 'agent_message', text }
  let q = null
  try {
    const obj = JSON.parse(m[1].trim())
    if (obj && obj.text && Array.isArray(obj.options) && obj.options.length) {
      q = { type: 'agent_question', text: String(obj.text), options: obj.options.map(String).slice(0, 6) }
    }
  } catch {}
  if (!q) return { type: 'agent_message', text }   // malformado → mostra cru
  const prose = text.replace(m[0], '').trim()
  return prose ? [{ type: 'agent_message', text: prose }, q] : q
}

// Map claude --output-format stream-json events to our WS contract.
// Pode retornar um evento, um array de eventos, ou null.
function toWsEvent(parsed, rawLine) {
  if (!parsed) {
    const text = rawLine.trim()
    return text ? { type: 'agent_message', text } : null
  }

  switch (parsed.type) {
    case 'assistant': {
      // O Claude Code aninha os blocos no `assistant.message.content`: texto E
      // tool_use juntos. Emitimos AMBOS — antes só o texto saía, então as AÇÕES
      // do agente nunca apareciam (raiz do feedback "durante o run não mostra nada").
      const content = parsed.message?.content
      if (!Array.isArray(content)) return null
      const events = []
      for (const b of content) {
        if (b.type === 'text' && b.text && b.text.trim()) {
          const q = splitQuestion(b.text)
          if (Array.isArray(q)) events.push(...q); else events.push(q)
        } else if (b.type === 'tool_use') {
          events.push(buildToolUseEvent(b))
        }
      }
      return events.length ? events : null
    }
    // tool_use top-level (formato alternativo do stream).
    case 'tool_use':
      return buildToolUseEvent(parsed)
    // tool_result NÃO é transmitido como ação (evita poluir o feed com "resultado"
    // e dobrar o histórico). A saída é consumida internamente para derivar MARCOS
    // (ver extractToolResults/extractMilestones no run()).
    case 'user':
    case 'tool_result':
      return null
    case 'result': {
      // result.result text já saiu via eventos assistant — aqui usamos custo + contexto.
      const events = []
      // BUGFIX: o Claude Code atual reporta o custo em `total_cost_usd` (o código lia
      // `cost_usd`, nome antigo → sempre undefined → custo travado em $0.00 e usage do
      // admin nunca registrada). Aceita ambos por retrocompat.
      const usd = parsed.total_cost_usd ?? parsed.cost_usd
      if (usd != null) {
        events.push({
          type: 'cost_update',
          usd,
          tokens: (parsed.usage?.input_tokens ?? 0) + (parsed.usage?.output_tokens ?? 0),
        })
      }
      // Tamanho do contexto ≈ tudo que entrou neste turno (com --resume o
      // transcript inteiro é recarregado, então input+cache refletem a "memória").
      const u = parsed.usage || {}
      const ctxTokens = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
      if (ctxTokens > 0) {
        events.push({
          type: 'context_usage',
          tokens: ctxTokens,
          limit: CONTEXT_LIMIT,
          percent: Math.min(100, Math.round((ctxTokens / CONTEXT_LIMIT) * 100)),
        })
      }
      return events.length ? events : null
    }
    default:
      return null
  }
}

// sessionId  = Rift chat session ID (key for runner isolation)
// engagementId = MongoDB engagement UUID (used for ENGAGEMENT_ID env var and scope writing)
function run(sessionId, engagementId, prompt, subscribers, onCostUpdate, onEvent, engagement, user, opts = {}) {
  if (runningSessions.has(sessionId)) {
    broadcast(subscribers, { type: 'agent_message', text: '⚠️ Agente já ativo nesta sessão.' })
    return
  }

  const costCeiling = typeof opts.costCeiling === 'number' && opts.costCeiling > 0 ? opts.costCeiling : null
  let budgetExceeded = false
  // Detecta recusa por safeguard/erro de API do modelo — para não virar loop silencioso.
  let blockedBySafeguard = false

  if (engagement) {
    try { writeScopeYaml(engagement) } catch (err) {
      console.warn('[agent-runner] falha ao escrever scope.yaml:', err.message)
    }
  }

  // Resolve user role — passed from server.js so intake can check admin status
  const isAdmin  = user?.role === 'admin' || user?.isAdmin === true
  const userName = user?.username || user?.email || ''

  // Continuidade de sessão: se já temos um claude session_id para esta
  // sessão do Rift (em memória OU vindo do banco via opts.resumeSessionId),
  // retomamos a conversa em vez de começar do zero.
  let claudeSessionId = claudeSessions.get(sessionId) || opts.resumeSessionId || null
  if (claudeSessionId) claudeSessions.set(sessionId, claudeSessionId)
  const resuming = !!claudeSessionId

  // No primeiro turno injetamos o contexto de sistema (escopo, role, regras).
  // Ao retomar (--resume), a sessão já tem esse contexto + o histórico real,
  // então mandamos só a mensagem do operador — sem reinjetar nada.
  const finalPrompt = resuming ? prompt : (opts.systemContext || '') + prompt

  // --dangerously-skip-permissions: modo headless não tem TTY, então não há
  // diálogo de permissão para responder. Sem isto, toda Write/Edit fora do
  // allowlist é negada e o agente fica preso pedindo aprovação de um popup
  // que não existe. Apropriado: ferramenta de pentest autorizada, infra
  // própria, escopo limitado por config/scope.yaml e teto de custo do Rift.
  const args = ['--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions']
  // Fixa o modelo (evita cair no Opus 4.8 e ser bloqueado pelo safeguard de cyber).
  // Lê o modelo em runtime (trocável pela UI via settings.js).
  const agentModel = getAgentModel()
  if (agentModel) args.push('--model', agentModel)
  if (resuming) args.push('--resume', claudeSessionId)
  args.push('--print', finalPrompt)

  const proc = spawn(
    CLAUDE_BIN,
    args,
    {
      cwd: FRAMEWORK_PATH,
      // detached: novo grupo de processos → conseguimos matar a árvore inteira
      // (as ferramentas que o agente dispara) no stop/timeout/shutdown.
      detached: true,
      // SEC-1: env mínima, sem segredos do backend (ver ENV_ALLOWLIST/buildAgentEnv).
      env: buildAgentEnv({
        ENGAGEMENT_ID:       engagementId,
        RIFT_USER_IS_ADMIN:  isAdmin ? 'true' : 'false',
        RIFT_USER_NAME:      userName,
        RIFT_USER_ROLE:      user?.role || (isAdmin ? 'admin' : 'user'),
        // SEC-3: fases agressivas (exploit/post) só quando o backend libera (admin
        // ou scan agendado com autoExploit). O framework deve tratar como restrição
        // dura, não sugestão.
        RIFT_ALLOW_AGGRESSIVE: (isAdmin || opts.allowAggressive) ? 'true' : 'false',
        // Papel do agente (Fase 2): 'blackbox' = Agente 1 (sem credenciais),
        // 'authenticated' = Agente 2 (em construção). Default blackbox.
        AGENT_ROLE:          opts.agentRole || 'blackbox',
      }),
    }
  )

  // Timeout: se o claude travar, mata a árvore e libera a sessão.
  const timeoutTimer = setTimeout(() => {
    broadcast(subscribers, {
      type: 'agent_message',
      text: `⏱️ Tempo limite de execução (${Math.round(RUN_TIMEOUT_MS / 60000)} min) atingido — encerrando o agente.`,
    })
    killTreeEscalated(proc)
  }, RUN_TIMEOUT_MS)
  if (timeoutTimer.unref) timeoutTimer.unref()

  runningSessions.set(sessionId, { proc, subscribers, timeoutTimer })
  // Sinais de ciclo de vida explícitos: o front trava o input enquanto
  // 'running' e libera em 'idle' (não depende mais de heurística de streaming).
  broadcast(subscribers, { type: 'agent_status', state: 'running' })
  broadcast(subscribers, { type: 'agent_thinking', text: 'Agente iniciando...' })

  // Processa um único evento WS (broadcast + custo + enforcement de teto).
  function emit(event) {
    if (!event) return
    broadcast(subscribers, event)
    // Recusa por safeguard do modelo: exige "safeguard" E "flagged" próximos — a
    // mensagem real é "…safeguards flagged this message as a cybersecurity topic".
    // NÃO disparar em "API Error" genérico (rate-limit/transiente num run longo),
    // que antes rotulava falsamente um run que só bateu no teto de custo.
    if (event.type === 'agent_message' && /safeguards?[^\n]*flagged|flagged[^\n]*safeguard/i.test(String(event.text || ''))) {
      blockedBySafeguard = true
    }
    if (event.type === 'cost_update' && onCostUpdate) onCostUpdate(event.usd, event.tokens)
    if (onEvent) onEvent(event)
    if (event.type === 'cost_update' && costCeiling && event.usd >= costCeiling && !budgetExceeded) {
      budgetExceeded = true
      broadcast(subscribers, {
        type: 'agent_message',
        text: `🛑 Teto de custo (US$ ${costCeiling.toFixed(2)}) atingido — sessão encerrada automaticamente.`,
      })
      if (opts.onBudgetExceeded) opts.onBudgetExceeded(event.usd)
      killTreeEscalated(proc)
    }
  }

  // A-LIVE-2: estado de fase inferido deste run. Só avança (nunca regride) para
  // não "piscar" a timeline. progress sobe em degraus a cada sinal da mesma fase.
  let curPhaseIdx = -1
  let phaseSignals = 0
  let lastPhaseProgress = -1
  function maybeEmitPhase(ev) {
    const p = inferPhaseFromEvent(ev)
    if (!p) return
    const idx = PHASE_ORDER.indexOf(p)
    if (idx < 0 || idx < curPhaseIdx) return       // ignora regressão/desconhecida
    if (idx > curPhaseIdx) { curPhaseIdx = idx; phaseSignals = 0 }  // transição
    phaseSignals++
    const progress = Math.min(90, 20 + phaseSignals * 12)
    // dedupe: não reemite o mesmo (fase, progress) — limita ~7 msgs por fase.
    if (idx === curPhaseIdx && progress === lastPhaseProgress) return
    lastPhaseProgress = progress
    emit({ type: 'phase_update', phase: p, progress })
  }

  // A-LIVE-2 (marcos): correlaciona tool_use → tool_result. Quando uma ação começa,
  // guardamos {tool, comando} pelo toolId; quando o resultado chega, extraímos os
  // marcos da saída (host vivo, N subdomínios, stack, portas…). Dedup por label.
  const pendingTools = new Map()
  const emittedMilestones = new Set()
  function trackTool(ev) {
    if (ev.type === 'agent_action' && ev.status !== 'done' && ev.toolId) {
      pendingTools.set(ev.toolId, { name: ev.tool, command: ev.args || '' })
    }
  }
  function maybeEmitMilestones(parsed) {
    for (const { toolId, output } of extractToolResults(parsed)) {
      const t = toolId ? pendingTools.get(toolId) : null
      if (toolId) pendingTools.delete(toolId)
      for (const m of extractMilestones(t?.name, t?.command, output)) {
        if (emittedMilestones.has(m.label)) continue
        emittedMilestones.add(m.label)
        emit({ type: 'milestone', ...m })
      }
    }
  }

  // toWsEvent pode devolver um evento, um array, ou null → normaliza e emite.
  function emitFrom(parsed, line) {
    const out = toWsEvent(parsed, line)
    const events = Array.isArray(out) ? out : out ? [out] : []
    for (const ev of events) { emit(ev); maybeEmitPhase(ev); trackTool(ev) }
    // Marcos vêm da SAÍDA das ferramentas (tool_result), não transmitida como ação.
    maybeEmitMilestones(parsed)
  }

  let buf = ''

  proc.stdout.on('data', (chunk) => {
    buf += chunk.toString()
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      if (!line.trim()) continue
      const parsed = parseStreamLine(line)
      // Todo evento do stream-json carrega o session_id da conversa.
      // Guardamos (memória + banco via callback) para retomar no próximo turno.
      if (parsed && parsed.session_id && parsed.session_id !== claudeSessionId) {
        claudeSessionId = parsed.session_id
        claudeSessions.set(sessionId, claudeSessionId)
        if (opts.onClaudeSession) opts.onClaudeSession(claudeSessionId)
      }
      emitFrom(parsed, line)
    }
  })

  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim()
    // Suprime ruído interno do CLI (não é erro do agente) para não poluir o feed
    // nem o "Fazendo agora": aviso de stdin, e o aviso de workspace-não-confiável
    // ("Ignoring N permissions.allow entries … has not been trusted").
    const benign = !text
      || text.includes('no stdin data received')
      || text.includes('has not been trusted')
      || /Ignoring \d+ permissions/.test(text)
      || text.includes('hasTrustDialogAccepted')
    if (!benign) {
      broadcast(subscribers, { type: 'agent_message', text: `[log] ${text}` })
    }
  })

  proc.on('close', (code) => {
    clearTimeout(timeoutTimer)
    if (buf.trim()) {
      const parsed = parseStreamLine(buf)
      if (parsed && parsed.session_id && parsed.session_id !== claudeSessionId) {
        claudeSessionId = parsed.session_id
        claudeSessions.set(sessionId, claudeSessionId)
        if (opts.onClaudeSession) opts.onClaudeSession(claudeSessionId)
      }
      emitFrom(parsed, buf)
    }
    runningSessions.delete(sessionId)
    // Precedência: teto de custo é o motivo REAL de parada quando bateu (já emitiu
    // a msg própria em emit()). Só então consideramos safeguard, e por último erro.
    if (budgetExceeded) {
      // msg de teto já foi emitida; nada a sobrepor.
    } else if (blockedBySafeguard) {
      // Recusa por safeguard do modelo: mensagem acionável (não deixa virar loop mudo).
      broadcast(subscribers, {
        type: 'agent_message',
        text: `🛡️ O modelo (${getAgentModel() || 'default do CLI'}) recusou por safeguard de cibersegurança. "Continuar" vai bater no mesmo bloqueio. Troque o modelo (botão de modelo na tela do engagement) por um da linha Sonnet.`,
      })
    } else if (code !== 0 && code !== 143 && code !== 137) {
      // Só erros REAIS. 143 (SIGTERM) e 137 (SIGKILL) são término deliberado
      // (operador parou, timeout, shutdown) — já têm mensagem própria; não é "erro".
      broadcast(subscribers, { type: 'agent_message', text: `⚠️ Agente encerrado com erro (código ${code}).` })
    }
    // A-LIVE-2: concluiu sem erro → fecha a última fase alcançada em 100% (senão
    // ela ficaria eternamente em ~90% na timeline).
    if (code === 0 && curPhaseIdx >= 0) {
      emit({ type: 'phase_update', phase: PHASE_ORDER[curPhaseIdx], progress: 100 })
    }
    // Libera o input do operador — o turno do agente terminou.
    broadcast(subscribers, { type: 'agent_status', state: 'idle' })
    if (opts.onClose) opts.onClose(code, { budgetExceeded })
  })
}

function stop(sessionId) {
  const s = runningSessions.get(sessionId)
  if (s) {
    if (s.timeoutTimer) clearTimeout(s.timeoutTimer)
    killTreeEscalated(s.proc)
    runningSessions.delete(sessionId)
  }
}

// Encerra todas as sessões ativas — usado no shutdown gracioso do backend
// para não deixar processos claude (e as ferramentas que eles spawnaram) órfãos.
function stopAll() {
  for (const [, s] of runningSessions) {
    if (s.timeoutTimer) clearTimeout(s.timeoutTimer)
    killTreeEscalated(s.proc)
  }
  runningSessions.clear()
}

function sendInput(sessionId, text) {
  const s = runningSessions.get(sessionId)
  if (!s) return false
  s.proc.stdin.write(text + '\n')
  return true
}

function isRunning(sessionId) {
  return runningSessions.has(sessionId)
}

// Esquece o claude session_id desta sessão → o próximo turno começa uma
// conversa nova (CLI enxuto). Usado pela compactação: o estado do engagement
// continua em disco, então a sessão nova o recarrega.
function clearSession(sessionId) {
  claudeSessions.delete(sessionId)
}

module.exports = { run, stop, stopAll, sendInput, isRunning, clearSession, buildAgentEnv, ENV_ALLOWLIST, inferPhaseFromEvent, PHASE_ORDER, extractMilestones, buildToolUseEvent, toWsEvent }
