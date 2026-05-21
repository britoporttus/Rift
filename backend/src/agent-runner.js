const { spawn } = require('child_process')

const FRAMEWORK_PATH = process.env.FRAMEWORK_PATH || '/home/digitalbath/pentest-framework-v2'

// engagementId -> { proc, subscribers: Set<WebSocket> }
const sessions = new Map()

function broadcast(subscribers, event) {
  const json = JSON.stringify(event)
  for (const ws of subscribers) {
    if (ws.readyState === 1) ws.send(json)
  }
}

function parseStreamLine(line) {
  try { return JSON.parse(line) } catch { return null }
}

// Map claude --output-format stream-json events to our WS contract
function toWsEvent(parsed, rawLine) {
  if (!parsed) {
    const text = rawLine.trim()
    return text ? { type: 'agent_message', text } : null
  }

  switch (parsed.type) {
    case 'assistant': {
      const content = parsed.message?.content
      if (!Array.isArray(content)) return null
      const block = content.find((b) => b.type === 'text')
      return block ? { type: 'agent_message', text: block.text } : null
    }
    case 'tool_use':
      return {
        type: 'agent_action',
        tool: parsed.name || parsed.tool || 'tool',
        status: 'running',
        args: parsed.input ? JSON.stringify(parsed.input).slice(0, 300) : '',
      }
    case 'tool_result': {
      const out = Array.isArray(parsed.content)
        ? parsed.content.find((b) => b.type === 'text')?.text ?? ''
        : String(parsed.output ?? '')
      return {
        type: 'agent_action',
        tool: parsed.tool_use_id ? `(${parsed.tool_use_id})` : 'tool',
        status: 'done',
        result: out.slice(0, 500),
      }
    }
    case 'result':
      if (parsed.cost_usd != null) {
        return {
          type: 'cost_update',
          usd: parsed.cost_usd,
          tokens: parsed.usage?.output_tokens ?? 0,
        }
      }
      return parsed.result ? { type: 'agent_message', text: parsed.result } : null
    default:
      return null
  }
}

function run(engagementId, prompt, subscribers) {
  if (sessions.has(engagementId)) {
    broadcast(subscribers, { type: 'agent_message', text: '⚠️ Sessão já ativa para este engagement.' })
    return
  }

  const proc = spawn(
    'claude',
    ['--output-format', 'stream-json', '--print', prompt, '--no-color'],
    { cwd: FRAMEWORK_PATH, env: { ...process.env, ENGAGEMENT_ID: engagementId } }
  )

  sessions.set(engagementId, { proc, subscribers })
  broadcast(subscribers, { type: 'agent_thinking', text: 'Agente iniciando...' })

  let buf = ''

  proc.stdout.on('data', (chunk) => {
    buf += chunk.toString()
    const lines = buf.split('\n')
    buf = lines.pop() // keep incomplete last line
    for (const line of lines) {
      if (!line.trim()) continue
      const event = toWsEvent(parseStreamLine(line), line)
      if (event) broadcast(subscribers, event)
    }
  })

  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim()
    if (text) broadcast(subscribers, { type: 'agent_message', text: `[log] ${text}` })
  })

  proc.on('close', (code) => {
    if (buf.trim()) {
      const event = toWsEvent(parseStreamLine(buf), buf)
      if (event) broadcast(subscribers, event)
    }
    sessions.delete(engagementId)
    broadcast(subscribers, { type: 'agent_message', text: `[agente encerrado — código ${code}]` })
  })
}

function stop(engagementId) {
  const s = sessions.get(engagementId)
  if (s) { s.proc.kill('SIGTERM'); sessions.delete(engagementId) }
}

function sendInput(engagementId, text) {
  const s = sessions.get(engagementId)
  if (!s) return false
  s.proc.stdin.write(text + '\n')
  return true
}

function isRunning(engagementId) {
  return sessions.has(engagementId)
}

module.exports = { run, stop, sendInput, isRunning }
