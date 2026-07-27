// Diff de superfície entre dois scans do mesmo domínio — função pura, sem I/O,
// no mesmo espírito de asm/score.js (testável isolada, sem tocar o Mongo).
//
// `scopedTypes` é o que torna isto seguro: um tipo de asset só entra no cálculo
// de "sumiu" se ESTE scan de fato o re-verificou. `web`/`exposure` dependem de
// autorização (httpx) e de nuclei habilitado (ver scanner.js runScan) — sem essa
// guarda, um domínio que passou de autorizado→não-autorizado entre dois scans
// apareceria com "tudo sumiu" (falso positivo: a etapa não rodou, ninguém sumiu).
// `subdomain` está sempre em escopo (subfinder+DNS rodam sempre).
const MAX_EXAMPLES = 20

function computeAssetDiff({ previousAssets = [], currentAssets = [], scopedTypes = [] } = {}) {
  const scoped = new Set(scopedTypes)
  const prevFp = new Set(previousAssets.map((a) => a.fingerprint).filter(Boolean))
  const currFp = new Set(currentAssets.map((a) => a.fingerprint).filter(Boolean))

  // Sem baseline (primeiro scan do domínio) → tudo é novo, nada pode ter "sumido".
  const hasBaseline = previousAssets.length > 0

  const newAssets = hasBaseline
    ? currentAssets.filter((a) => a.fingerprint && !prevFp.has(a.fingerprint))
    : currentAssets

  const missingAssets = hasBaseline
    ? previousAssets.filter((a) => scoped.has(a.type) && a.fingerprint && !currFp.has(a.fingerprint))
    : []

  return {
    newCount: newAssets.length,
    missingCount: missingAssets.length,
    newAssets: newAssets.slice(0, MAX_EXAMPLES).map((a) => ({ type: a.type, value: a.value, severity: a.severity || 'info' })),
    missingAssets: missingAssets.slice(0, MAX_EXAMPLES).map((a) => ({ type: a.type, value: a.value })),
  }
}

module.exports = { computeAssetDiff }
