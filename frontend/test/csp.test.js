// P0-4 (auditoria 2026-07-20): a aplicação subia sem NENHUM security header.
// Trava o contrato mínimo da CSP para não regredir silenciosamente (ex.: um
// wildcard adicionado às pressas pra "resolver" um bloqueio no console).
const { test } = require('node:test')
const assert = require('node:assert')
const { buildCsp } = require('../lib/csp')

test('CSP bloqueia embed em iframe de terceiro (clickjacking)', () => {
  assert.match(buildCsp(), /frame-ancestors 'none'/)
})

test('CSP não tem wildcard "*" em nenhuma diretiva', () => {
  const csp = buildCsp()
  for (const directive of csp.split(';')) {
    assert.equal(directive.trim().includes('*'), false, `diretiva com wildcard: ${directive}`)
  }
})

test('CSP libera Google Fonts (style-src + font-src) sem abrir para qualquer host https', () => {
  const csp = buildCsp()
  assert.match(csp, /style-src[^;]*fonts\.googleapis\.com/)
  assert.match(csp, /font-src[^;]*fonts\.gstatic\.com/)
})

test('CSP libera cavalier.hudsonrock.com em connect-src (ingestão client-side)', () => {
  assert.match(buildCsp(), /connect-src[^;]*cavalier\.hudsonrock\.com/)
})

test('CSP libera blob: em frame-src (preview de relatório via iframe+blobUrl)', () => {
  assert.match(buildCsp(), /frame-src[^;]*blob:/)
})

test('CSP nega plugins/objects e restringe base/form (defesa em profundidade)', () => {
  const csp = buildCsp()
  assert.match(csp, /object-src 'none'/)
  assert.match(csp, /base-uri 'self'/)
  assert.match(csp, /form-action 'self'/)
})
