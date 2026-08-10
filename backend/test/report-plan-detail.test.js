// Relatório resumido do plano free.
//
// O corte: o free vê O QUE foi encontrado e a GRAVIDADE — suficiente para o
// valor ser óbvio. O detalhe técnico (descrição completa, payload, evidência,
// impacto, recomendação) é o que se compra ao assinar.
const { test } = require('node:test')
const assert = require('node:assert')
const { renderReport } = require('../src/report')

const ENG = { _id: 'e1', name: 'Alvo', target: 'alvo.com', slug: 'alvo', date: '2026-08-03' }
const FINDING = {
  id: 'F-001', title: 'SQL Injection no login', severity: 'critical', state: 'confirmed',
  location: 'https://alvo.com/login', parameter: 'user',
  description: 'O parâmetro user concatena direto na query SQL.',
  payload: "' OR 1=1--",
  evidence: 'HTTP/1.1 200 OK\nWelcome admin',
  impact: 'Acesso total ao banco de dados.',
  recommendation: 'Usar prepared statements.',
}

const full    = () => renderReport(ENG, [FINDING], { type: 'technical', detail: 'full' })
const summary = () => renderReport(ENG, [FINDING], { type: 'technical', detail: 'summary' })

test('o free VÊ o achado, a gravidade e onde — o valor tem que ser óbvio', () => {
  const h = summary()
  assert.match(h, /SQL Injection no login/, 'o título é o valor')
  assert.match(h, /alvo\.com\/login/, 'onde está o problema')
  assert.match(h, /Cr[ií]tic/i, 'a gravidade')
})

test('o free NÃO recebe payload, evidência, impacto nem recomendação', () => {
  const h = summary()
  assert.equal(h.includes("OR 1=1"), false, 'payload de reprodução é produto pago')
  assert.equal(h.includes('Welcome admin'), false, 'evidência é produto pago')
  assert.equal(h.includes('Acesso total ao banco'), false, 'impacto é produto pago')
  assert.equal(h.includes('prepared statements'), false, 'a correção é o que se compra')
  assert.equal(h.includes('concatena direto na query'), false, 'descrição completa idem')
})

test('o resumo DIZ o que falta — card vazio pareceria produto quebrado', () => {
  assert.match(summary(), /relat[óo]rio completo|plano Pro/i)
})

test('o plano completo entrega tudo (nenhuma regressão)', () => {
  const h = full()
  for (const trecho of ["OR 1=1", 'Welcome admin', 'Acesso total ao banco', 'prepared statements', 'concatena direto na query']) {
    assert.ok(h.includes(trecho), `"${trecho}" tem que estar no relatório completo`)
  }
})

test('o default é COMPLETO — omitir a opção não pode degradar o relatório do operador', () => {
  const h = renderReport(ENG, [FINDING], { type: 'technical' })
  assert.ok(h.includes('prepared statements'))
})

test('detail inválido cai em completo, não em resumo pela metade', () => {
  const h = renderReport(ENG, [FINDING], { type: 'technical', detail: 'qualquer-coisa' })
  assert.ok(h.includes('prepared statements'))
})
