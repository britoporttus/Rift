'use strict'
// Utilização da SKU (ETAPA 2.2).
//
// O CONSUMO (spentUsd/tokens) é REAL — soma da coleção Usage (cada turno do agente
// grava um registro com o custo reportado pelo `claude --print`).
//
// O LIMITE/SALDO/PERÍODO do plano NÃO vêm de nenhuma fonte oficial: o Rift não
// integra a API de billing/uso da Anthropic e não há esse dado no banco. A única
// forma legítima (não simulada) de ter um limite é o operador DECLARAR o teto do
// plano via env `SKU_LIMIT_USD`. Sem isso, retornamos available:false e a UI mostra
// "Consumo da SKU indisponível — integração não configurada" (nunca um % inventado).
function computeSkuUsage({ limitUsd = null, spentUsd = 0, tokensTotal = 0, periodLabel = null } = {}) {
  const spent  = Number(spentUsd)  || 0
  const tokens = Number(tokensTotal) || 0
  const limit  = (typeof limitUsd === 'number' && isFinite(limitUsd) && limitUsd > 0) ? limitUsd : null

  if (limit == null) {
    // Sem fonte de limite → não dá para calcular % / saldo sem simular.
    return { available: false, reason: 'not_configured', spentUsd: spent, tokensTotal: tokens }
  }

  const remainingUsd = Math.max(0, limit - spent)
  const percent = Math.min(100, Math.round((spent / limit) * 100))
  return {
    available: true,
    spentUsd: spent,
    tokensTotal: tokens,
    limitUsd: limit,
    remainingUsd,
    percent,
    period: periodLabel || 'acumulado',
  }
}

module.exports = { computeSkuUsage }
