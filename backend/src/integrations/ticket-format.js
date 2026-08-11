// Formatação de ticket (#5) — mapeia um Finding do Rift para um ticket genérico
// { title, body, labels }. Puro e testável; cada adapter (GitHub/Jira/…) traduz
// esse genérico para o formato da sua plataforma. É o núcleo reutilizável da
// integração de ticketing.

const SEV_LABEL = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa', info: 'Info' }

function line(k, v) { return v ? `**${k}:** ${v}\n` : '' }

function formatTicket(f = {}) {
  const sev = (f.severity || 'info').toLowerCase()
  const title = `[${SEV_LABEL[sev] || sev}] ${f.title || 'Achado sem título'}`

  let body = ''
  body += line('Severidade', SEV_LABEL[sev] || sev)
  if (f.cvss != null) body += line('CVSS', String(f.cvss))
  body += line('Alvo', f.target || f.engagementName)
  body += line('Localização', f.location)
  if (f.cwe) body += line('CWE', f.cwe)
  if (f.owasp) body += line('OWASP', f.owasp)
  body += '\n'
  if (f.description) body += `### Descrição\n${f.description}\n\n`
  if (f.impact) body += `### Impacto\n${f.impact}\n\n`
  if (f.evidence) body += `### Evidência\n\`\`\`\n${String(f.evidence).slice(0, 4000)}\n\`\`\`\n\n`
  if (f.recommendation) body += `### Correção\n${f.recommendation}\n\n`
  body += `---\n_Aberto pelo Rift · achado \`${f.id || f._id || ''}\`_`

  // Labels úteis para a plataforma triar. Sem espaços/acentos (GitHub/Jira-safe).
  const labels = ['rift', `sev:${sev}`]
  if (f.type) labels.push(`tipo:${String(f.type).toLowerCase().replace(/\s+/g, '-')}`)

  return { title, body, labels }
}

module.exports = { formatTicket, SEV_LABEL }
