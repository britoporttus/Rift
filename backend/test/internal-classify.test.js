// classifyDevice (internal/classify.js) — heurística pura de tipo de dispositivo.
const { test } = require('node:test')
const assert = require('node:assert')
const { classifyDevice } = require('../src/internal/classify')

const P = (...ports) => ports.map((p) => (typeof p === 'object' ? p : { port: p }))

test('impressora: porta 9100 (JetDirect)', () => {
  assert.equal(classifyDevice({ openPorts: P(9100, 80) }).deviceType, 'printer')
})

test('impressora: fabricante do MAC (HP)', () => {
  assert.equal(classifyDevice({ macVendor: 'Hewlett Packard', openPorts: P(80) }).deviceType, 'printer')
})

test('câmera IP: porta 554 (RTSP)', () => {
  assert.equal(classifyDevice({ openPorts: P(554, 80) }).deviceType, 'camera')
})

test('câmera IP: fabricante Hikvision', () => {
  assert.equal(classifyDevice({ macVendor: 'Hikvision Digital', openPorts: P(80) }).deviceType, 'camera')
})

test('switch/roteador: SNMP + fabricante de rede (Cisco)', () => {
  const t = classifyDevice({ macVendor: 'Cisco Systems', openPorts: P(161) }).deviceType
  assert.ok(['switch', 'router'].includes(t))
})

test('roteador: hostname gateway', () => {
  assert.equal(classifyDevice({ hostname: 'gateway-01', macVendor: 'Cisco', openPorts: P(161) }).deviceType, 'router')
})

test('firewall: fabricante Fortinet', () => {
  assert.equal(classifyDevice({ macVendor: 'Fortinet', openPorts: P(443) }).deviceType, 'firewall')
})

test('servidor: OS Linux server + SSH', () => {
  assert.equal(classifyDevice({ os: 'Linux 5.4 (Ubuntu Server)', openPorts: P(22, 443) }).deviceType, 'server')
})

test('estação: Windows 10 desktop', () => {
  assert.equal(classifyDevice({ os: 'Microsoft Windows 10', openPorts: P(445, 3389) }).deviceType, 'workstation')
})

test('NAS: fabricante Synology', () => {
  assert.equal(classifyDevice({ macVendor: 'Synology', openPorts: P(5000) }).deviceType, 'nas')
})

test('desconhecido: sem sinais úteis', () => {
  assert.equal(classifyDevice({ openPorts: [] }).deviceType, 'unknown')
})

test('nunca lança com entrada vazia', () => {
  assert.doesNotThrow(() => classifyDevice())
  assert.doesNotThrow(() => classifyDevice({}))
})
