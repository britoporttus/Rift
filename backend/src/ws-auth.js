'use strict'
const cookie = require('cookie')

// P1-19 (auditoria 2026-07-20): resolve o JWT do handshake do WS SÓ via cookie
// HttpOnly ou subprotocolo `rift-jwt` — NUNCA via query string. Extraído pra
// ser testável sem subir o servidor inteiro; também documenta em código que a
// query string nunca é (nem deveria voltar a ser) uma fonte de token aqui.
function resolveWsToken(cookieHeader, protoHeader, cookieName) {
  const cookies = cookie.parse(cookieHeader || '')
  const protoToken = (protoHeader || '').split(',').map((s) => s.trim()).find((p) => p && p !== 'rift-jwt')
  return cookies[cookieName] || protoToken || null
}

module.exports = { resolveWsToken }
