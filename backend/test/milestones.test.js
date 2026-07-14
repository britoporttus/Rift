// Regressão dos MARCOS malformados (ETAPA 4).
const { test } = require('node:test')
const assert = require('node:assert')
const { extractMilestones } = require('../src/agent-runner')

// ── Propriedade HTTP NÃO é tecnologia ───────────────────────────────────────────
test('httpx: Country/Cookies/HttpOnly/IP/Qualidade não viram "tech"', () => {
  const out = extractMilestones(
    'Bash', 'httpx -td',
    'https://acme.com [200] [Country] [Cookies] [HttpOnly] [IP] [Qualidade] [nginx] [PHP]'
  )
  const tech = out.find((m) => m.kind === 'tech')
  assert.ok(tech, 'deveria detectar stack real')
  for (const noise of ['Country', 'Cookies', 'HttpOnly', 'IP', 'Qualidade']) {
    assert.ok(!tech.items.includes(noise), `${noise} não pode ser tratado como tecnologia`)
  }
  // a tecnologia real permanece
  assert.ok(tech.items.includes('nginx') && tech.items.includes('PHP'))
})

test('whatweb: plugins de metadado (HTTPServer/Cookies/Country/HttpOnly/IP) não viram "tech"', () => {
  // formato whatweb: PluginName[valor], ...
  const out = extractMilestones(
    'Bash', 'whatweb https://acme.com',
    'Country[BR], HTTPServer[nginx], Cookies[sid], HttpOnly[sid], IP[1.2.3.4], nginx[1.25], PHP[8.2], WordPress[6.4]'
  )
  const tech = out.find((m) => m.kind === 'tech')
  assert.ok(tech, 'deveria detectar stack real')
  for (const noise of ['HTTPServer', 'Cookies', 'Country', 'HttpOnly', 'IP']) {
    assert.ok(!tech.items.includes(noise), `${noise} (metadado whatweb) não é tecnologia`)
  }
  assert.ok(tech.items.includes('nginx') && tech.items.includes('WordPress'))
})

// ── ffuf: execuções separadas por alvo + itens estruturados ─────────────────────
test('ffuf: label inclui o host (separa execuções) e itens trazem status/size/caminho', () => {
  const out = extractMilestones(
    'Bash', 'ffuf -u https://acme.com/FUZZ -w wl.txt',
    'admin                   [Status: 200, Size: 1234, Words: 10, Lines: 5]\n' +
    'login                   [Status: 302, Size: 0, Words: 1, Lines: 1]'
  )
  const ms = out.find((m) => m.kind === 'paths')
  assert.ok(ms, 'deveria emitir marco de caminhos')
  assert.match(ms.label, /acme\.com/, 'label deve conter o host fuzzado')
  assert.match(ms.label, /2 caminhos/, 'conta os achados')
  assert.equal(ms.items.length, 2)
  assert.match(ms.items[0], /\[200\]/)
  assert.match(ms.items[0], /1234B/)
  assert.match(ms.items[0], /admin/)
})

test('ffuf: hosts diferentes geram labels diferentes (não colapsam)', () => {
  const a = extractMilestones('Bash', 'ffuf -u https://a.acme.com/FUZZ', 'x [Status: 200]')[0]
  const b = extractMilestones('Bash', 'ffuf -u https://b.acme.com/FUZZ', 'y [Status: 200]')[0]
  assert.notEqual(a.label, b.label)
  assert.match(a.label, /a\.acme\.com/)
  assert.match(b.label, /b\.acme\.com/)
})
