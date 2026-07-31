// takeover.js — heurística pura de subdomain takeover (CNAME pendente).
const { test } = require('node:test')
const assert = require('node:assert')
const { matchService, detectTakeover } = require('../src/asm/takeover')

test('matchService: casa serviços conhecidos por sufixo', () => {
  assert.equal(matchService('rift.github.io'), 'GitHub Pages')
  assert.equal(matchService('app.herokuapp.com.'), 'Heroku')       // ponto final normalizado
  assert.equal(matchService('bucket.s3.amazonaws.com'), 'AWS S3')
  assert.equal(matchService('x.azurewebsites.net'), 'Azure')
  assert.equal(matchService('meu-site.netlify.app'), 'Netlify')
})

test('matchService: CNAME de terceiro desconhecido → null', () => {
  assert.equal(matchService('cdn.exemplo-proprio.com'), null)
  assert.equal(matchService(''), null)
  assert.equal(matchService(null), null)
})

test('detectTakeover: CNAME p/ serviço conhecido + NXDOMAIN → candidato medium nomeando o serviço', () => {
  const r = detectTakeover({ host: 'antigo.alvo.com', cname: 'antigo-app.herokuapp.com', ips: [], nxdomain: true })
  assert.ok(r)
  assert.equal(r.severity, 'medium')
  assert.equal(r.service, 'Heroku')
  assert.match(r.label, /Heroku/)
})

test('detectTakeover: CNAME dangling p/ domínio qualquer (NXDOMAIN) → candidato genérico', () => {
  const r = detectTakeover({ host: 'x.alvo.com', cname: 'coisa-apagada.exemplo.net', ips: [], nxdomain: true })
  assert.ok(r)
  assert.equal(r.service, null)
  assert.match(r.label, /dangling/)
})

test('detectTakeover: host que RESOLVE não é sinalizado no passivo (nuclei confirma)', () => {
  const r = detectTakeover({ host: 'vivo.alvo.com', cname: 'vivo.github.io', ips: ['185.199.108.153'], nxdomain: false })
  assert.equal(r, null)
})

test('detectTakeover: falha transitória (sem NXDOMAIN) não vira dangling', () => {
  const r = detectTakeover({ host: 'x.alvo.com', cname: 'app.herokuapp.com', ips: [], nxdomain: false })
  assert.equal(r, null)
})

test('detectTakeover: sem CNAME → null (não é takeover)', () => {
  assert.equal(detectTakeover({ host: 'x.alvo.com', cname: null, ips: [], nxdomain: true }), null)
})
