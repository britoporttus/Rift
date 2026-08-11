const { test } = require('node:test')
const assert = require('node:assert')
const { formatTicket } = require('../src/integrations/ticket-format')

test('título traz severidade por extenso + o título do achado', () => {
  const t = formatTicket({ severity: 'critical', title: 'SQL injection em /api' })
  assert.equal(t.title, '[Crítica] SQL injection em /api')
})

test('corpo inclui alvo, localização, CVSS e seções quando existem', () => {
  const t = formatTicket({
    severity: 'high', title: 'X', cvss: 8.1, target: 'app.corp.com', location: '/login',
    description: 'desc', impact: 'imp', recommendation: 'fix', evidence: 'req/resp',
  })
  assert.match(t.body, /Alvo:\*\* app\.corp\.com/)
  assert.match(t.body, /Localização:\*\* \/login/)
  assert.match(t.body, /CVSS:\*\* 8\.1/)
  assert.match(t.body, /### Descrição/)
  assert.match(t.body, /### Correção/)
})

test('labels são seguras (rift + sev + tipo sem espaço)', () => {
  const t = formatTicket({ severity: 'medium', title: 'x', type: 'Broken Access Control' })
  assert.ok(t.labels.includes('rift'))
  assert.ok(t.labels.includes('sev:medium'))
  assert.ok(t.labels.includes('tipo:broken-access-control'))
})

test('achado mínimo não quebra', () => {
  const t = formatTicket({})
  assert.match(t.title, /Info/)
  assert.ok(t.body.length > 0)
  assert.deepEqual(t.labels, ['rift', 'sev:info'])
})

test('evidência longa é truncada', () => {
  const t = formatTicket({ severity: 'low', title: 'x', evidence: 'A'.repeat(9000) })
  assert.ok(t.body.length < 6000, 'não despeja 9k de evidência no ticket')
})
