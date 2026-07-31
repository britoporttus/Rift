// screenshots.js — helpers puros de caminho/sanitização + guard de path traversal.
const { test } = require('node:test')
const assert = require('node:assert')
const { sanitizeName, relPathFor, absFor, SCREENSHOT_DIR } = require('../src/asm/screenshots')
const path = require('path')

test('sanitizeName: mantém host normal', () => {
  assert.equal(sanitizeName('api.alvo.com'), 'api.alvo.com')
})

test('sanitizeName: neutraliza separadores (fica em 1 segmento, sem barra)', () => {
  const s = sanitizeName('../../etc/passwd')
  assert.ok(!s.includes('/'), 'sem barra → nunca vira travessia de diretório')
  // e o relPath/absFor resultante não escapa da raiz (ver teste de absFor)
  assert.ok(absFor(relPathFor('dom1', '../../etc/passwd')), 'permanece dentro da raiz')
})

test('sanitizeName: vazio → fallback', () => {
  assert.equal(sanitizeName(''), 'host')
  assert.equal(sanitizeName(null), 'host')
})

test('relPathFor: "<domainId>/<host>.png"', () => {
  assert.equal(relPathFor('dom1', 'api.alvo.com'), 'dom1/api.alvo.com.png')
})

test('absFor: caminho legítimo resolve DENTRO da raiz', () => {
  const abs = absFor('dom1/api.alvo.com.png')
  assert.ok(abs && abs.startsWith(path.resolve(SCREENSHOT_DIR) + path.sep))
})

test('absFor: tentativa de travessia → null', () => {
  assert.equal(absFor('../../../etc/passwd'), null)
  assert.equal(absFor('/etc/passwd'), null)
  assert.equal(absFor(''), null)
  assert.equal(absFor(null), null)
})
