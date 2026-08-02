// P0-6 (auditoria 2026-07-20): o relatório executivo é admin-only, e o único
// mecanismo que garantia isso era `/exec/i` sobre o nome do arquivo. Como o
// conteúdo é escrito livremente pelo LLM de quatro versões de framework
// (v2/v2c/legacy/v3), qualquer nome fora da convenção era servido como técnico
// — visível a qualquer usuário autenticado.
const { test } = require('node:test')
const assert = require('node:assert')
const { reportKind, isExecutiveReport, canViewReport } = require('../src/report-kind')

// ── o buraco original: nome fora da convenção vazava ─────────────────────────

test('nome desconhecido é EXECUTIVO (fail-closed) — antes vazava como técnico', () => {
  // Nenhum destes casa /exec/i nem começa com "clevel": na lógica antiga todos
  // eram servidos a qualquer usuário autenticado.
  for (const f of ['relatorio-final.md', 'apresentacao-cliente.html', 'sumario.md', 'documento-2026.md']) {
    assert.equal(reportKind(f), 'executive', `${f} deveria ser restrito`)
    assert.equal(canViewReport(f, 'user'), false, `${f} não pode vazar para role user`)
  }
})

test('as convenções técnicas REAIS em disco continuam visíveis ao cliente', () => {
  // Regressão do fail-closed: se estes virassem admin-only, o cliente perderia
  // acesso ao relatório técnico que contratou. Nomes levantados de
  // Agentes-Pentest/*/clients/ (mesma fonte de test/reports-authz.test.js).
  for (const f of [
    'technical-surface-2026-07-08.md', 'report-surface-2026-07-08.html',
    'pentest-report-porttus-20260417.html', 'engagement-summary.md',
  ]) {
    assert.equal(reportKind(f), 'technical', `${f} é técnico e o cliente precisa ver`)
    assert.equal(canViewReport(f, 'user'), true)
  }
})

test('c-level com separador é restrito (a regex antiga só pegava prefixo "clevel")', () => {
  assert.equal(reportKind('relatorio-c-level-2026.md'), 'executive')
  assert.equal(reportKind('board-briefing.html'), 'executive')
  assert.equal(reportKind('resumo-diretoria.md'), 'executive')
})

// ── convenções reais em disco continuam funcionando ──────────────────────────

test('os dois nomes reais dos frameworks são classificados corretamente', () => {
  assert.equal(reportKind('resumo-executivo.md'), 'executive')
  assert.equal(reportKind('relatorio-tecnico.md'), 'technical')
})

test('nomes legados/variantes seguem casando', () => {
  assert.equal(reportKind('clevel-surface-2026-07-08.md'), 'executive')
  assert.equal(reportKind('executive-summary.html'), 'executive')
  assert.equal(reportKind('technical-findings.md'), 'technical')
  assert.equal(reportKind('achados-detalhados.md'), 'technical')
})

// ── diretório tem precedência sobre nome (sinal estrutural) ──────────────────

test('subpasta decide, mesmo contra o nome do arquivo', () => {
  assert.equal(reportKind('reports/executive/relatorio-tecnico.md'), 'executive')
  assert.equal(reportKind('reports/technical/qualquer-nome.md'), 'technical')
})

test('na dúvida entre os dois sinais no NOME, restringe', () => {
  // "resumo executivo técnico" é um resumo, não um relatório técnico.
  assert.equal(reportKind('resumo-executivo-tecnico.md'), 'executive')
})

// ── contrato de acesso ───────────────────────────────────────────────────────

test('admin vê tudo; user só vê técnico', () => {
  assert.equal(canViewReport('resumo-executivo.md', 'admin'), true)
  assert.equal(canViewReport('resumo-executivo.md', 'user'), false)
  assert.equal(canViewReport('relatorio-tecnico.md', 'user'), true)
})

test('entrada vazia/inválida não vira "técnico" por acidente', () => {
  for (const bad of ['', null, undefined, '/', '///']) {
    assert.equal(isExecutiveReport(bad), true)
  }
})
