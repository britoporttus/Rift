// Settings de runtime do agente (modelo LLM, etc.). Global (1 VPS / poucos users).
// Persistido em JSON simples — sem schema Mongo novo — para o runner ler sincronamente
// a cada run e a API ler/gravar. Default vem do env AGENT_MODEL (retrocompat).
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

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

// ── Chaves de API dos providers de vazamento (módulo ASM) ─────────────────────
// Guardadas no mesmo settings.json. Fallback para env (HIBP_API_KEY etc.) para
// retrocompat/12-factor. A chave crua NUNCA é exposta num GET — só o status
// "configurado" (ver isLeakProviderConfigured / listLeakProviderStatus).
//
// P2-35 (auditoria 2026-07-20): `backend/data/` é gitignored (sem risco via
// git), mas as chaves viviam em texto claro no filesystem da VPS — qualquer
// processo/usuário com acesso de leitura ao diretório de dados as lia direto.
// Cifradas com AES-256-GCM quando SETTINGS_ENCRYPTION_KEY está definida (ver
// .env.example). Sem a env var: comportamento INALTERADO (texto claro, com
// aviso no log) — não quebra deploys existentes que ainda não a configuraram.
// Dado legado em texto claro (`cache.leakProviders`) continua legível e é
// migrado pra cifrado automaticamente na próxima escrita (setLeakProviderCreds).
const ENC_ALGO = 'aes-256-gcm'

function getEncKey() {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY
  if (!raw) return null
  // Aceita hex de 32 bytes (64 chars) direto, ou deriva de qualquer string.
  return /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : crypto.createHash('sha256').update(raw).digest()
}

function encryptLeakProviders(obj) {
  const key = getEncKey()
  if (!key) return null
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ENC_ALGO, key, iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()])
  return { iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: data.toString('hex') }
}

function decryptLeakProviders(enc) {
  const key = getEncKey()
  if (!key || !enc) return null
  try {
    const decipher = crypto.createDecipheriv(ENC_ALGO, key, Buffer.from(enc.iv, 'hex'))
    decipher.setAuthTag(Buffer.from(enc.tag, 'hex'))
    const out = Buffer.concat([decipher.update(Buffer.from(enc.data, 'hex')), decipher.final()])
    return JSON.parse(out.toString('utf8'))
  } catch { return null }
}

// Devolve o mapa {providerId -> {apiKey, apiUser}} de dentro do settings.json,
// descriptografando se cifrado, ou lendo o legado em texto claro.
function readLeakProvidersStore(s) {
  if (s.leakProvidersEnc) return decryptLeakProviders(s.leakProvidersEnc) || {}
  return s.leakProviders || {}
}

function getLeakProviderCreds(id) {
  const s = load()
  const stored = readLeakProvidersStore(s)[id] || {}
  if (id === 'hibp') return { apiKey: stored.apiKey || process.env.HIBP_API_KEY || null }
  if (id === 'leakcheck') return { apiKey: stored.apiKey || process.env.LEAKCHECK_API_KEY || null }
  if (id === 'dehashed') return {
    apiKey:  stored.apiKey  || process.env.DEHASHED_API_KEY  || null,
    apiUser: stored.apiUser || process.env.DEHASHED_API_USER || null,
  }
  return {}
}

function isLeakProviderConfigured(id) {
  const c = getLeakProviderCreds(id)
  if (id === 'dehashed') return !!(c.apiKey && c.apiUser)
  if (id === 'mock') return true   // demo não precisa de chave
  return !!c.apiKey
}

let warnedNoEncKey = false

// Grava/limpa credenciais. Passar string vazia LIMPA a credencial (volta ao env,
// se houver). apiUser só se aplica ao dehashed. Migra automaticamente qualquer
// dado legado em texto claro pra cifrado nesta escrita (se a chave estiver setada).
function setLeakProviderCreds(id, { apiKey, apiUser } = {}) {
  cache = load()
  const stored = readLeakProvidersStore(cache)
  const cur = stored[id] || {}
  if (apiKey !== undefined)  cur.apiKey  = apiKey  ? String(apiKey).trim()  : undefined
  if (apiUser !== undefined) cur.apiUser = apiUser ? String(apiUser).trim() : undefined
  stored[id] = cur

  const enc = encryptLeakProviders(stored)
  if (enc) {
    cache.leakProvidersEnc = enc
    delete cache.leakProviders // não deixa resquício em texto claro após migrar
  } else {
    cache.leakProviders = stored
    if (!warnedNoEncKey) {
      console.warn('[settings] SETTINGS_ENCRYPTION_KEY não definida — chaves de leak provider salvas em texto claro em disco (ver .env.example).')
      warnedNoEncKey = true
    }
  }
  persist()
  return isLeakProviderConfigured(id)
}

module.exports = {
  getAgentModel, setAgentModel, isValidModel, AVAILABLE_MODELS, DEFAULT_MODEL,
  getLeakProviderCreds, isLeakProviderConfigured, setLeakProviderCreds,
  encryptLeakProviders, decryptLeakProviders, readLeakProvidersStore,
}
