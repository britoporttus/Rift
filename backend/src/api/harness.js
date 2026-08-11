// Harness de sessão (#3) — pré-voo do pentest autenticado. Só operador INTERNO
// (a requisição sai do IP do Rift para uma URL escolhida pelo usuário: é o mesmo
// vetor de SSRF do ASM, mitigado pelo net-guard dentro do runner). Cliente não
// dispara conexão arbitrária.
const { Router } = require('express')
const { requireAuth } = require('../auth')
const { runSessionCheck } = require('../session-harness')

const router = Router()
// requireAuth(['admin', 'user']) — internos apenas.
router.use(requireAuth(['admin', 'user']))

// POST /api/harness/session — testa a credencial contra o alvo, sem IA.
// body: { loginUrl, username, password, usernameField?, passwordField?, protectedUrl?, successContains?, extraFields? }
router.post('/session', async (req, res) => {
  const { loginUrl, username, password } = req.body ?? {}
  if (!loginUrl || !username || !password) {
    return res.status(400).json({ error: 'loginUrl, username e password são obrigatórios' })
  }
  try {
    const result = await runSessionCheck({
      loginUrl, username, password,
      usernameField: req.body.usernameField || 'username',
      passwordField: req.body.passwordField || 'password',
      extraFields: req.body.extraFields && typeof req.body.extraFields === 'object' ? req.body.extraFields : {},
      protectedUrl: req.body.protectedUrl || null,
      successContains: req.body.successContains || null,
    })
    // NÃO persistimos a credencial aqui — o pré-voo é efêmero; o engagement guarda
    // no cofre em memória por conta própria.
    res.json(result)
  } catch (e) {
    // Erros esperados (anti-SSRF, DNS, timeout) viram 422 com a razão — não 500.
    res.status(422).json({ verdict: 'error', error: e instanceof Error ? e.message : 'falha no teste de conexão' })
  }
})

module.exports = router
