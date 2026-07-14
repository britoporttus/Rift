// A-INTAKE: gera os arquivos de escopo do framework a partir das respostas do
// intake guiado (armazenadas em engagement.scope). Espelha a estrutura que a
// skill `pentest-intake.md` produz, para o framework enxergar o mesmo formato.
//
// Escreve context/{id}/scope.yaml + engagement-state.yaml (idle). NÃO toca
// config/scope.yaml — esse é o arquivo de autorização ATIVO, escrito por-run
// (agent-runner.writeScopeYaml, que já prefere o context/{id}/scope.yaml aqui gerado).
const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')
const { getFrameworkPath } = require('./frameworks')

// Path da versão DEFAULT (v2) resolvido pelo registro — casa com o cwd usado nos
// runs. As funções aceitam um frameworkPath explícito quando a versão é conhecida.
const DEFAULT_FRAMEWORK_PATH = process.env.FRAMEWORK_PATH || getFrameworkPath('v2')

// Mesmo id determinístico que agent-runner deriva: {slug}-{YYYYMMDD}.
function deriveEngId(eng) {
  const slug = eng.slug || eng.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'engagement'
  const date = eng.date || new Date().toISOString().slice(0, 10)
  return `${slug}-${date.replace(/-/g, '')}`
}

const ENVIRONMENTS = ['production', 'staging', 'dev', 'lab']
const APP_TYPES    = ['web', 'web+api', 'api', 'saas-vendor', 'saas-tenant']
const INTENSITIES  = ['low', 'medium', 'high', 'targeted']
const WAF_PRESENT  = ['yes', 'no', 'unknown']

// Aceita array OU string (separada por vírgula/quebra de linha) → array limpo.
function asArray(v) {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean)
  if (typeof v === 'string') return v.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)
  return []
}

function isCredsProvided(scope) {
  const c = (scope.credentials || '').toString().trim().toLowerCase()
  return c !== '' && c !== 'none' && c !== 'nenhuma' && c !== 'não'
}

// Constrói o doc de scope (mesma forma do pentest-intake.md) do engagement + intake.
function buildScopeDoc(eng) {
  const s      = eng.scope || {}
  const target = eng.target
  const id     = deriveEngId(eng)
  const now    = new Date().toISOString()

  const environment = ENVIRONMENTS.includes(s.environment) ? s.environment : 'production'
  const appType     = APP_TYPES.includes(s.appType)        ? s.appType     : 'web+api'
  const intensity   = INTENSITIES.includes(s.intensity)    ? s.intensity   : 'medium'
  const wafPresent  = WAF_PRESENT.includes(s.wafPresent)   ? s.wafPresent  : 'unknown'
  const spending    = typeof s.spendingUsd === 'number' && s.spendingUsd > 0
    ? s.spendingUsd
    : (environment === 'lab' ? 20 : 5)

  return {
    engagement: {
      id,
      target,
      created: eng.createdAt ? new Date(eng.createdAt).toISOString() : now,
    },
    scope: {
      domains:      [target, `*.${target}`],
      ip_ranges:    asArray(s.ipRanges),
      out_of_scope: asArray(s.outOfScope),
      environment,
      app_type:     appType,
      fragile:      Boolean(s.fragile),
    },
    intensity,
    targeted_vectors: intensity === 'targeted' ? asArray(s.targetedVectors) : [],
    operator_context: {
      known_stack: asArray(s.knownStack),
      waf: {
        present:     wafPresent,
        type:        String(s.wafType || ''),
        known_rules: asArray(s.wafRules),
      },
      skip_findings: asArray(s.skipFindings),
      focus_areas:   asArray(s.focusAreas),
      notes:         String(s.notes || ''),
    },
    limits: {
      time_window:   String(s.timeWindow || ''),
      spending_usd:  spending,
      notifications: 'checkpoint',
    },
  }
}

function buildStateDoc(eng) {
  const id  = deriveEngId(eng)
  const now = new Date().toISOString()
  return {
    engagement_id:      id,
    credential_state:   isCredsProvided(eng.scope || {}) ? 'user_level' : 'none',
    current_phase:      'idle',
    checkpoint_reached: false,
    started_at:         now,
    last_updated:       now,
    phases_completed:   [],
    shadow_graph:       { hosts: [], credentials: [], vulnerabilities: [], attack_chains: [] },
  }
}

// Escreve context/{id}/scope.yaml (+ dirs) e engagement-state.yaml (só se ainda
// não existir — não sobrescreve estado de um run em andamento). Retorna o id.
function writeEngagementScope(eng, frameworkPath = DEFAULT_FRAMEWORK_PATH) {
  const id     = deriveEngId(eng)
  const ctxDir = path.join(frameworkPath, 'context', id)
  fs.mkdirSync(path.join(ctxDir, 'parsed'), { recursive: true })
  fs.mkdirSync(path.join(ctxDir, 'raw'), { recursive: true })

  // yaml.dump serializa target/foco/etc (input do usuário) com segurança — nunca
  // interpolamos string crua em YAML (injeção quebraria o escopo de autorização).
  fs.writeFileSync(path.join(ctxDir, 'scope.yaml'), yaml.dump(buildScopeDoc(eng), { lineWidth: -1 }), 'utf8')

  const stateFile = path.join(ctxDir, 'engagement-state.yaml')
  if (!fs.existsSync(stateFile)) {
    fs.writeFileSync(stateFile, yaml.dump(buildStateDoc(eng), { lineWidth: -1 }), 'utf8')
  }

  // Adianta os dirs de findings/reports do cliente (o watcher também cria).
  const slug = eng.slug || ''
  const date = eng.date || ''
  if (slug && date) {
    fs.mkdirSync(path.join(frameworkPath, 'clients', slug, date, 'findings'), { recursive: true })
    fs.mkdirSync(path.join(frameworkPath, 'clients', slug, date, 'reports'), { recursive: true })
  }
  return id
}

// "Começar do zero": FORÇA o reset do engagement-state.yaml para o template inicial
// (current_phase='idle', phases_completed=[], shadow_graph vazio). Sem isto, a guarda
// de re-execução do framework (skills/phase-state.md) vê recon/enum/vuln "concluídos"
// e o agente PULA as fases — por isso cada re-run rendia MENOS. O scope.yaml
// (autorização) e os findings em disco são preservados. Retorna o id ou null.
function resetEngagementState(eng, frameworkPath = DEFAULT_FRAMEWORK_PATH) {
  const id = deriveEngId(eng)
  const ctxDir = path.join(frameworkPath, 'context', id)
  try {
    fs.mkdirSync(ctxDir, { recursive: true })
    fs.writeFileSync(
      path.join(ctxDir, 'engagement-state.yaml'),
      yaml.dump(buildStateDoc(eng), { lineWidth: -1 }),
      'utf8'
    )
    return id
  } catch {
    return null
  }
}

module.exports = { deriveEngId, buildScopeDoc, buildStateDoc, writeEngagementScope, resetEngagementState, asArray, isCredsProvided }
