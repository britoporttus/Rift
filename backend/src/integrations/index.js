// Registro de adapters de integração (#5) — mesmo padrão dos leak-providers.
// Novos destinos (Jira, Azure DevOps) entram como mais um arquivo aqui, sem
// tocar no resto. Cada adapter: { id, label, needsToken, testConnection, createTicket }.
const github = require('./github')

const ADAPTERS = [github]
const byId = Object.fromEntries(ADAPTERS.map((a) => [a.id, a]))

// Catálogo para a UI (sem segredos). `available` = adapters que existem;
// próximos (Jira/Azure) aparecem como "em breve".
function catalog() {
  return [
    ...ADAPTERS.map((a) => ({ id: a.id, label: a.label, needsToken: a.needsToken, available: true })),
    { id: 'jira', label: 'Jira', needsToken: true, available: false },
    { id: 'azure-devops', label: 'Azure DevOps', needsToken: true, available: false },
  ]
}

function getAdapter(id) { return byId[id] || null }

module.exports = { catalog, getAdapter, ADAPTERS }
