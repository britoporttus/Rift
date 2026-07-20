'use strict'
// Lógica pura de scripts/dedupe-fingerprints.js — extraída para ser testável
// sem DB. Dado um array de docs {_id, fingerprint, lastSeen, updatedAt},
// decide quais remover (mantém o mais recente de cada fingerprint duplicado).
function pickDuplicatesToRemove(docs) {
  const byFp = new Map()
  for (const doc of docs) {
    if (!doc.fingerprint) continue
    const list = byFp.get(doc.fingerprint) || []
    list.push(doc)
    byFp.set(doc.fingerprint, list)
  }

  const toRemove = []
  for (const group of byFp.values()) {
    if (group.length < 2) continue
    group.sort((a, b) => {
      const la = new Date(a.lastSeen || a.updatedAt || 0).getTime()
      const lb = new Date(b.lastSeen || b.updatedAt || 0).getTime()
      return lb - la // mais recente primeiro
    })
    toRemove.push(...group.slice(1)) // mantém o [0] (mais recente), remove o resto
  }
  return toRemove
}

module.exports = { pickDuplicatesToRemove }
