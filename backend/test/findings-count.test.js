// Regressão da CONTAGEM DE FINDINGS (ETAPA 1.2).
// Antes do fix, GET /api/findings devolvia TODOS os docs (incl. 143 órfãos de
// engagements removidos) e não deduplicava → total (191) ≠ soma dos cards (44).
// cleanFindings/summarize são a fonte única; este teste trava as regras.
const { test } = require('node:test')
const assert = require('node:assert')
const { cleanFindings, summarize } = require('../src/findings-count')

const ENG_A = 'aaaaaaaa-0000', ENG_B = 'bbbbbbbb-1111', ENG_GONE = 'dead-9999'

const SAMPLE = [
  { engagementId: ENG_A, severity: 'high',     fingerprint: 'fp1' },
  { engagementId: ENG_A, severity: 'high',     fingerprint: 'fp1' },   // duplicado real (re-scan) → 1×
  { engagementId: ENG_A, severity: 'medium',   fingerprint: 'fp2' },
  { engagementId: ENG_B, severity: 'critical', fingerprint: 'fp3' },
  { engagementId: ENG_B, severity: 'info',     fingerprint: null  },   // sem fp → conta
  { engagementId: ENG_B, severity: 'info',     fingerprint: null  },   // sem fp → conta (não dá p/ afirmar igual)
  { engagementId: ENG_GONE, severity: 'critical', fingerprint: 'x1' }, // ÓRFÃO → não conta
  { engagementId: ENG_GONE, severity: 'high',     fingerprint: 'x2' }, // ÓRFÃO → não conta
]

test('exclui findings de engagements removidos (órfãos)', () => {
  const cleaned = cleanFindings(SAMPLE, [ENG_A, ENG_B])
  assert.ok(cleaned.every((f) => f.engagementId !== ENG_GONE), 'órfão vazou na contagem')
  // A: fp1 (dedup) + fp2 = 2; B: fp3 + 2×(sem fp) = 3 → 5. Os 2 órfãos ficam de fora.
  assert.equal(cleaned.length, 5)
})

test('deduplica por (engagement, fingerprint); sem fingerprint cada um conta', () => {
  const cleaned = cleanFindings(SAMPLE, [ENG_A, ENG_B])
  const aCount = cleaned.filter((f) => f.engagementId === ENG_A).length
  const bCount = cleaned.filter((f) => f.engagementId === ENG_B).length
  assert.equal(aCount, 2, 'fp1 repetido deveria contar 1×')
  assert.equal(bCount, 3, 'dois info sem fingerprint contam separados')
})

test('total == soma por severidade == soma por engagement', () => {
  const s = summarize(cleanFindings(SAMPLE, [ENG_A, ENG_B]))
  const sumSev = Object.values(s.bySeverity).reduce((a, b) => a + b, 0)
  const sumEng = Object.values(s.byEngagement).reduce((a, b) => a + b, 0)
  assert.equal(s.total, 5)
  assert.equal(sumSev, s.total)
  assert.equal(sumEng, s.total)
})

test('sem lista de engagements existentes: só deduplica (não filtra órfãos)', () => {
  const cleaned = cleanFindings(SAMPLE, null)
  // 8 entradas - 1 duplicado (fp1) = 7 (mantém os "órfãos" pois não há com o que comparar)
  assert.equal(cleaned.length, 7)
})
