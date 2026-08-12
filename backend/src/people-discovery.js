// Correlação leve de credenciais (#4) — domínio → pessoas/e-mails → vazamento.
// A parte pura (extrair e-mails de um texto, inferir o padrão, mascarar) mora
// aqui e é testável; o I/O (buscar as páginas do alvo, anti-SSRF, cruzar com
// LeakedCredential) fica no endpoint. Fonte principal = a superfície pública do
// PRÓPRIO alvo (compliant: e-mails que a empresa publica no site dela). Hunter.io
// entra como provider plugável quando houver chave (mesma arquitetura dos leaks).

const { maskAccount } = require('./leaks/mask')

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
// Endereços de papel/genéricos não são "pessoas" — separados do headcount real.
const ROLE_LOCALPARTS = new Set(['info', 'contact', 'contato', 'admin', 'suporte', 'support', 'sac',
  'vendas', 'sales', 'noreply', 'no-reply', 'naoresponda', 'financeiro', 'rh', 'hr', 'marketing',
  'comercial', 'atendimento', 'ouvidoria', 'privacidade', 'privacy', 'dpo', 'security', 'seguranca',
  'abuse', 'postmaster', 'webmaster', 'root', 'mail', 'email'])

// Extrai e-mails de um texto (HTML), opcionalmente só os do domínio-alvo (e
// subdomínios). Retorna lista única, minúscula, sem os obviamente ruidosos
// (imagens/assets que casam o regex por acidente).
function extractEmails(text, domain = null) {
  if (!text || typeof text !== 'string') return []
  const found = new Set()
  for (const m of text.matchAll(EMAIL_RE)) {
    const e = m[0].toLowerCase()
    // descarta falsos-positivos comuns (arquivos, sentry, wixpress, etc.)
    if (/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(e)) continue
    if (domain) {
      const host = e.slice(e.indexOf('@') + 1)
      if (host !== domain && !host.endsWith('.' + domain)) continue
    }
    found.add(e)
  }
  return [...found]
}

function isRole(email) {
  return ROLE_LOCALPARTS.has(email.slice(0, email.indexOf('@')))
}

// Infere o PADRÃO de e-mail corporativo a partir dos e-mails de pessoas (não de
// papel). Ex.: joao.silva@x.com → "first.last". Devolve o padrão mais frequente
// ou null. Útil para o operador saber como derivar outros endereços.
function derivePattern(emails) {
  const votes = {}
  for (const e of emails) {
    if (isRole(e)) continue
    const local = e.slice(0, e.indexOf('@'))
    let pat = null
    if (/^[a-z]+\.[a-z]+$/.test(local)) pat = 'first.last'
    else if (/^[a-z]\.[a-z]+$/.test(local)) pat = 'f.last'
    else if (/^[a-z][a-z]+$/.test(local) && local.length <= 12) pat = 'flast/first'
    else if (/^[a-z]+_[a-z]+$/.test(local)) pat = 'first_last'
    else if (/^[a-z]+-[a-z]+$/.test(local)) pat = 'first-last'
    if (pat) votes[pat] = (votes[pat] || 0) + 1
  }
  const top = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]
  return top ? top[0] : null
}

// Monta o resultado final: separa pessoas de papéis e marca quem aparece nos
// vazamentos. Devolve `email` (real) E `masked` — quem decide o que EXPOR por
// papel (interno vê completo, cliente vê mascarado) é o endpoint. `leakedAccounts`
// = Set de contas mascaradas do módulo de vazamentos (já vêm mascaradas).
function correlate(emails, leakedAccounts = new Set()) {
  return emails.map((email) => {
    const masked = maskAccount(email)
    return {
      email,
      masked,
      role: isRole(email),
      inLeak: leakedAccounts.has(masked),
    }
  }).sort((a, b) => Number(b.inLeak) - Number(a.inLeak) || Number(a.role) - Number(b.role))
}

module.exports = { extractEmails, derivePattern, correlate, isRole, EMAIL_RE, ROLE_LOCALPARTS }
