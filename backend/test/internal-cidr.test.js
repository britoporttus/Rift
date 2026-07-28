// internal/cidr.js — contenção de IP em CIDR. É o que define o escopo em que o
// ingest pode marcar host como sumido; um falso positivo aqui apaga inventário.
const { test } = require('node:test')
const assert = require('node:assert')
const { ipInCidr, ipInAnyCidr, ipToInt } = require('../src/internal/cidr')

test('IP dentro e fora de um /24', () => {
  assert.equal(ipInCidr('192.168.0.5', '192.168.0.0/24'), true)
  assert.equal(ipInCidr('192.168.0.255', '192.168.0.0/24'), true)
  assert.equal(ipInCidr('192.168.1.5', '192.168.0.0/24'), false)
})

test('máscaras não-octeto (/20, /25) batem certo', () => {
  assert.equal(ipInCidr('172.18.224.1', '172.18.224.0/20'), true)
  assert.equal(ipInCidr('172.18.240.1', '172.18.224.0/20'), false)
  assert.equal(ipInCidr('10.0.0.127', '10.0.0.0/25'), true)
  assert.equal(ipInCidr('10.0.0.128', '10.0.0.0/25'), false)
})

test('/32 casa só o próprio IP e /0 casa tudo', () => {
  assert.equal(ipInCidr('10.255.255.254', '10.255.255.254/32'), true)
  assert.equal(ipInCidr('10.255.255.253', '10.255.255.254/32'), false)
  assert.equal(ipInCidr('8.8.8.8', '0.0.0.0/0'), true)
})

test('máscara alta não estoura o sinal de 32 bits', () => {
  // (0xFFFFFFFF << 0) em JS vira -1 sem o >>> 0; sem isso /1 e /0 quebram.
  assert.equal(ipInCidr('129.0.0.1', '128.0.0.0/1'), true)
  assert.equal(ipInCidr('127.0.0.1', '128.0.0.0/1'), false)
})

test('entrada inválida devolve false em vez de lançar', () => {
  for (const bad of [null, undefined, '', 'nope', '192.168.0.0', '192.168.0.0/33', '192.168.0.0/-1']) {
    assert.doesNotThrow(() => ipInCidr('10.0.0.1', bad))
    assert.equal(ipInCidr('10.0.0.1', bad), false)
  }
  assert.equal(ipInCidr('999.1.1.1', '0.0.0.0/0'), false)
  assert.equal(ipInCidr(null, '10.0.0.0/8'), false)
  assert.equal(ipToInt('1.2.3'), null)
})

test('ipInAnyCidr: escopo vazio nunca contém nada', () => {
  // Invariante que sustenta a compatibilidade com o agente v1: sem escopo
  // reportado, nenhum host pode ser marcado como sumido.
  assert.equal(ipInAnyCidr('10.0.0.1', []), false)
  assert.equal(ipInAnyCidr('10.0.0.1', null), false)
  assert.equal(ipInAnyCidr('10.0.0.1', ['192.168.0.0/24', '10.0.0.0/8']), true)
})
