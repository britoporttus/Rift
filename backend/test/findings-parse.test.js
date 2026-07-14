// Parser de findings em Markdown — garante que o formato LEGACY (=== FINDING ===,
// chaves planas) seja ingerido. Sem isto, escolher o agente legacy = zero findings
// no painel (o parser antigo exigia `# heading` + `**Severity**`).
const { test } = require('node:test')
const assert = require('node:assert')
const { parseMarkdownFinding } = require('../src/findings-watcher')

// Formato real do agente legacy (results/.../findings/black-box/*.md).
const LEGACY = `=== FINDING [CONFIRMED] ===
Severity: MEDIUM
Type: CORS misconfiguration
Title: Access-Control-Allow-Origin refletindo origem ampla (*)
Endpoint: GET /
Evidence: curl -sI http://localhost:3000/ — header Access-Control-Allow-Origin: *
Impact: Navegadores podem permitir leitura cross-origin.
Recommendation: Restringir a origens explícitas.
===========================`

test('legacy: bloco === FINDING === com chaves planas é parseado', () => {
  const f = parseMarkdownFinding(LEGACY, 'medium-cors')
  assert.ok(f, 'não deve ser null')
  assert.equal(f.title, 'Access-Control-Allow-Origin refletindo origem ampla (*)')
  assert.equal(f.severity, 'medium')          // normalizado p/ minúsculo
  assert.equal(f.type, 'CORS misconfiguration')
  assert.equal(f.location, 'GET /')           // Endpoint -> location
  assert.equal(f.state, 'confirmed')          // do marcador [CONFIRMED]
  assert.match(f.recommendation, /origens expl/i)
})

test('legacy sem severidade explícita ainda gera finding (título presente)', () => {
  const f = parseMarkdownFinding('=== FINDING [PROBABLE] ===\nTitle: IDOR em /api/users\nType: idor', 'x')
  assert.ok(f)
  assert.equal(f.title, 'IDOR em /api/users')
  assert.equal(f.state, 'probable')
  assert.equal(f.severity, undefined)         // watcher aplica default 'info' depois
})

test('formato v2/genérico: heading # + **Severity:** também é parseado', () => {
  const md = `# Swagger UI exposto sem autenticação\n\n**Severity:** high\n**Type:** information-disclosure\n\nDescrição do finding.`
  const f = parseMarkdownFinding(md, 'fallback-id')
  assert.ok(f)
  assert.equal(f.title, 'Swagger UI exposto sem autenticação')
  assert.equal(f.severity, 'high')
  assert.equal(f.type, 'information-disclosure')
})

test('markdown que não é finding (sem título reconhecível) → null', () => {
  assert.equal(parseMarkdownFinding('Apenas um log de execução qualquer.\nnmap rodou.', 'x'), null)
})
