// Prova de posse de domínio (2026-08-03).
//
// Motivação: `Domain.authorized` era um toggle do admin. Com cliente
// self-service, qualquer um poderia cadastrar o domínio de um terceiro e
// escaneá-lo A PARTIR DO NOSSO IP — o ônus é nosso, não de quem cadastrou.
//
// O teste mais importante deste arquivo é o de SSRF: a checagem HTTP é uma
// requisição a um host escolhido pelo usuário, ou seja, exatamente o padrão que
// o P0-1 da auditoria fechou no scanner. Não podia nascer um caminho novo com o
// mesmo buraco.
const { test } = require('node:test')
const assert = require('node:assert')

const {
  generateToken, verificationInstructions, tokenMatches,
  verifyDns, verifyHttp, verifyDomain, resolvePublicIps, TXT_PREFIX, HTTP_PATH,
} = require('../src/domain-verify')

const TOKEN = 'rift-verify-abc123'

// ── token ───────────────────────────────────────────────────────────────────

test('token é opaco, longo e diferente a cada chamada', () => {
  const a = generateToken(), b = generateToken()
  assert.notEqual(a, b, 'token repetido permitiria reusar prova antiga')
  assert.match(a, /^rift-verify-/)
  assert.ok(a.length > 30)
})

test('comparação de token não aceita prefixo nem string vazia', () => {
  assert.equal(tokenMatches(TOKEN, TOKEN), true)
  assert.equal(tokenMatches('rift-verify-abc', TOKEN), false, 'prefixo não pode passar')
  assert.equal(tokenMatches('', ''), false, 'vazio contra vazio não é prova')
  assert.equal(tokenMatches(null, TOKEN), false)
  assert.equal(tokenMatches(`  ${TOKEN}  `, TOKEN), true, 'espaço em volta é comum em arquivo/TXT')
})

test('as instruções apontam para os locais padrão', () => {
  const i = verificationInstructions('acme.com', TOKEN)
  assert.equal(i.dns.name, `${TXT_PREFIX}.acme.com`)
  assert.equal(i.dns.value, TOKEN)
  assert.equal(i.http.url, `https://acme.com${HTTP_PATH}`)
})

// ── DNS ─────────────────────────────────────────────────────────────────────

const dnsWith = (records, err) => ({
  resolveTxt: async () => { if (err) throw err; return records },
  lookup: async () => [{ address: '93.184.216.34' }],
})

test('DNS: TXT com o token verifica', async () => {
  const r = await verifyDns('acme.com', TOKEN, dnsWith([[TOKEN]]))
  assert.equal(r.ok, true)
  assert.equal(r.method, 'dns')
})

test('DNS: TXT fragmentado em chunks é remontado (o resolver quebra em 255 chars)', async () => {
  const r = await verifyDns('acme.com', TOKEN, dnsWith([['rift-verify-', 'abc123']]))
  assert.equal(r.ok, true, 'TXT longo chega em pedaços — juntar é obrigatório')
})

test('DNS: token errado NÃO verifica', async () => {
  const r = await verifyDns('acme.com', TOKEN, dnsWith([['rift-verify-outro']]))
  assert.equal(r.ok, false)
  assert.match(r.error, /não confere/)
})

test('DNS: ausência de registro dá mensagem sobre propagação, não erro genérico', async () => {
  const e = new Error('x'); e.code = 'ENODATA'
  const r = await verifyDns('acme.com', TOKEN, dnsWith(null, e))
  assert.equal(r.ok, false)
  assert.match(r.error, /propaga/i)
})

// ── SSRF (o teste que mais importa) ─────────────────────────────────────────

test('HTTP: domínio que resolve para IP INTERNO é recusado antes de conectar', async () => {
  for (const ip of ['127.0.0.1', '169.254.169.254', '10.0.0.5', '192.168.1.1', '::1']) {
    const resolver = { lookup: async () => [{ address: ip }] }
    let conectou = false
    const r = await verifyHttp('interno.acme.com', TOKEN, {
      resolver, fetchBody: async () => { conectou = true; return TOKEN },
    })
    assert.equal(r.ok, false, `${ip} não pode verificar`)
    assert.equal(conectou, false, `NUNCA pode conectar em ${ip}`)
    assert.match(r.error, /rede interna/)
  }
})

test('HTTP: basta UM dos IPs ser interno para recusar (round-robin misto)', async () => {
  const resolver = { lookup: async () => [{ address: '93.184.216.34' }, { address: '127.0.0.1' }] }
  let conectou = false
  const r = await verifyHttp('misto.com', TOKEN, { resolver, fetchBody: async () => { conectou = true; return TOKEN } })
  assert.equal(r.ok, false, 'a conexão escolheria qualquer um dos IPs — recusar é o único seguro')
  assert.equal(conectou, false)
})

test('HTTP: literal de IP não é domínio verificável', async () => {
  await assert.rejects(() => resolvePublicIps('169.254.169.254'), /Literal de IP/)
})

test('HTTP: conecta no IP já validado, não no hostname (fecha DNS rebinding)', async () => {
  const resolver = { lookup: async () => [{ address: '93.184.216.34' }] }
  let ipUsado = null
  const r = await verifyHttp('acme.com', TOKEN, {
    resolver,
    fetchBody: async (_url, ip) => { ipUsado = ip; return TOKEN },
  })
  assert.equal(r.ok, true)
  assert.equal(ipUsado, '93.184.216.34', 'tem que conectar no IP validado, senão o DNS pode mudar no meio')
})

// ── HTTP: caminho feliz e conteúdo errado ───────────────────────────────────

test('HTTP: arquivo com o token verifica', async () => {
  const r = await verifyHttp('acme.com', TOKEN, {
    resolver: { lookup: async () => [{ address: '93.184.216.34' }] },
    fetchBody: async () => `${TOKEN}\n`,
  })
  assert.equal(r.ok, true)
  assert.equal(r.method, 'http')
})

test('HTTP: conteúdo diferente NÃO verifica', async () => {
  const r = await verifyHttp('acme.com', TOKEN, {
    resolver: { lookup: async () => [{ address: '93.184.216.34' }] },
    fetchBody: async () => '<html>404</html>',
  })
  assert.equal(r.ok, false)
  assert.match(r.error, /não confere/)
})

// ── orquestração ────────────────────────────────────────────────────────────

test('verifyDomain tenta DNS primeiro (prova mais forte) e cai pro HTTP', async () => {
  const ordem = []
  const deps = {
    resolver: {
      resolveTxt: async () => { ordem.push('dns'); return [['errado']] },
      lookup: async () => [{ address: '93.184.216.34' }],
    },
    fetchBody: async () => { ordem.push('http'); return TOKEN },
  }
  const r = await verifyDomain('acme.com', TOKEN, deps)
  assert.equal(r.ok, true)
  assert.equal(r.method, 'http')
  assert.deepEqual(ordem, ['dns', 'http'], 'DNS tem que ser tentado antes')
})

test('falhando os dois, o erro explica AS DUAS tentativas', async () => {
  const r = await verifyDomain('acme.com', TOKEN, {
    resolver: {
      resolveTxt: async () => [['errado']],
      lookup: async () => [{ address: '93.184.216.34' }],
    },
    fetchBody: async () => 'nada',
  })
  assert.equal(r.ok, false)
  assert.equal(r.attempts.length, 2)
  assert.match(r.error, /\|/, 'a UI precisa dos dois motivos para instruir o usuário')
})
