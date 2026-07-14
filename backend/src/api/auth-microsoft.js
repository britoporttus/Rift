const { Router } = require('express')
const msal = require('@azure/msal-node')
const crypto = require('crypto')
const https = require('https')
const User = require('../models/User')
const { signToken, COOKIE_NAME, cookieOptions } = require('../auth')

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

// Busca grupos via Graph API — mais confiável que claims do token
// (token claims podem omitir grupos se o usuário tiver muitos)
async function getUserGroups(accessToken) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'graph.microsoft.com',
      path: '/v1.0/me/memberOf?$select=id&$top=100',
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve((json.value || []).map(g => g.id))
        } catch { resolve([]) }
      })
    })
    req.on('error', () => resolve([]))
    req.end()
  })
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

  // Upsert usuário no MongoDB
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
  res.cookie(COOKIE_NAME, entry.token, cookieOptions)
  res.json({ ok: true })
})

module.exports = router
