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

// ── Hypervisor: precisa vencer "servidor", senão o alvo mais valioso da rede
// interna some no meio dos servidores genéricos.
test('ESXi: porta 902 (vSphere authd) + 443 → hypervisor, não servidor', () => {
  assert.equal(classifyDevice({ openPorts: P(22, 443, 902) }).deviceType, 'hypervisor')
})

test('ESXi: banner do serviço', () => {
  assert.equal(classifyDevice({ openPorts: P({ port: 443, service: 'vmware-auth' }) }).deviceType, 'hypervisor')
})

test('ESXi: OS reportado pelo nmap', () => {
  assert.equal(classifyDevice({ os: 'VMware ESXi 7.0', openPorts: P(443) }).deviceType, 'hypervisor')
})

test('vCenter: VAMI (5480)', () => {
  assert.equal(classifyDevice({ openPorts: P(443, 5480) }).deviceType, 'hypervisor')
})

test('Proxmox: porta 8006', () => {
  assert.equal(classifyDevice({ openPorts: P(22, 8006) }).deviceType, 'hypervisor')
})

test('Hyper-V: porta 2179 (VMConnect)', () => {
  assert.equal(classifyDevice({ openPorts: P(3389, 2179) }).deviceType, 'hypervisor')
})

test('hypervisor por hostname', () => {
  assert.equal(classifyDevice({ hostname: 'esx-01.corp.local', openPorts: P(443) }).deviceType, 'hypervisor')
})

test('servidor Linux comum NÃO vira hypervisor', () => {
  assert.equal(classifyDevice({ os: 'Linux 5.4 (Ubuntu Server)', openPorts: P(22, 80, 443) }).deviceType, 'server')
})

test('impressora ainda vence hypervisor (regra mais específica vem antes)', () => {
  assert.equal(classifyDevice({ openPorts: P(9100, 443, 902) }).deviceType, 'printer')
})

// ── Fallback por hostname/mDNS (endpoint atrás de firewall, sem porta/OS) ──────
test('notebook por hostname (sem portas) → workstation, não desconhecido', () => {
  assert.equal(classifyDevice({ hostname: 'MARCIOO-NOTEBOO', openPorts: [] }).deviceType, 'workstation')
  assert.equal(classifyDevice({ hostname: 'Bassan-Notebook.local', openPorts: [] }).deviceType, 'workstation')
})

test('mDNS .local sem outro sinal → workstation (Mac/dispositivo de usuário)', () => {
  assert.equal(classifyDevice({ hostname: 'Manzarek.local', openPorts: [] }).deviceType, 'workstation')
  assert.equal(classifyDevice({ hostname: 'M1-Audio-Setup.local', openPorts: [] }).deviceType, 'workstation')
})

test('PC-* por hostname → workstation', () => {
  assert.equal(classifyDevice({ hostname: 'PC-MARIA', openPorts: [] }).deviceType, 'workstation')
})

test('fallback de hostname NÃO rouba de regra específica (impressora .local ainda é impressora)', () => {
  assert.equal(classifyDevice({ hostname: 'HP-Printer.local', openPorts: P(9100) }).deviceType, 'printer')
})

test('servidor por hostname continua vencendo o fallback de estação', () => {
  assert.equal(classifyDevice({ hostname: 'dc01.corp.local', openPorts: P(88, 389) }).deviceType, 'server')
})

test('desconhecido: sem sinais úteis (sem porta, sem hostname)', () => {
  assert.equal(classifyDevice({ openPorts: [] }).deviceType, 'unknown')
})

test('nunca lança com entrada vazia', () => {
  assert.doesNotThrow(() => classifyDevice())
  assert.doesNotThrow(() => classifyDevice({}))
})
