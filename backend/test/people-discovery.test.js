const { test } = require('node:test')
const assert = require('node:assert')
const { extractEmails, derivePattern, correlate, isRole } = require('../src/people-discovery')

test('extractEmails: pega e-mails, minúsculo, único; filtra por domínio', () => {
  const html = `<a href="mailto:Joao.Silva@corp.com">João</a> contato@corp.com ruido@outro.com
                logo@corp.com.png joao.silva@corp.com`
  const all = extractEmails(html)
  assert.ok(all.includes('joao.silva@corp.com'))
  assert.ok(all.includes('ruido@outro.com'))
  assert.ok(!all.some((e) => e.endsWith('.png')), 'asset .png não é e-mail')
  const onlyCorp = extractEmails(html, 'corp.com')
  assert.ok(onlyCorp.includes('joao.silva@corp.com'))
  assert.ok(!onlyCorp.includes('ruido@outro.com'), 'filtrado por domínio')
})

test('extractEmails: inclui subdomínio do alvo', () => {
  const r = extractEmails('ana@mail.corp.com', 'corp.com')
  assert.deepEqual(r, ['ana@mail.corp.com'])
})

test('isRole separa endereço de papel de pessoa', () => {
  assert.ok(isRole('contato@corp.com'))
  assert.ok(isRole('noreply@corp.com'))
  assert.ok(!isRole('joao.silva@corp.com'))
})

test('derivePattern infere o formato dominante (ignora papéis)', () => {
  const emails = ['joao.silva@corp.com', 'maria.souza@corp.com', 'contato@corp.com', 'ana.lima@corp.com']
  assert.equal(derivePattern(emails), 'first.last')
})

test('derivePattern retorna null sem sinal', () => {
  assert.equal(derivePattern(['contato@corp.com', 'x1y2z3@corp.com']), null)
})

test('correlate mascara, marca vazados e ordena vazado→pessoa→papel', () => {
  const emails = ['joao.silva@corp.com', 'contato@corp.com', 'ana.lima@corp.com']
  // conta vazada (já mascarada, como vem do LeakedCredential)
  const leaked = new Set(['a******a@corp.com'])   // corresponde ao mascarado de ana.lima
  const out = correlate(emails, leaked)
  const ana = out.find((p) => p.masked.startsWith('a'))
  assert.equal(ana.inLeak, true)
  assert.equal(out[0].inLeak, true, 'vazado vem primeiro')
  assert.ok(out.every((p) => p.masked.includes('*')), 'tudo mascarado (LGPD)')
})
