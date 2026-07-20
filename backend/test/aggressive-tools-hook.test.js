// P0-7 (auditoria 2026-07-20): o gate de fase agressiva (SEC-3) só existia como
// regex de comando de chat + instrução em linguagem natural no prompt — nada
// tecnicamente impedia sqlmap/hydra/etc de rodar via texto livre, já que o
// agente roda com `--dangerously-skip-permissions` (ignora a allowlist do
// settings.json). Este teste exercita o script REAL do hook (não uma
// reimplementação em JS) nas 4 versões do framework — ver
// docs/ROADMAP-AUDITORIA-2026-07-20.md.
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')

const FRAMEWORK_DIRS = ['pentest-framework', 'pentest-framework-v2', 'pentest-framework-v2-next', 'pentest-framework-3']
const AGENTS_DIR = path.join(__dirname, '..', '..', 'Agentes-Pentest')

function runHook(frameworkDir, { toolName = 'Bash', command, allowAggressive = 'false' } = {}) {
  const hookPath = path.join(AGENTS_DIR, frameworkDir, '.claude', 'hooks', 'aggressive-tools-check.sh')
  const input = JSON.stringify({ tool_name: toolName, tool_input: { command } })
  const out = execFileSync('bash', [hookPath], {
    input,
    env: { ...process.env, RIFT_ALLOW_AGGRESSIVE: allowAggressive },
    encoding: 'utf8',
  })
  return out.trim()
}

for (const dir of FRAMEWORK_DIRS) {
  test(`[${dir}] aggressive-tools-check.sh existe e é executável`, () => {
    const hookPath = path.join(AGENTS_DIR, dir, '.claude', 'hooks', 'aggressive-tools-check.sh')
    assert.ok(fs.existsSync(hookPath), `hook ausente: ${hookPath}`)
    const mode = fs.statSync(hookPath).mode
    assert.ok(mode & 0o111, 'hook deve ser executável')
  })

  test(`[${dir}] bloqueia hydra sem RIFT_ALLOW_AGGRESSIVE`, () => {
    const out = runHook(dir, { command: 'hydra -l admin -P rockyou.txt ssh://10.0.0.5' })
    const parsed = JSON.parse(out)
    assert.equal(parsed.decision, 'block')
  })

  test(`[${dir}] libera hydra com RIFT_ALLOW_AGGRESSIVE=true (admin autorizou)`, () => {
    const out = runHook(dir, { command: 'hydra -l admin -P rockyou.txt ssh://10.0.0.5', allowAggressive: 'true' })
    assert.equal(out, '')
  })

  test(`[${dir}] bloqueia sqlmap --dump sem RIFT_ALLOW_AGGRESSIVE`, () => {
    const out = runHook(dir, { command: 'sqlmap -u https://alvo.com/x?id=1 --batch --dump' })
    const parsed = JSON.parse(out)
    assert.equal(parsed.decision, 'block')
  })

  test(`[${dir}] libera sqlmap de confirmação (sem flag de exfiltração)`, () => {
    const out = runHook(dir, { command: 'sqlmap -u https://alvo.com/x?id=1 --batch' })
    assert.equal(out, '')
  })

  test(`[${dir}] libera ferramentas de recon/enum normais`, () => {
    assert.equal(runHook(dir, { command: 'nmap -sV -p- alvo.com' }), '')
    assert.equal(runHook(dir, { command: 'nuclei -u https://alvo.com -severity critical' }), '')
  })

  test(`[${dir}] ignora tool_name diferente de Bash`, () => {
    const out = runHook(dir, { toolName: 'Read', command: undefined })
    assert.equal(out, '')
  })

  test(`[${dir}] bloqueia impacket-secretsdump sem RIFT_ALLOW_AGGRESSIVE`, () => {
    const out = runHook(dir, { command: 'impacket-secretsdump domain/user:pass@10.0.0.5' })
    const parsed = JSON.parse(out)
    assert.equal(parsed.decision, 'block')
  })

  test(`[${dir}] settings.json referencia o hook no PreToolUse/Bash`, () => {
    const settingsPath = path.join(AGENTS_DIR, dir, '.claude', 'settings.json')
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    const bashHooks = (settings.hooks?.PreToolUse || []).filter((h) => h.matcher === 'Bash')
    const commands = bashHooks.flatMap((h) => h.hooks.map((x) => x.command))
    assert.ok(commands.some((c) => c.includes('aggressive-tools-check.sh')), 'settings.json não referencia o hook')
  })
}
