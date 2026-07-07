// SEC-3: detecção server-side de comandos restritos a admin (fases agressivas).
// Extraído de server.js para ser testável e reutilizável. É o fast-path do gate;
// o gate por-run é o env RIFT_ALLOW_AGGRESSIVE=false + a regra dura no contexto.
const ADMIN_ONLY_COMMANDS = ['pentest-exploit', 'pentest-post']

function isAdminOnlyCommand(text) {
  const m = String(text).match(/^\s*\/([\w-]+)/)
  return m ? ADMIN_ONLY_COMMANDS.includes(m[1]) : false
}

module.exports = { ADMIN_ONLY_COMMANDS, isAdminOnlyCommand }
