// Testes das correções de hardening (ver docs/ROADMAP-HARDENING.md).
// Runner nativo do Node (node --test) — sem dependências extras.
const { test } = require('node:test')
const assert = require('node:assert')

const { isAdminOnlyCommand, ADMIN_ONLY_COMMANDS, isLastAdmin } = require('../src/rbac')
const { deriveState, computeFingerprint } = require('../src/findings-watcher')
const { buildAgentEnv, ENV_ALLOWLIST, inferPhaseFromEvent, PHASE_ORDER,
        extractMilestones, toWsEvent } = require('../src/agent-runner')

// ── SEC-3: RBAC de fases agressivas ────────────────────────────────────────────
test('RBAC: /pentest-exploit e /pentest-post são admin-only', () => {
  assert.equal(isAdminOnlyCommand('/pentest-exploit'), true)
  assert.equal(isAdminOnlyCommand('  /pentest-post agora'), true)
  assert.equal(isAdminOnlyCommand('/pentest-recon'), false)
  assert.equal(isAdminOnlyCommand('rode recon por favor'), false)
  assert.equal(isAdminOnlyCommand(''), false)
})

test('RBAC: lista de comandos agressivos é exatamente exploit/post', () => {
  assert.deepEqual([...ADMIN_ONLY_COMMANDS].sort(), ['pentest-exploit', 'pentest-post'])
})

test('BUG-2: isLastAdmin bloqueia rebaixar/excluir o último admin', () => {
  assert.equal(isLastAdmin('admin', 1), true)   // é o último admin → bloqueia
  assert.equal(isLastAdmin('admin', 2), false)  // há outro admin → permite
  assert.equal(isLastAdmin('user', 1), false)   // alvo não é admin → não se aplica
  assert.equal(isLastAdmin('admin', 0), true)   // defensivo
})

// ── Taxonomia de findings (anti-FP) ─────────────────────────────────────────────
test('deriveState: respeita taxonomia + retrocompat com esquema antigo', () => {
  assert.equal(deriveState({ state: 'confirmed' }), 'confirmed')
  assert.equal(deriveState({ state: 'PROBABLE' }), 'probable')          // case-insensitive
  assert.equal(deriveState({ confirmed: true }), 'confirmed')           // esquema antigo (bool)
  assert.equal(deriveState({ severity: 'info' }), 'informational')
  assert.equal(deriveState({ severity: 'high' }), 'probable')           // não-confirmado c/ severidade
  assert.equal(deriveState({ state: 'lixo', severity: 'low' }), 'probable') // state inválido → infere
})

test('computeFingerprint: estável entre scans e normaliza IDs numéricos', () => {
  const a = computeFingerprint({ type: 'xss', location: '/users/123/profile?x=1', parameter: 'q' })
  const b = computeFingerprint({ type: 'xss', location: '/users/456/profile?x=2', parameter: 'q' })
  assert.equal(a, b)                       // /123 e /456 → /{id}; query descartada
  assert.equal(typeof a, 'string')
  assert.equal(a.length, 16)
  assert.equal(computeFingerprint({ fingerprint: 'fixo' }), 'fixo') // respeita valor explícito
})

// ── SEC-1: allowlist de env no spawn do agente ──────────────────────────────────
test('buildAgentEnv NÃO vaza segredos do backend para o agente', () => {
  process.env.JWT_SECRET = 'super-secreto-de-teste'
  process.env.MONGO_URI = 'mongodb+srv://user:pass@host/db'
  process.env.AZURE_CLIENT_SECRET = 'azure-secreto'
  process.env.ADMIN_PASSWORD = 'senha-admin'

  const env = buildAgentEnv({ ENGAGEMENT_ID: 'x', AGENT_ROLE: 'blackbox', RIFT_ALLOW_AGGRESSIVE: 'false' })

  // Segredos do backend NÃO podem chegar ao processo do claude.
  assert.equal(env.JWT_SECRET, undefined)
  assert.equal(env.MONGO_URI, undefined)
  assert.equal(env.AZURE_CLIENT_SECRET, undefined)
  assert.equal(env.ADMIN_PASSWORD, undefined)

  // Os extras explícitos passam.
  assert.equal(env.ENGAGEMENT_ID, 'x')
  assert.equal(env.AGENT_ROLE, 'blackbox')
  assert.equal(env.RIFT_ALLOW_AGGRESSIVE, 'false')

  // A allowlist mínima passa (PATH existe em qualquer ambiente de execução) E as
  // ferramentas ProjectDiscovery (go/bin) ganham precedência no PATH do agente
  // (senão /usr/bin/httpx = Python httpx quebra a enumeração). O PATH original é
  // preservado ao final.
  if (process.env.PATH) {
    assert.ok(env.PATH.split(':').includes('/home/digitalbath/go/bin'), 'go/bin deve estar no PATH do agente')
    assert.ok(env.PATH === process.env.PATH || env.PATH.includes(process.env.PATH), 'PATH original preservado')
  }
})

test('ENV_ALLOWLIST não contém nenhum segredo conhecido', () => {
  const forbidden = ['JWT_SECRET', 'MONGO_URI', 'AZURE_CLIENT_SECRET', 'AZURE_CLIENT_ID',
    'AZURE_TENANT_ID', 'ADMIN_PASSWORD', 'ADMIN_PASSWORD_HASH', 'ALLOWED_ORIGINS']
  for (const f of forbidden) {
    assert.equal(ENV_ALLOWLIST.includes(f), false, `${f} não deveria estar na allowlist`)
  }
})

// ── A-LIVE-2: inferência de fase a partir da atividade real do agente ────────────
test('inferPhaseFromEvent: mapeia o binário do comando Bash para a fase', () => {
  const P = (args) => inferPhaseFromEvent({ type: 'agent_action', tool: 'Bash', args })
  assert.equal(P('subfinder -d target.com -silent'), 'recon')
  assert.equal(P('dnsx -l subs.txt'), 'recon')
  assert.equal(P('nmap -sV -p- 10.0.0.1'), 'enum')
  assert.equal(P('httpx -l hosts.txt -title'), 'enum')
  assert.equal(P('ffuf -u https://t/FUZZ -w wl.txt'), 'enum')
  assert.equal(P('nuclei -u https://target.com'), 'vuln')
  assert.equal(P('sqlmap -u https://t/?id=1 --batch'), 'vuln')
  assert.equal(P('hydra -l admin -P rockyou.txt ssh://t'), 'exploit')
})

test('inferPhaseFromEvent: a fase segue AÇÃO real, nunca a prosa do agente', () => {
  // binário no comando Bash define a fase
  assert.equal(inferPhaseFromEvent({ type: 'agent_action', tool: 'Bash', args: 'subfinder -d x.com' }), 'recon')
  assert.equal(inferPhaseFromEvent({ type: 'agent_action', tool: 'Bash', args: 'httpx -l subs.txt' }), 'enum')
  assert.equal(inferPhaseFromEvent({ type: 'agent_action', tool: 'Bash', args: 'nuclei -u https://x.com' }), 'vuln')
  // auditoria de TLS é ENUM, não vuln (não pode disparar a fase de vuln cedo)
  assert.equal(inferPhaseFromEvent({ type: 'agent_action', tool: 'Bash', args: 'testssl https://x.com' }), 'enum')
  // PROSA do agente NUNCA move a fase — nem mencionando um slash-command (raiz do
  // "pulou para Vulnerabilidades enquanto ainda fazia recon")
  assert.equal(inferPhaseFromEvent({ type: 'agent_message', text: 'Agora vou rodar /pentest-vuln' }), null)
  assert.equal(inferPhaseFromEvent({ type: 'agent_message', text: 'Rodando /pentest-enum agora' }), null)
  assert.equal(inferPhaseFromEvent({ type: 'agent_message', text: 'depois vou buscar vulnerabilidades' }), null)
  assert.equal(inferPhaseFromEvent({ type: 'agent_action', tool: 'Bash', args: 'cat notes.txt' }), null)
  assert.deepEqual(PHASE_ORDER, ['recon', 'enum', 'vuln', 'exploit', 'post'])
})

// ── A-LIVE-2 (marcos): extração de marcos da SAÍDA das ferramentas ───────────────
test('extractMilestones: deriva marcos concretos da saída de cada ferramenta', () => {
  const kinds = (name, cmd, out) => extractMilestones(name, cmd, out).map((m) => m.kind)
  const first = (name, cmd, out) => extractMilestones(name, cmd, out)[0]

  assert.deepEqual(kinds('Bash', 'subfinder -d acme.com', 'www.acme.com\napi.acme.com\ndev.acme.com'), ['subdomains'])
  assert.equal(first('Bash', 'subfinder -d acme.com', 'www.acme.com\napi.acme.com').label, '2 subdomínios descobertos')
  assert.deepEqual(kinds('Bash', 'nmap -sV acme.com', '22/tcp open ssh\n443/tcp open https'), ['ports'])
  assert.deepEqual(kinds('Bash', 'wafw00f https://acme.com', 'is behind Cloudflare (Cloudflare Inc.) WAF'), ['waf'])
  assert.deepEqual(kinds('Bash', 'katana -u https://acme.com', 'https://acme.com/a\nhttps://acme.com/b'), ['urls'])
  // httpx → host vivo + stack
  assert.deepEqual(kinds('Bash', 'httpx -td', 'https://acme.com [200] [nginx] [PHP]'), ['hosts', 'tech'])
  // sem binário reconhecível / sem sinal → sem marco (evita ruído)
  assert.deepEqual(extractMilestones('Bash', 'cat scope.yaml', 'engagement: x'), [])
  assert.deepEqual(extractMilestones('Read', '', 'algum conteúdo'), [])

  // método HTTP entre colchetes NÃO é tech (corrige "Stack detectada: OPTIONS")
  const tech = extractMilestones('Bash', 'httpx -td', 'https://acme.com [200] [OPTIONS] [nginx] [PHP]').find((m) => m.kind === 'tech')
  assert.ok(tech && !tech.items.includes('OPTIONS'), 'OPTIONS não deve virar tech')
  assert.ok(tech.items.includes('nginx') && tech.items.includes('PHP'))

  // items carregam O QUE foi encontrado (para expandir na UI)
  assert.deepEqual(first('Bash', 'subfinder -d acme.com', 'www.acme.com\napi.acme.com').items, ['www.acme.com', 'api.acme.com'])

  // ANSI (cores) na saída NÃO deve vazar para label/items (WAF "[1;96mCloudflare", URLs ilegíveis)
  const ESC = String.fromCharCode(27)
  const wafAnsi = extractMilestones('Bash', 'wafw00f https://acme.com', `is behind ${ESC}[1;96mCloudflare${ESC}[0m (Cloudflare Inc.) WAF`)[0]
  assert.ok(wafAnsi && !/\x1b|\[1;96m/.test(wafAnsi.label), 'label do WAF não pode conter ANSI')
  assert.ok(/Cloudflare/.test(wafAnsi.label))
  const urlAnsi = extractMilestones('Bash', 'katana -u https://acme.com', `${ESC}[36mhttps://acme.com/login${ESC}[0m\n${ESC}[36mhttps://acme.com/api${ESC}[0m`)[0]
  assert.ok(urlAnsi && urlAnsi.items.every((it) => !/\x1b/.test(it)), 'items de URL não podem conter ANSI')
  assert.ok(urlAnsi.items.includes('https://acme.com/login'))

  // REGRESSÃO: saída de comando que FALHOU não pode virar marco. Antes, o help/erro
  // do httpx Python (/usr/bin/httpx) era contado como "25 hosts vivos".
  const httpxPyErr = 'Usage: httpx [OPTIONS] URL\nError: No such option: -l\nAborted!'
  assert.deepEqual(extractMilestones('Bash', 'httpx -l subs.txt', httpxPyErr), [], 'erro de httpx não gera marco')
  assert.deepEqual(extractMilestones('Bash', 'cat r.txt', 'cat: r.txt: No such file or directory'), [], 'erro de cat não gera marco')
  // httpx sem host reconhecível (mas sem sinal de erro) também NÃO inventa hosts
  assert.deepEqual(extractMilestones('Bash', 'httpx -silent', 'linha qualquer\noutra linha'), [], 'sem host reconhecível → sem marco')
})

// ── Parsing do stream-json: tool_use aninhado no assistant é EMITIDO como ação ────
test('toWsEvent: assistant aninhado emite texto E ação (raiz do "run não mostra nada")', () => {
  const asst = { type: 'assistant', message: { content: [
    { type: 'text', text: 'Vou rodar recon.' },
    { type: 'tool_use', id: 'tu_1', name: 'Bash', input: { command: 'subfinder -d acme.com' } },
  ] } }
  const out = toWsEvent(asst)
  assert.ok(Array.isArray(out) && out.length === 2)
  assert.equal(out[0].type, 'agent_message')
  assert.equal(out[1].type, 'agent_action')
  assert.equal(out[1].tool, 'Bash')
  assert.equal(out[1].args, 'subfinder -d acme.com')
  assert.equal(out[1].toolId, 'tu_1')

  // tool_result (aninhado no user) NÃO é transmitido como ação — vira marco interno.
  const usr = { type: 'user', message: { content: [
    { type: 'tool_result', tool_use_id: 'tu_1', content: [{ type: 'text', text: 'www.acme.com' }] },
  ] } }
  assert.equal(toWsEvent(usr), null)
})

// ── Custo: result deve ler total_cost_usd (nome atual) e cost_usd (legado) ───────
test('toWsEvent(result): emite cost_update de total_cost_usd/cost_usd', () => {
  const costOf = (r) => ((toWsEvent(r) || []).find((e) => e.type === 'cost_update') || {}).usd
  assert.equal(costOf({ type: 'result', total_cost_usd: 0.42, usage: { input_tokens: 100, output_tokens: 50 } }), 0.42)
  assert.equal(costOf({ type: 'result', cost_usd: 0.13, usage: {} }), 0.13)               // legado
  assert.equal(costOf({ type: 'result', usage: { input_tokens: 5 } }), undefined)          // sem custo → sem evento
})
