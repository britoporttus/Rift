const { Router } = require('express')
const msal = require('@azure/msal-node')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const https = require('https')

const states = new Map()

const ADMIN_GROUP_IDS = (process.env.AZURE_ADMIN_GROUP_IDS || '')
  .split(',').map(s => s.trim()).filter(Boolean)

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

  // Determina role via Graph API
  let role = 'user'
  if (ADMIN_GROUP_IDS.length > 0 && tokenResponse.accessToken) {
    const userGroups = await getUserGroups(tokenResponse.accessToken)
    if (userGroups.some(g => ADMIN_GROUP_IDS.includes(g))) {
      role = 'admin'
    }
  }

  const user = {
    id: tokenResponse.account.homeAccountId,
    email,
    name,
    role,
  }

  console.log(`[SSO] login: ${email} (${role})`)

  const token = jwt.sign({ user }, process.env.JWT_SECRET, { expiresIn: '8h' })
  res.redirect(`${process.env.FRONTEND_URL}/login?token=${token}`)
})

module.exports = router
