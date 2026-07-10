// Settings de runtime do agente (modelo LLM, etc.). Global (1 VPS / poucos users).
// Persistido em JSON simples — sem schema Mongo novo — para o runner ler sincronamente
// a cada run e a API ler/gravar. Default vem do env AGENT_MODEL (retrocompat).
const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'settings.json')

// Modelo default: mantém a semântica antiga (env AGENT_MODEL, senão sonnet-5).
const DEFAULT_MODEL = process.env.AGENT_MODEL !== undefined ? process.env.AGENT_MODEL : 'claude-sonnet-5'

// Curadoria mostrada no seletor da UI. O endpoint aceita também qualquer id
// claude-* (para modelos futuros sem precisar mexer no código).
const AVAILABLE_MODELS = [
  { id: 'claude-sonnet-5',              label: 'Sonnet 5',  note: 'Recomendado — equilíbrio; sem bloqueio de safeguard' },
  { id: 'claude-sonnet-4-6',            label: 'Sonnet 4.6', note: 'Sonnet anterior' },
  { id: 'claude-opus-4-8',              label: 'Opus 4.8',  note: '⚠️ Mais profundo, mas costuma RECUSAR pentest (safeguard)' },
  { id: 'claude-haiku-4-5-20251001',    label: 'Haiku 4.5', note: 'Rápido e barato; menos profundo' },
]

function isValidModel(m) {
  if (typeof m !== 'string') return false
  const s = m.trim()
  if (!s) return false
  if (AVAILABLE_MODELS.some((x) => x.id === s)) return true
  return /^claude-[a-z0-9.\-]+$/i.test(s)   // permite ids futuros
}

let cache = null
function load() {
  if (cache) return cache
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}
  } catch {
    cache = {}
  }
  return cache
}

function persist() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(FILE, JSON.stringify(cache, null, 2), 'utf8')
  } catch (err) {
    console.warn('[settings] falha ao gravar settings.json:', err.message)
  }
}

function getAgentModel() {
  const s = load()
  const m = s.agentModel
  return isValidModel(m) ? m.trim() : DEFAULT_MODEL
}

function setAgentModel(m) {
  if (!isValidModel(m)) throw new Error('modelo inválido')
  cache = load()
  cache.agentModel = m.trim()
  persist()
  return cache.agentModel
}

module.exports = { getAgentModel, setAgentModel, isValidModel, AVAILABLE_MODELS, DEFAULT_MODEL }
