'use strict'
// Merge/dedup das mensagens da tela de Execução. Roda no render E a cada
// "Atualizar dados" (ETAPA 2.1) — por isso precisa ser IDEMPOTENTE: reexecutar
// com os mesmos dados não pode duplicar registros.
//
//  - history × live: dedup por `_dbId` (a mesma mensagem persistida que também
//    chegou pelo feed ao vivo aparece uma vez só).
//  - findings persistidos: injeta só os que ainda NÃO estão no feed. Dedup por
//    TÍTULO — o id do feed vivo (ex.: "ENUM-001", do YAML) difere do _id do banco,
//    então casar por id duplicaria.
//
// Plain CJS: puro e testável com `node --test`, e importável pelo app TS (allowJs).
function mergeMessages(history, live, persistedFindings) {
  history = history || []
  live = live || []
  persistedFindings = persistedFindings || []

  const liveDbIds = new Set(live.map((m) => m._dbId).filter(Boolean))
  const filtered = history.filter((m) => !liveDbIds.has(m._dbId))
  const base = [...filtered, ...live]

  const liveTitles = new Set(base.filter((m) => m.type === 'finding').map((m) => String(m.title)))
  const extra = persistedFindings.filter((f) => !liveTitles.has(String(f.title)))
  return [...extra, ...base]
}

module.exports = { mergeMessages }
