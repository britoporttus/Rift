'use strict'
// Registro central das VERSÕES do agente de pentest (A/B/C). Fonte ÚNICA da verdade
// para: onde cada versão vive, onde ela grava findings, e o que o Rift precisa injetar
// para rodá-la sem quebrar. O agent-runner e o findings-watcher resolvem o path por aqui.
//
// Decisão do operador: as 3 versões rodam de dentro de Agentes-Pentest/. A escolha é
// por-engagement (Engagement.frameworkId), default 'v2'.
const fs = require('fs')
const path = require('path')

// Base das versões. Override por env (AGENTS_DIR) para outros hosts/CI.
const AGENTS_DIR = process.env.AGENTS_DIR || path.resolve(__dirname, '..', '..', 'Agentes-Pentest')

const DEFAULT_FRAMEWORK_ID = 'v2c'

// Sanitiza o alvo para compor o dir de results/ do legacy (localhost:3000 -> localhost_3000).
// Só usado no caminho FALLBACK do legacy; o path canônico é sempre clients/{slug}/{date}.
function sanitizeTarget(target) {
  return String(target || 'target').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

// Cada entrada:
//   id, label, note        — identificação + texto do seletor
//   path                   — raiz absoluta do framework (cwd do claude)
//   hasClaudeMd            — se o claude lê instruções nativas (CLAUDE.md/.claude/commands)
//   slashCommands          — se /pentest-* existem
//   rulesFile              — regras nativas a injetar quando !hasClaudeMd (relativo ao path)
//   findingsDirs(slug,date,target) -> [dirs RELATIVOS ao path] onde findings podem surgir,
//                            SEMPRE escopados pelo engagement (nunca a raiz de clients/).
const REGISTRY = [
  {
    id: 'v2',
    label: 'v2 original (backup)',
    note: 'Rift-native original (antes da consolidação). Mantido como oráculo de regressão.',
    // env FRAMEWORK_PATH continua sendo override do v2 (retrocompatibilidade).
    path: process.env.FRAMEWORK_PATH || path.join(AGENTS_DIR, 'pentest-framework-v2'),
    hasClaudeMd: true,
    slashCommands: true,
    rulesFile: null,
    findingsDirs: (slug, date) => [`clients/${slug}/${date}/findings`],
  },
  {
    id: 'v2c',
    label: 'v2 consolidado (padrão)',
    note: 'Tronco consolidado: cobertura transporte/infra roteada (TLS/SSH/PKCE/downgrade) + disciplina de custo + anti-FP. Validado (F4) — recomendado.',
    path: path.join(AGENTS_DIR, 'pentest-framework-v2-next'),
    hasClaudeMd: true,
    slashCommands: true,
    rulesFile: null,
    findingsDirs: (slug, date) => [`clients/${slug}/${date}/findings`],
  },
  {
    id: 'legacy',
    label: 'legacy (backup)',
    note: 'Versão antiga, portada p/ Claude (CLAUDE.md). Playbooks agressivos por stack.',
    path: path.join(AGENTS_DIR, 'pentest-framework'),
    // Portado: tem CLAUDE.md nativo → o Claude lê sozinho (não injetamos o .cursorrules).
    hasClaudeMd: true,
    slashCommands: false,
    rulesFile: '.cursorules.md',
    findingsDirs: (slug, date, target) => [
      `clients/${slug}/${date}/findings`,
      `results/${sanitizeTarget(target)}_${String(date || '').replace(/-/g, '')}/findings`,
    ],
  },
  {
    id: 'v3',
    label: 'v3 (backup)',
    note: 'Orquestrador 7-fases + 75 agentes, portado p/ Claude (CLAUDE.md). Experimental.',
    path: path.join(AGENTS_DIR, 'pentest-framework-3'),
    // Portado: tem CLAUDE.md nativo → o Claude lê sozinho (não injetamos o .cursorrules).
    hasClaudeMd: true,
    slashCommands: false,
    rulesFile: '.cursorrules',
    findingsDirs: (slug, date) => [
      `clients/${slug}/${date}/findings`,
      `clients/${slug}/${date}/evidence`,
    ],
  },
]

const BY_ID = new Map(REGISTRY.map((f) => [f.id, f]))

function isAvailable(entry) {
  try { return !!entry && fs.existsSync(entry.path) } catch { return false }
}

// SEMPRE retorna uma entrada válida (fallback -> default) para nenhum caller quebrar
// por um frameworkId ausente/inválido persistido no banco.
function getFramework(id) {
  const entry = (id && BY_ID.get(id)) || BY_ID.get(DEFAULT_FRAMEWORK_ID)
  return { ...entry, available: isAvailable(entry) }
}

function isValidFrameworkId(id) {
  return typeof id === 'string' && BY_ID.has(id)
}

function getFrameworkPath(id) {
  return getFramework(id).path
}

// Dirs ABSOLUTOS onde o watcher deve observar findings deste engagement, nesta versão.
function resolveFindingsDirs(framework, slug, date, target) {
  const fw = framework && framework.findingsDirs ? framework : getFramework(framework?.id)
  let rels = []
  try { rels = fw.findingsDirs(slug, date, target) || [] } catch { rels = [] }
  // fallback duro: nunca deixar o watcher sem um dir (senão findings somem).
  if (!rels.length) rels = [`clients/${slug}/${date}/findings`]
  return rels.map((r) => path.join(fw.path, r))
}

// Texto das regras nativas (só p/ versões sem CLAUDE.md) — injetado no system-context.
function loadRules(framework) {
  const fw = framework && framework.path ? framework : getFramework(framework?.id)
  if (!fw.rulesFile) return ''
  try { return fs.readFileSync(path.join(fw.path, fw.rulesFile), 'utf8') } catch { return '' }
}

// Shape JSON-safe para a API/seletor (sem a função findingsDirs).
function toPublic(entry) {
  return {
    id: entry.id,
    label: entry.label,
    note: entry.note,
    available: isAvailable(entry),
    slashCommands: !!entry.slashCommands,
  }
}

function listFrameworks() {
  return REGISTRY.map(toPublic)
}

module.exports = {
  DEFAULT_FRAMEWORK_ID,
  getFramework,
  getFrameworkPath,
  isValidFrameworkId,
  resolveFindingsDirs,
  loadRules,
  listFrameworks,
  sanitizeTarget,
}
