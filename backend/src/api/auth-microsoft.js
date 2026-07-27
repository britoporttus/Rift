const { Router } = require('express')
const msal = require('@azure/msal-node')
const crypto = require('crypto')
const https = require('https')
const User = require('../models/User')
const { signToken, COOKIE_NAME, cookieOptionsFor } = require('../auth')

const states = new Map()
// Códigos de uso único para troca segura do JWT após o callback do SSO.
// Evita expor o token na URL (?token=) — que vaza em histórico, Referer e logs.
const authCodes = new Map()

const ADMIN_GROUP_IDS = (process.env.AZURE_ADMIN_GROUP_IDS || '')
  .split(',').map(s => s.trim()).filter(Boolean)

// Allowlist de domínios validada no SERVIDOR (não confiar só no Enterprise App).
const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || 'porttus.com,trustsis.com')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

function isAllowedDomain(email) {
  if (!ALLOWED_EMAIL_DOMAINS.length) return true
  const domain = String(email).split('@')[1]?.toLowerCase()
  return !!domain && ALLOWED_EMAIL_DOMAINS.includes(domain)
}

// Remove códigos/estados expirados periodicamente (evita vazamento de memória).
function pruneExpired() {
  const now = Date.now()
  for (const [k, exp] of states) if (now > exp) states.delete(k)
  for (const [k, v] of authCodes) if (now > v.expiry) authCodes.delete(k)
}
setInterval(pruneExpired, 5 * 60 * 1000).unref()

let _msalClient = null
function getMsalClient() {
  if (!_msalClient) {
    _msalClient = new msal.ConfidentialClientApplication({
      auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        // Tenant-specific: garante que "Assignment Required" se aplica a todos,
        // incluindo guests de outros tenants (trustsis.com via B2B).
        // Com 'common', usuários da trustsis autenticavam no próprio tenant deles
        // e bypassavam a restrição do Enterprise App.
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
      },
    })
  }
  return _msalClient
}

// Uma página do Graph API. `pathOrUrl` aceita tanto um path relativo (1ª
// página) quanto a URL absoluta de `@odata.nextLink` (páginas seguintes).
function graphRequestPage(pathOrUrl, accessToken) {
  return new Promise((resolve) => {
    let hostname = 'graph.microsoft.com', path = pathOrUrl
    if (/^https?:\/\//.test(pathOrUrl)) {
      const u = new URL(pathOrUrl)
      hostname = u.hostname
      path = u.pathname + u.search
    }
    const options = { hostname, path, method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch { resolve({}) }
      })
    })
    req.on('error', () => resolve({}))
    req.end()
  })
}

// P2-32 (auditoria 2026-07-20): sem paginação, um admin legítimo membro de
// >100 grupos AAD com o grupo-admin além da primeira página não recebia a
// role — falha para o lado seguro (sem escalação indevida), mas afeta
// disponibilidade (admin de verdade sem acesso admin). Segue `@odata.nextLink`
// até esgotar ou até o teto de segurança (nunca faz loop sem fim).
const MAX_GROUP_PAGES = 20

// Busca grupos via Graph API — mais confiável que claims do token
// (token claims podem omitir grupos se o usuário tiver muitos)
async function getUserGroups(accessToken) {
  const ids = []
  let next = '/v1.0/me/memberOf?$select=id&$top=100'
  for (let page = 0; page < MAX_GROUP_PAGES && next; page++) {
    const json = await graphRequestPage(next, accessToken)
    ids.push(...(json.value || []).map(g => g.id))
    next = json['@odata.nextLink'] || null
  }
  return ids
}

const router = Router()

router.get('/microsoft', async (req, res) => {
  const state = crypto.randomBytes(16).toString('hex')
  states.set(state, Date.now() + 10 * 60 * 1000)

  try {
    const url = await getMsalClient().getAuthCodeUrl({
      scopes: ['openid', 'profile', 'email', 'User.Read', 'GroupMember.Read.All'],
      redirectUri: process.env.AZURE_REDIRECT_URI,
      state,
    })
    res.redirect(url)
  } catch (err) {
    console.error('[SSO] getAuthCodeUrl failed:', err.message)
    res.redirect(`${process.env.FRONTEND_URL}/login?error=sso_unavailable`)
  }
})

router.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query

  if (error) {
    const msg = error === 'access_denied'
      ? 'Acesso negado. Solicite ao administrador que atribua seu acesso ao Rift.'
      : (error_description || error)
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(msg)}`)
  }

  const expiry = states.get(state)
  if (!expiry || Date.now() > expiry) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=invalid_state`)
  }
  states.delete(state)

  let tokenResponse
  try {
    tokenResponse = await getMsalClient().acquireTokenByCode({
      code,
      scopes: ['openid', 'profile', 'email', 'User.Read', 'GroupMember.Read.All'],
      redirectUri: process.env.AZURE_REDIRECT_URI,
    })
  } catch (err) {
    console.error('[SSO] token exchange failed:', err.message)
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=token_exchange_failed`)
  }

  const email = (tokenResponse.account?.username || '').toLowerCase()
  const claims = tokenResponse.idTokenClaims || {}
  const name = claims.name || tokenResponse.account?.name || email.split('@')[0]
  const azureId = tokenResponse.account.homeAccountId

  // Authorization: rejeitar domínios fora da allowlist no servidor.
  // (Sem isso, qualquer conta Microsoft que autentique seria provisionada.)
  if (!isAllowedDomain(email)) {
    console.warn(`[SSO] login bloqueado — domínio não permitido: ${email}`)
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=domain_not_allowed`)
  }

  // Determina role via Graph API
  let role = 'user'
  if (ADMIN_GROUP_IDS.length > 0 && tokenResponse.accessToken) {
    const userGroups = await getUserGroups(tokenResponse.accessToken)
    if (userGroups.some(g => ADMIN_GROUP_IDS.includes(g))) {
      role = 'admin'
    }
  }

  // Upsert usuário no MongoDB — `role` é SEMPRE recalculado a partir do grupo AAD
  // e SOBRESCREVE qualquer valor setado manualmente via PATCH /api/users/:id.
  // P2-31 (auditoria 2026-07-20): comportamento INTENCIONAL — SSO/grupo AAD é a
  // fonte da verdade de role para contas 'microsoft' (falha para o lado seguro:
  // sem grupo-admin configurado → sempre 'user', nunca escala sozinho). Um admin
  // que promover/rebaixar manualmente uma conta SSO verá a mudança revertida no
  // PRÓXIMO login dessa conta — ver aviso equivalente em api/users.js#PATCH.
  const dbUser = await User.findOneAndUpdate(
    { email },
    { name, role, provider: 'microsoft', azureId, lastLogin: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  console.log(`[SSO] login: ${email} (${role})`)

  // Emite um código de uso único em vez do JWT na URL.
  const token = signToken(dbUser)
  const oneTimeCode = crypto.randomBytes(32).toString('hex')
  authCodes.set(oneTimeCode, { token, expiry: Date.now() + 60 * 1000 }) // válido por 60s
  res.redirect(`${process.env.FRONTEND_URL}/login?code=${oneTimeCode}`)
})

// POST /api/auth/exchange — troca o código de uso único pelo JWT (consome o código).
router.post('/exchange', (req, res) => {
  const { code } = req.body ?? {}
  const entry = code && authCodes.get(code)
  if (!entry || Date.now() > entry.expiry) {
    if (code) authCodes.delete(code)
    return res.status(400).json({ error: 'Código inválido ou expirado' })
  }
  authCodes.delete(code) // uso único
  res.cookie(COOKIE_NAME, entry.token, cookieOptionsFor(req))
  res.json({ ok: true })
})

module.exports = router
module.exports.getUserGroups = getUserGroups
module.exports.MAX_GROUP_PAGES = MAX_GROUP_PAGES
