const { Router } = require('express')
const msal = require('@azure/msal-node')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')

const ALLOWED_DOMAINS = ['porttus.com', 'trustsis.com']
const states = new Map() // state → expiry (CSRF protection)

// Group object IDs from Azure AD that map to Rift admin role.
// Set AZURE_ADMIN_GROUP_IDS=<guid1>,<guid2> in .env to enable group-based admin.
const ADMIN_GROUP_IDS = (process.env.AZURE_ADMIN_GROUP_IDS || '')
  .split(',').map(s => s.trim()).filter(Boolean)

let _msalClient = null
function getMsalClient() {
  if (!_msalClient) {
    _msalClient = new msal.ConfidentialClientApplication({
      auth: {
        clientId: process.env.AZURE_CLIENT_ID,
        authority: 'https://login.microsoftonline.com/common',
        clientSecret: process.env.AZURE_CLIENT_SECRET,
      },
    })
  }
  return _msalClient
}

const router = Router()

// Step 1 — redirect to Microsoft login
router.get('/microsoft', async (req, res) => {
  const state = crypto.randomBytes(16).toString('hex')
  states.set(state, Date.now() + 10 * 60 * 1000) // 10 min TTL

  try {
    const url = await getMsalClient().getAuthCodeUrl({
      scopes: ['openid', 'profile', 'email'],
      redirectUri: process.env.AZURE_REDIRECT_URI,
      state,
    })
    res.redirect(url)
  } catch (err) {
    console.error('[SSO] getAuthCodeUrl failed:', err.message)
    res.redirect(`${process.env.FRONTEND_URL}/login?error=sso_unavailable`)
  }
})

// Step 2 — Microsoft redirects back here
router.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query

  if (error) {
    const msg = error === 'access_denied'
      ? 'Acesso negado pelo administrador. Solicite acesso ao Rift.'
      : (error_description || error)
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(msg)}`)
  }

  // Validate CSRF state
  const expiry = states.get(state)
  if (!expiry || Date.now() > expiry) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=invalid_state`)
  }
  states.delete(state)

  let tokenResponse
  try {
    tokenResponse = await getMsalClient().acquireTokenByCode({
      code,
      scopes: ['openid', 'profile', 'email'],
      redirectUri: process.env.AZURE_REDIRECT_URI,
    })
  } catch (err) {
    console.error('[SSO] token exchange failed:', err.message)
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=token_exchange_failed`)
  }

  const email = (tokenResponse.account?.username || '').toLowerCase()
  const domain = email.split('@')[1]

  if (!ALLOWED_DOMAINS.includes(domain)) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=${encodeURIComponent('Domínio não autorizado. Use @porttus.com ou @trustsis.com.')}`)
  }

  // Profile info from ID token claims
  const claims = tokenResponse.idTokenClaims || {}
  const name = claims.name || tokenResponse.account?.name || email.split('@')[0]
  const jobTitle = claims.jobTitle || claims.job_title || ''
  const department = claims.department || ''

  // Role: admin if user's groups contain an admin group ID (requires group claims configured)
  const userGroups = Array.isArray(claims.groups) ? claims.groups : []
  const role = ADMIN_GROUP_IDS.length > 0 && userGroups.some(g => ADMIN_GROUP_IDS.includes(g))
    ? 'admin'
    : 'user'

  const user = {
    id: tokenResponse.account.homeAccountId,
    email,
    name,
    role,
    ...(jobTitle && { jobTitle }),
    ...(department && { department }),
  }

  console.log(`[SSO] login: ${email} (${role})${jobTitle ? ` — ${jobTitle}` : ''}`)

  const token = jwt.sign({ user }, process.env.JWT_SECRET, { expiresIn: '8h' })
  res.redirect(`${process.env.FRONTEND_URL}/login?token=${token}`)
})

module.exports = router
