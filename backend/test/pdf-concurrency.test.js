// P2-33 (auditoria 2026-07-20): cada ?format=pdf spawna um Chromium completo,
// sem teto de instâncias simultâneas — qualquer usuário autenticado podia
// disparar várias em paralelo e esgotar CPU/RAM da VPS única. Ver
// docs/ROADMAP-AUDITORIA-2026-07-20.md.
const { test } = require('node:test')
const assert = require('node:assert')
const { htmlToPdf, PdfConcurrencyLimitError, MAX_CONCURRENT_PDF } = require('../src/report-pdf')

test('htmlToPdf rejeita com PdfConcurrencyLimitError além do teto MAX_CONCURRENT_PDF', async () => {
  assert.ok(MAX_CONCURRENT_PDF > 0)
  const pending = []
  // Ocupa todas as vagas — activePdfCount é incrementado SINCRONAMENTE na
  // chamada, antes de qualquer await, então a corrida abaixo é determinística
  // independente de o Chromium existir de fato neste ambiente.
  for (let i = 0; i < MAX_CONCURRENT_PDF; i++) {
    pending.push(htmlToPdf('<html></html>').catch(() => {}))
  }

  await assert.rejects(htmlToPdf('<html></html>'), (err) => {
    assert.ok(err instanceof PdfConcurrencyLimitError)
    assert.equal(err.code, 'PDF_CONCURRENCY_LIMIT')
    return true
  })

  await Promise.allSettled(pending)
})

test('htmlToPdf libera a vaga após as gerações em andamento terminarem (mesmo com falha)', async () => {
  // Depois que o teste anterior liberou tudo (allSettled aguardou), uma nova
  // chamada não deveria mais ser barrada pelo teto.
  await assert.doesNotReject(
    htmlToPdf('<html></html>').catch((err) => {
      // Pode falhar por outro motivo real (Chromium ausente neste sandbox) —
      // o que este teste garante é que NÃO é o erro de teto de concorrência.
      if (err instanceof PdfConcurrencyLimitError) throw err
    })
  )
})
