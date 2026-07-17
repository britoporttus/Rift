'use strict'
const fs = require('fs')
const path = require('path')
const os = require('os')

// Diretórios extra onde ferramentas de pentest costumam viver além do PATH do
// processo do backend: go/bin (ProjectDiscovery) e ~/.local/bin (pipx: az/scout/
// prowler). Mesmos dirs que o agent-runner prependa ao PATH do agente.
const EXTRA_DIRS = [
  process.env.AGENT_TOOL_PATH || '/home/digitalbath/go/bin',
  path.join(os.homedir(), '.local', 'bin'),
]

function candidateDirs(extraDirs = []) {
  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  return [...extraDirs, ...EXTRA_DIRS, ...pathDirs]
}

// Um binário está presente se existe e é executável em algum dir candidato.
function hasTool(tool, extraDirs = []) {
  return candidateDirs(extraDirs).some((d) => {
    try { fs.accessSync(path.join(d, tool), fs.constants.X_OK); return true } catch { return false }
  })
}

// Retorna a lista de ferramentas AUSENTES (subconjunto de `tools`). [] = tudo presente.
function missingTools(tools, extraDirs = []) {
  return (tools || []).filter((t) => !hasTool(t, extraDirs))
}

module.exports = { hasTool, missingTools, candidateDirs, EXTRA_DIRS }
