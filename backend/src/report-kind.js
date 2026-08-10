'use strict'
/**
 * Classifica um relatório escrito pelo AGENTE como 'executive' ou 'technical'.
 *
 * P0-6 (auditoria 2026-07-20). O relatório executivo é admin-only pela tabela de
 * roles do projeto, e o único mecanismo que garantia isso era
 * `isExecutiveReport(f) { return /exec/i.test(f) }` — uma regex sobre o NOME do
 * arquivo. Os relatórios são conteúdo livre escrito pelo LLM do framework, e há
 * quatro versões de framework em uso (v2/v2c/legacy/v3) gerando nomes distintos:
 * qualquer nome fora da convenção era servido como técnico, ou seja, visível a
 * qualquer usuário autenticado.
 *
 * Duas mudanças em relação à regex antiga:
 *
 *  1. **Path tem precedência sobre nome.** Se o framework escrever em
 *     `reports/executive/` ou `reports/technical/` (a convenção recomendada pela
 *     auditoria), o diretório decide — é um sinal estrutural, não textual.
 *
 *  2. **Fail-closed.** Nome que não casa NENHUM padrão conhecido passa a ser
 *     tratado como EXECUTIVO (restrito), não como técnico. Antes, o
 *     desconhecido vazava por padrão; agora o desconhecido é contido por
 *     padrão. O custo é um relatório técnico de nome exótico ficar admin-only
 *     até o padrão ser adicionado aqui — trade-off correto quando o outro lado
 *     é vazar resumo C-level para o usuário errado.
 *
 * Plain JS/CommonJS puro (sem I/O) para o `node --test` exercer sem toolchain.
 */

// Segmentos de diretório que decidem sozinhos (sinal estrutural).
const EXEC_DIRS = ['executive', 'executivo', 'exec', 'clevel', 'c-level']
const TECH_DIRS = ['technical', 'tecnico', 'técnico', 'tech']

// Padrões de NOME. Executivo é avaliado primeiro: na dúvida entre os dois sinais,
// restringe (`resumo-executivo-tecnico` é um resumo, não um relatório técnico).
const EXEC_NAME = /(^|[^a-z])(clevel|c-level|exec|executive|executivo|board|diretoria)/i

// A lista TÉCNICA precisa cobrir as convenções REAIS que os frameworks já
// produziram em disco — `report-surface-*.html`, `pentest-report-*.html`,
// `engagement-summary.md` —, senão o fail-closed abaixo esconderia do cliente o
// relatório técnico que ele contratou. Ver test/reports-authz.test.js, que fixa
// esses nomes a partir de um levantamento em Agentes-Pentest/*/clients/.
const TECH_NAME = /(^|[^a-z])(tecnico|técnico|technical|tech|findings|achados|detalhad|detailed|anexo|appendix|evidenc|poc|report|surface|engagement|summary|scan|recon)/i

function segments(p) {
  return String(p || '').toLowerCase().split(/[\\/]+/).filter(Boolean)
}

/**
 * @param {string} filePathOrName caminho relativo (preferido) ou só o nome
 * @returns {'executive'|'technical'}
 */
function reportKind(filePathOrName) {
  const segs = segments(filePathOrName)
  if (segs.length === 0) return 'executive'          // fail-closed

  const name = segs[segs.length - 1]
  const dirs = segs.slice(0, -1)

  // 1. Diretório decide (mais confiável que o nome).
  if (dirs.some((d) => EXEC_DIRS.includes(d))) return 'executive'
  if (dirs.some((d) => TECH_DIRS.includes(d))) return 'technical'

  // 2. Nome do arquivo. Executivo tem precedência: "resumo-executivo-tecnico"
  //    é um resumo, não um relatório técnico.
  if (EXEC_NAME.test(name)) return 'executive'
  if (TECH_NAME.test(name)) return 'technical'

  // 3. Desconhecido → restrito. Este é o ponto do fix.
  return 'executive'
}

/** Açúcar para os call-sites que só perguntam "é executivo?". */
function isExecutiveReport(filePathOrName) {
  return reportKind(filePathOrName) === 'executive'
}

/** true = este usuário pode ver este arquivo. */
function canViewReport(filePathOrName, role) {
  return role === 'admin' || reportKind(filePathOrName) === 'technical'
}

module.exports = { reportKind, isExecutiveReport, canViewReport, EXEC_DIRS, TECH_DIRS }
