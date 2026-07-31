// Resolução e execução dos binários do ProjectDiscovery para o scan passivo.
// CRÍTICO: `~/go/bin` vem ANTES do PATH — /usr/bin/httpx é o httpx do Python
// (gotcha conhecido do projeto) e sombrearia o httpx real da PD, dando scans
// rasos. Espelha o que o agent-runner faz com o PATH do agente.
const os = require('os')
const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')

const GOBIN = path.join(os.homedir(), 'go', 'bin')

// PATH com go/bin prependado — usado no env de todo spawn de ferramenta.
const TOOL_PATH = `${GOBIN}${path.delimiter}${process.env.PATH || ''}`

// Resolve o caminho absoluto de uma ferramenta, preferindo go/bin.
function resolveBin(name) {
  const p = path.join(GOBIN, name)
  if (fs.existsSync(p)) return p
  return null   // ausente em go/bin → o chamador decide (pular etapa ou tentar PATH)
}

function hasBin(name) {
  return !!resolveBin(name)
}

// Executa uma ferramenta e resolve com o stdout completo. Falha de binário/timeout
// NUNCA rejeita "para cima" de forma fatal — devolve { ok:false } para o scanner
// degradar graciosamente (uma etapa que quebra não derruba o scan inteiro).
function runTool(name, args, { timeoutMs = 120000, maxBuffer = 32 * 1024 * 1024, input = null, cwd = null } = {}) {
  return new Promise((resolve) => {
    const bin = resolveBin(name)
    if (!bin) return resolve({ ok: false, stdout: '', reason: 'binary_missing', name })

    const child = execFile(bin, args, {
      timeout: timeoutMs,
      maxBuffer,
      cwd: cwd || undefined,   // httpx -ss grava PNGs em ./output/screenshot; controlamos o dir via cwd
      env: { ...process.env, PATH: TOOL_PATH },
    }, (err, stdout, stderr) => {
      if (err) {
        // timeout (SIGTERM) ou exit != 0. Muitas ferramentas saem !=0 quando não
        // acham nada — ainda assim entregamos o stdout parcial que houver.
        return resolve({ ok: false, stdout: stdout || '', stderr: stderr || '', reason: err.killed ? 'timeout' : 'exit_error', name })
      }
      resolve({ ok: true, stdout: stdout || '', stderr: stderr || '', name })
    })

    if (input != null) {
      try { child.stdin.write(input); child.stdin.end() } catch {}
    }
  })
}

module.exports = { GOBIN, TOOL_PATH, resolveBin, hasBin, runTool }
