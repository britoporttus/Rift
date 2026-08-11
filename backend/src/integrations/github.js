// Adapter GitHub Issues (#5) — cria um issue a partir de um Finding. Mesmo
// padrão de plugin dos leak-providers: uma interface comum, um arquivo por
// plataforma. Inerte sem token (`needsToken`). O I/O usa o fetch global (Node 20).
const { formatTicket } = require('./ticket-format')

const id = 'github'
const label = 'GitHub Issues'
const needsToken = true
// config: { owner, repo }. token vem separado (guardado cifrado).

function apiBase(config) {
  return `https://api.github.com/repos/${config.owner}/${config.repo}`
}
function headers(token) {
  return {
    'authorization': `Bearer ${token}`,
    'accept': 'application/vnd.github+json',
    'user-agent': 'Rift-Integrations/1.0',
    'x-github-api-version': '2022-11-28',
  }
}

// Testa a conexão: o repo existe e o token enxerga? Retorna { ok, detail }.
async function testConnection(config, token) {
  if (!config?.owner || !config?.repo) return { ok: false, detail: 'informe owner e repo' }
  if (!token) return { ok: false, detail: 'token ausente' }
  try {
    const r = await fetch(apiBase(config), { headers: headers(token) })
    if (r.status === 200) {
      const j = await r.json().catch(() => ({}))
      return { ok: true, detail: `conectado a ${j.full_name || `${config.owner}/${config.repo}`}` }
    }
    if (r.status === 404) return { ok: false, detail: 'repo não encontrado (ou token sem acesso)' }
    if (r.status === 401) return { ok: false, detail: 'token inválido' }
    return { ok: false, detail: `GitHub respondeu ${r.status}` }
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : 'falha de rede' }
  }
}

// Cria o issue. Retorna { url, ref } (ref = número do issue) ou lança.
async function createTicket(finding, config, token) {
  const { title, body, labels } = formatTicket(finding)
  const r = await fetch(`${apiBase(config)}/issues`, {
    method: 'POST', headers: { ...headers(token), 'content-type': 'application/json' },
    body: JSON.stringify({ title, body, labels }),
  })
  if (r.status !== 201) {
    const j = await r.json().catch(() => ({}))
    throw new Error(`GitHub recusou (${r.status}): ${j.message || 'erro'}`)
  }
  const j = await r.json()
  return { url: j.html_url, ref: `#${j.number}` }
}

module.exports = { id, label, needsToken, testConnection, createTicket }
