const { spawn } = require('child_process')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')
const { getAgentModel } = require('./settings')
const { getFrameworkPath } = require('./frameworks')

// Path do framework DEFAULT (v2). Cada run recebe o path da versão escolhida via
// opts.frameworkPath (seletor A/B/C); este é só o fallback. env FRAMEWORK_PATH ainda
// tem precedência (retrocompat), resolvida dentro do registro (frameworks.js).
const FRAMEWORK_PATH = getFrameworkPath('v2')
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
  { phase: 'enum',    re: /\b(nmap|naabu|masscan|rustscan|httpx|whatweb|wappalyzer|gowitness|katana|hakrawler|gospider|gobuster|ffuf|feroxbuster|dirsearch|wafw00f|arjun|testssl|sslscan|sslyze)\b/i },
  { phase: 'vuln',    re: /\b(nuclei|nikto|sqlmap|dalfox|jaeles|wpscan|xsstrike|commix|retire)\b/i },
  { phase: 'exploit', re: /\b(msfconsole|msfvenom|metasploit|hydra|medusa|crackmapexec|impacket|evil-winrm|responder)\b/i },
]
const SLASH_PHASE_RE = /\/pentest-(recon|enum|vuln|exploit|post)\b/i

// `curl` não bate em NENHUMA regex de TOOL_PHASE, mas é a ferramenta MAIS usada
// pelo framework pra testar lógica de negócio de API (SSO/SAML, CORS, tenant
// enumeration, bypass de auth) — coisa que nuclei/sqlmap não pegam. Sem isto o
// indicador de fase fica cego pra praticamente todo teste de vulnerabilidade real
// deste tipo de engagement, e nunca mostra "Vulnerabilidades" mesmo quando o
// agente está literalmente injetando payload e validando a resposta.
const CURL_RE = /\bcurl\b/i
// Sinais de que o curl está testando uma HIPÓTESE de vulnerabilidade (payload de
// injeção/redirect/traversal no comando), não só sondando/enumerando um endpoint.
const CURL_VULN_RE = /(union(\s+all)?\s+select|['"]\s*(or|and)\s*['"]?\s*[\d'"]|<script|javascript:|\.\.%2f|\.\.\/\.\.\/|returnurl=|relaystate|redirect_uri=|\$\{jndi|<!entity|xxe)/i

// Deriva a fase de UM evento WS. Retorna a key da fase ou null.
// REGRA: a fase segue o que o agente FAZ (ação real), NUNCA o que ele NARRA. A prosa
// do agente mencionando "/pentest-vuln" ou "vou buscar vulnerabilidades" NÃO pode
// avançar a fase — era a raiz do bug "pulou para Vulnerabilidades enquanto ainda
// fazia recon (dig)". Só `agent_action` (uso de ferramenta) conta: slash-command nos
// args (raro) ou o binário do comando Bash (dig=recon, httpx=enum, nuclei=vuln…).
function inferPhaseFromEvent(ev) {
  if (!ev || ev.type !== 'agent_action') return null
  const hay = String(ev.args || '')
  if (!hay) return null
  const slash = hay.match(SLASH_PHASE_RE)
  if (slash) return slash[1].toLowerCase()
  for (const { phase, re } of TOOL_PHASE) if (re.test(hay)) return phase
  if (CURL_RE.test(hay)) return CURL_VULN_RE.test(hay) ? 'vuln' : 'enum'
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

// Alvo (host) fuzzado por ffuf/gobuster/feroxbuster — extraído do comando. Serve
// para SEPARAR execuções diferentes no marco (senão dois fuzz viram um só, ou
// aparecem "38 / 1 / 29 caminhos" sem dizer contra o quê). Remove o token FUZZ.
function parseFuzzTarget(command) {
  const m = String(command || '').match(/(?:-u|--url)\s+(\S+)|(https?:\/\/\S+)/i)
  const raw = m ? (m[1] || m[2]) : null
  if (!raw) return null
  const cleaned = raw.replace(/FUZZ/gi, '')
  try { return new URL(cleaned).host } catch {}
  return cleaned.replace(/^https?:\/\//i, '').split('/')[0] || null
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
const TECH_STOP = new Set([
  // métodos + palavras de status HTTP
  'OPTIONS', 'GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'PATCH', 'TRACE', 'CONNECT',
  'OK', 'MOVED', 'FOUND', 'FORBIDDEN', 'ERROR', 'FAILED', 'TIMEOUT', 'TITLE', 'REDIRECT', 'NOTFOUND', 'NOCONTENT',
  // nomes de header, atributos de cookie e campos de geo/meta que NÃO são tecnologia
  // (raiz do "Stack detectada: Qualidade / Country, Cookies, HttpOnly, IP")
  'COOKIE', 'COOKIES', 'HTTPONLY', 'SECURE', 'SAMESITE', 'DOMAIN', 'PATH', 'EXPIRES', 'MAX-AGE', 'SET-COOKIE',
  'SERVER', 'DATE', 'CONNECTION', 'VARY', 'ETAG', 'LOCATION', 'AGE', 'VIA', 'ALLOW', 'LINK', 'REFRESH', 'PRAGMA',
  'CONTENT-TYPE', 'CONTENT-LENGTH', 'CONTENT-ENCODING', 'CACHE-CONTROL', 'TRANSFER-ENCODING', 'ACCEPT-RANGES',
  'X-FRAME-OPTIONS', 'X-CONTENT-TYPE-OPTIONS', 'X-XSS-PROTECTION', 'STRICT-TRANSPORT-SECURITY',
  'REFERRER-POLICY', 'CONTENT-SECURITY-POLICY', 'PERMISSIONS-POLICY', 'ACCESS-CONTROL-ALLOW-ORIGIN',
  'COUNTRY', 'IP', 'QUALITY', 'QUALIDADE', 'ASN', 'CDN', 'CNAME', 'WEBSERVER', 'SCHEME', 'PORT', 'HOST',
  'URL', 'WORDS', 'LINES', 'CHARS', 'SIZE', 'STATUS',
  // plugins de METADADO do whatweb (não são tecnologia): raiz do
  // "Stack detectada: NET, Cookies, Country, HTTPServer, HttpOnly, IP"
  'HTTPSERVER', 'UNCOMMONHEADERS', 'X-POWERED-BY', 'POWEREDBY', 'REDIRECTLOCATION', 'VIA-PROXY',
  'SCRIPT', 'FRAME', 'IFRAME', 'PASSWORDFIELD', 'EMAIL', 'HTML5', 'OPEN-GRAPH-PROTOCOL',
  'CONTENT-LANGUAGE', 'X-UA-COMPATIBLE', 'META-AUTHOR', 'META-REFRESH', 'METAREFRESH', 'PROBABLY',
  'ACCESS-CONTROL-ALLOW-METHODS', 'ACCESS-CONTROL-ALLOW-CREDENTIALS'])

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
      // Parseia cada achado (status 2xx/3xx) em {status, size, caminho} — item
      // legível e estruturado. O alvo entra no label para separar execuções.
      const target = parseFuzzTarget(command)
      const rows = []
      for (const l of lines) {
        const st = l.match(/Status:\s*([23]\d\d)/i)
        if (!st) continue
        const size = (l.match(/(?:Size|Content-Length)[:=]?\s*(\d+)/i) || [])[1]
        const pathTok = (l.match(/^\s*(\/?[^\s,]+)/) || [])[1] || ''
        rows.push(`[${st[1]}]${size ? ` ${size}B` : ''}  ${pathTok}`.trim())
      }
      const n = rows.length
      if (n) push('paths', `${n} caminho${plural(n)} encontrado${plural(n)}${target ? ` em ${target}` : ''} (fuzz)`, 'enum', rows)
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

function writeScopeYaml(engagement, frameworkPath = FRAMEWORK_PATH) {
  const target = engagement.target || 'unknown'
  const slug   = engagement.slug   || engagement.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'engagement'
  const date   = engagement.date   || new Date().toISOString().slice(0, 10)
  const id     = `${slug}-${date.replace(/-/g, '')}`
  const now    = new Date().toISOString()

  const configDir = path.join(frameworkPath, 'config')
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true })

  // Create context dir + subdirs for this engagement
  // Frente 0: o contexto do agente vive sob o tenant. Sem isso o agente — que
  // roda Bash com o framework como cwd — enxerga o contexto de todos os
  // clientes com um `ls context/`.
  const ctxDir = readContextDir(frameworkPath, opts.tenantSlug, id)
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

// P1-10 (auditoria 2026-07-20): só o worker de jobs AGENDADOS tinha teto de
// concorrência (JOBS_MAX_CONCURRENT). O caminho de chat interativo não tinha
// nenhum — qualquer role podia abrir sessões `claude --dangerously-skip-permissions`
// (cada uma rodando nmap/nuclei/ffuf/etc) sem limite, saturando CPU/RAM/disco da
// VPS única. Teto GLOBAL (todas as sessões, todos os engagements), não por-usuário
// — simples o bastante pro modelo atual (1 VPS) sem precisar rastrear usuário aqui.
const MAX_CONCURRENT_SESSIONS = Number(process.env.AGENT_MAX_CONCURRENT_SESSIONS) || 4

// Sequência monotônica de runs — compõe o `runId` de cada marco (identificador da
// execução), para o painel distinguir/agrupar marcos de execuções diferentes.
let runSeq = 0

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
const { readContextDir } = require('./tenant-paths')

const ENV_ALLOWLIST = [
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'TERM', 'TMPDIR',
  'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_RUNTIME_DIR',
  'CLAUDE_CONFIG_DIR',
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
]

// ── P0-8: credencial do agente ───────────────────────────────────────────────
// A auditoria assumiu que ANTHROPIC_API_KEY/CLAUDE_CODE_OAUTH_TOKEN estavam no
// ambiente. Não estão: o CLI autentica pelo arquivo ~/.claude/.credentials.json
// (a ASSINATURA pessoal do operador). Ou seja, o vetor de exfiltração real não
// é `env | base64` — é ler o arquivo, já que o agente roda Bash arbitrário com
// HOME no ambiente.
//
// O que dá para resolver EM CÓDIGO (aqui): suportar uma credencial dedicada ao
// deployment, e passar SÓ ELA — nunca duas credenciais no mesmo processo. Com
// `RIFT_AGENT_ANTHROPIC_API_KEY` setada, o agente usa uma chave de API própria,
// monitorável e revogável no console da Anthropic sem derrubar a conta pessoal,
// e `CLAUDE_CONFIG_DIR` aponta para um diretório dedicado (`RIFT_AGENT_CONFIG_DIR`)
// para o CLI não cair no perfil pessoal.
//
// O que NÃO dá para resolver aqui (fica como ação de infra, ver docs/PLANO-MESTRE
// §3.1): isolamento de verdade do arquivo de credencial exige rodar o agente com
// outro usuário de SO/container — enquanto HOME apontar para o home do operador,
// um `cat` alcança o arquivo. Egress filtering de rede e rotação idem.
const AGENT_CONFIG_DIR = process.env.RIFT_AGENT_CONFIG_DIR || null

function agentCredential(env = process.env) {
  if (env.RIFT_AGENT_ANTHROPIC_API_KEY) {
    return { vars: { ANTHROPIC_API_KEY: env.RIFT_AGENT_ANTHROPIC_API_KEY }, kind: 'dedicated-api-key' }
  }
  if (env.ANTHROPIC_API_KEY) {
    return { vars: { ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY }, kind: 'shared-api-key' }
  }
  if (env.CLAUDE_CODE_OAUTH_TOKEN) {
    return { vars: { CLAUDE_CODE_OAUTH_TOKEN: env.CLAUDE_CODE_OAUTH_TOKEN }, kind: 'shared-oauth-token' }
  }
  // Sem nada no env: o CLI resolve pelo arquivo de credencial do HOME.
  return { vars: {}, kind: 'subscription-file' }
}

// Aviso único no boot — a dívida de infra fica visível no log em vez de
// silenciosamente esquecida.
let credentialWarned = false
function warnIfSharedCredential() {
  if (credentialWarned) return
  credentialWarned = true
  const { kind } = agentCredential()
  if (kind === 'dedicated-api-key') return
  console.warn(
    `[agent-runner] P0-8: agente usando credencial COMPARTILHADA (${kind}). ` +
    'Defina RIFT_AGENT_ANTHROPIC_API_KEY (chave dedicada a este deployment) ' +
    'para poder monitorar custo anômalo e revogar sem derrubar a conta pessoal.'
  )
}
// Ferramentas ProjectDiscovery vivem em go/bin. Precisam ter PRECEDÊNCIA sobre
// homônimos do sistema: /usr/bin/httpx é o httpx do Python ("next generation HTTP
// client"), que NÃO entende `-l subs.txt` → a enumeração de hosts vivos falhava e o
// pipeline recon→enum→vuln morria de fome (resultado raso). Prependemos go/bin ao PATH.
const AGENT_TOOL_PATH = process.env.AGENT_TOOL_PATH || '/home/digitalbath/go/bin'
// ~/.local/bin: onde o pipx instala az/scout/prowler (packs autenticados). Sem isto
// no PATH do agente, o `az` etc. não é encontrado no run do pack Azure.
const LOCAL_BIN = require('path').join(require('os').homedir(), '.local', 'bin')
function buildAgentEnv(extra) {
  const env = {}
  for (const key of ENV_ALLOWLIST) {
    if (process.env[key] !== undefined) env[key] = process.env[key]
  }
  // Exatamente UMA credencial no processo do agente (ver agentCredential).
  Object.assign(env, agentCredential().vars)
  // Perfil dedicado do CLI, quando configurado — evita o agente herdar o
  // perfil/credencial pessoal do operador via CLAUDE_CONFIG_DIR padrão.
  if (AGENT_CONFIG_DIR) env.CLAUDE_CONFIG_DIR = AGENT_CONFIG_DIR
  const merged = { ...env, ...extra }
  // Prepend dos dirs de tooling (precedência sobre homônimos do sistema).
  for (const dir of [LOCAL_BIN, AGENT_TOOL_PATH]) {
    if (dir && !(merged.PATH || '').split(':').includes(dir)) {
      merged.PATH = `${dir}:${merged.PATH || ''}`
    }
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

// ── P1-14 (auditoria 2026-07-20): sobrevivência a crash duro do backend ────────
// `runningSessions` é só em memória — some num OOM-kill/`kill -9`/crash. Sem
// persistir o PID em disco, o grupo de processos do claude (+ nmap/ffuf/etc que
// ele disparou) fica órfão, reparentado à init, sem enforcement de timeout.
// Persistimos {sessionId -> {engagementId, pid}} num JSON simples (mesmo
// espírito de settings.js) e, no boot, matamos qualquer grupo que ainda esteja
// vivo. Kill-tree gracioso normal (stop/timeout/shutdown) já remove a entrada,
// então só sobra algo aqui se o processo PAI morreu sem chance de limpar.
const PID_FILE = path.join(__dirname, '..', 'data', 'running-pids.json')

function readPidFile(file = PID_FILE) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return {} }
}
function writePidFile(data, file = PID_FILE) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(data))
  } catch (err) { console.warn('[agent-runner] falha ao persistir PID em disco:', err?.message) }
}
function persistPid(sessionId, engagementId, pid, file = PID_FILE) {
  const data = readPidFile(file)
  data[sessionId] = { engagementId, pid, startedAt: Date.now() }
  writePidFile(data, file)
}
function removePid(sessionId, file = PID_FILE) {
  const data = readPidFile(file)
  if (data[sessionId]) { delete data[sessionId]; writePidFile(data, file) }
}
// `kill(-pid, 0)` não envia sinal — só testa se o GRUPO ainda existe (ESRCH se não).
function isGroupAlive(pid) {
  try { process.kill(-pid, 0); return true } catch { return false }
}
function killPidTreeEscalated(pid) {
  try { process.kill(-pid, 'SIGTERM') } catch {}
  const t = setTimeout(() => { try { process.kill(-pid, 'SIGKILL') } catch {} }, KILL_GRACE_MS)
  if (t.unref) t.unref()
}
// Chamado 1x no boot do backend (ver server.js). Mata qualquer grupo de
// processo ainda vivo cujo PID foi persistido antes de um crash duro, e limpa
// o arquivo (o resto das entradas já não corresponde a processo nenhum).
function reconcileOrphanedProcesses(file = PID_FILE) {
  const data = readPidFile(file)
  let killed = 0
  for (const [sessionId, rec] of Object.entries(data)) {
    if (rec && rec.pid && isGroupAlive(rec.pid)) {
      console.warn(`[agent-runner] processo órfão de crash anterior (sessão ${sessionId}, pid ${rec.pid}) — matando árvore.`)
      killPidTreeEscalated(rec.pid)
      killed++
    }
  }
  writePidFile({}, file)
  return killed
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
  // P1-20 (auditoria 2026-07-20): um scan AGENDADO (scheduler.js, sessionId
  // `scheduled-{engId}`) escreve nos MESMOS arquivos (scope.yaml/engagement-state.yaml/
  // findings/) que uma sessão interativa do mesmo engagement — os dois processos
  // `claude` rodando ao mesmo tempo corrompem esse estado compartilhado em silêncio.
  // Convenção de nome compartilhada com scheduler.js#schedSessionId (não importamos
  // scheduler.js aqui pra evitar dependência circular — scheduler.js já requer este módulo).
  if (runningSessions.has(`scheduled-${engagementId}`)) {
    broadcast(subscribers, {
      type: 'agent_message',
      text: '⚠️ Há um scan agendado rodando para este engagement agora. Aguarde ele terminar antes de iniciar uma sessão interativa.',
    })
    return
  }
  if (runningSessions.size >= MAX_CONCURRENT_SESSIONS) {
    broadcast(subscribers, {
      type: 'agent_message',
      text: `⚠️ Limite de ${MAX_CONCURRENT_SESSIONS} sessões simultâneas do agente atingido. Aguarde uma sessão existente terminar antes de iniciar outra.`,
    })
    return
  }

  const costCeiling = typeof opts.costCeiling === 'number' && opts.costCeiling > 0 ? opts.costCeiling : null
  let budgetExceeded = false
  // Detecta recusa por safeguard/erro de API do modelo — para não virar loop silencioso.
  let blockedBySafeguard = false
  // A-STATE (1.3): timeout mata o run; sinalizamos para o onClose distinguir
  // "falha por tempo limite" de "concluído" (o código de saída é 143 nos dois).
  let timedOut = false
  // Identificador desta execução — carimba os marcos (ETAPA 4).
  const runId = `${sessionId}#${++runSeq}`

  // Versão do agente escolhida para este engagement (seletor A/B/C). Default = v2.
  const frameworkPath = opts.frameworkPath || FRAMEWORK_PATH

  if (engagement) {
    try { writeScopeYaml(engagement, frameworkPath) } catch (err) {
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
      cwd: frameworkPath,
      // detached: novo grupo de processos → conseguimos matar a árvore inteira
      // (as ferramentas que o agente dispara) no stop/timeout/shutdown.
      detached: true,
      // SEC-1: env mínima, sem segredos do backend (ver ENV_ALLOWLIST/buildAgentEnv).
      env: buildAgentEnv({
        // Credenciais EFÊMERAS do pack autenticado (Azure/AWS/…), fornecidas pelo
        // operador para este engagement autorizado e injetadas SÓ neste run (cofre
        // in-memory). Espalhadas primeiro para que as vars de CONTROLE do Rift abaixo
        // (RIFT_*, FRAMEWORK_ROOT…) sempre prevaleçam sobre um objeto de credencial.
        // NÃO são segredos do backend (esses seguem barrados pelo ENV_ALLOWLIST).
        ...(opts.credentialEnv || {}),
        ENGAGEMENT_ID:       engagementId,
        // T1: raiz REAL do framework escolhido → os phase-files do v3 usam
        // `${FRAMEWORK_ROOT:-...}`, então o valor certo do Rift vence o hardcode
        // antigo (`/home/digitalbath/pentest-framework-3`) e evita o exit por path errado.
        FRAMEWORK_ROOT:      frameworkPath,
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
    timedOut = true
    broadcast(subscribers, {
      type: 'agent_message',
      text: `⏱️ Tempo limite de execução (${Math.round(RUN_TIMEOUT_MS / 60000)} min) atingido — encerrando o agente.`,
    })
    killTreeEscalated(proc)
  }, RUN_TIMEOUT_MS)
  if (timeoutTimer.unref) timeoutTimer.unref()

  runningSessions.set(sessionId, { proc, subscribers, timeoutTimer, engagementId })
  persistPid(sessionId, engagementId, proc.pid)
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

  // A-LIVE-2: a fase reflete a ATIVIDADE ATUAL do agente (o que ele faz AGORA) e
  // PERMITE regressão. O agente intercala recon/enum/vuln o tempo todo (analisa JS e
  // swagger = enum, ao mesmo tempo em que tenta SQLi/redirect = vuln); o modelo antigo
  // de catraca (forward-only) travava na fase mais alta já tocada e escondia todo o
  // recon/enum que continua — o operador via "Vulnerabilidades" enquanto o agente
  // ainda fazia recon. HISTERESE: só troca a fase exibida após 2 sinais CONSECUTIVOS
  // de uma nova fase, então uma ação solta não faz a barra piscar/pular.
  const phaseActivity = { recon: 0, enum: 0, vuln: 0, exploit: 0, post: 0 }
  let shownPhase = null
  let candidatePhase = null
  let candidateHits = 0
  let lastEmittedProgress = -1
  const progressFor = (phase) => Math.min(90, 15 + phaseActivity[phase] * 10)
  function maybeEmitPhase(ev) {
    const p = inferPhaseFromEvent(ev)
    if (!p || !(p in phaseActivity)) return
    phaseActivity[p]++
    if (p !== shownPhase) {
      // acumula sinais consecutivos da fase candidata; troca só ao confirmar (>=2),
      // exceto a 1ª fase do run (mostra de imediato).
      if (p === candidatePhase) candidateHits++
      else { candidatePhase = p; candidateHits = 1 }
      if (shownPhase !== null && candidateHits < 2) return
      shownPhase = p
      candidatePhase = null
      candidateHits = 0
      lastEmittedProgress = -1                 // fase nova → reemite o progresso dela
    } else {
      candidatePhase = null                    // reafirma a fase atual → zera candidata
      candidateHits = 0
    }
    const progress = progressFor(shownPhase)
    if (progress === lastEmittedProgress) return    // dedupe (mesma fase, mesmo degrau)
    lastEmittedProgress = progress
    emit({ type: 'phase_update', phase: shownPhase, progress })
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
        // runId (execução) + ts (horário) para o painel distinguir/datar os marcos.
        emit({ type: 'milestone', runId, ts: Date.now(), ...m })
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
    removePid(sessionId)
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
    // A-LIVE-2: concluiu sem erro → fecha a fase atual em 100% (senão ficaria
    // eternamente em ~90% na timeline).
    if (code === 0 && shownPhase) {
      emit({ type: 'phase_update', phase: shownPhase, progress: 100 })
    }
    // Libera o input do operador — o turno do agente terminou.
    broadcast(subscribers, { type: 'agent_status', state: 'idle' })
    // A-STATE (1.3): fases efetivamente EXERCIDAS neste run (atividade > 0). O
    // server usa isto para decidir se "concluído" (chegou a vuln) ou "parado
    // incompleto". blockedBySafeguard/timedOut evitam rotular falha como concluído.
    const phasesReached = Object.keys(phaseActivity).filter((k) => phaseActivity[k] > 0)
    if (opts.onClose) opts.onClose(code, { budgetExceeded, blockedBySafeguard, timedOut, phasesReached })
  })
}

function stop(sessionId) {
  const s = runningSessions.get(sessionId)
  if (s) {
    if (s.timeoutTimer) clearTimeout(s.timeoutTimer)
    killTreeEscalated(s.proc)
    runningSessions.delete(sessionId)
    removePid(sessionId)
  }
}

// Encerra todas as sessões ativas — usado no shutdown gracioso do backend
// para não deixar processos claude (e as ferramentas que eles spawnaram) órfãos.
function stopAll() {
  for (const [sessionId, s] of runningSessions) {
    if (s.timeoutTimer) clearTimeout(s.timeoutTimer)
    killTreeEscalated(s.proc)
    removePid(sessionId)
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
  const s = runningSessions.get(sessionId)
  if (!s) return false
  // Robustez: se o processo morreu SEM disparar 'close' (kill externo, sessão do
  // CLI esgotada, crash silencioso), a entrada fica presa no mapa para sempre —
  // isRunning "mente" que roda, o reconcile por conexão do WS é pulado, e o painel
  // trava eternamente em "rodando" com o input bloqueado. Confirma liveness real:
  //   exitCode preenchido → já encerrou; ou PID não existe mais no OS (kill -0).
  if (s.proc && s.proc.exitCode !== null) { runningSessions.delete(sessionId); removePid(sessionId); return false }
  try {
    if (s.proc?.pid) process.kill(s.proc.pid, 0)
  } catch {
    runningSessions.delete(sessionId)
    removePid(sessionId)
    return false
  }
  return true
}

// P1-20: existe QUALQUER sessão viva (interativa ou agendada) para este
// engagement? Usado pelo scheduler antes de despachar um job agendado, pra não
// pisar numa sessão interativa que já está rodando (e vice-versa, ver `run()`).
function isEngagementRunning(engagementId) {
  for (const [sessionId, s] of runningSessions) {
    if (s.engagementId === engagementId && isRunning(sessionId)) return true
  }
  return false
}

// Esquece o claude session_id desta sessão → o próximo turno começa uma
// conversa nova (CLI enxuto). Usado pela compactação: o estado do engagement
// continua em disco, então a sessão nova o recarrega.
function clearSession(sessionId) {
  claudeSessions.delete(sessionId)
}

module.exports = { run, stop, stopAll, sendInput, isRunning, isEngagementRunning, clearSession, buildAgentEnv, ENV_ALLOWLIST, agentCredential, warnIfSharedCredential, inferPhaseFromEvent, PHASE_ORDER, extractMilestones, buildToolUseEvent, toWsEvent, CLAUDE_BIN, MAX_CONCURRENT_SESSIONS, runningSessions, reconcileOrphanedProcesses, persistPid, removePid, readPidFile, isGroupAlive, PID_FILE }
