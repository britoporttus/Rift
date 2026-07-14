import { shouldRedirectOn401 } from './authRedirect'

const BASE = '/api'

// Auth via cookie HttpOnly (setado pelo backend) — o browser o envia sozinho em
// requests same-origin, não precisamos ler/anexar nada aqui.
async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (res.status === 401) {
    // Só faz o hard-redirect FORA da área de login. Na tela de login, o probe
    // me() do useAuth responde 401 quando não há sessão — redirecionar ali
    // recarregaria a página em loop (ver lib/authRedirect.js). Os guards de rota
    // cuidam da navegação para /login quando o usuário está de fato deslogado.
    if (typeof window !== 'undefined' && shouldRedirectOn401(window.location.pathname)) {
      window.location.href = '/login'
    }
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as any).error || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      req<{ user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    me: () => req<{ user: User }>('/auth/me'),
    logout: () => req<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
    // Troca o código de uso único do SSO pelo cookie de sessão (nada trafega na URL).
    exchange: (code: string) =>
      req<{ ok: boolean }>('/auth/exchange', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),
  },
  engagements: {
    list: () => req<Engagement[]>('/engagements'),
    get: (id: string) => req<Engagement>(`/engagements/${id}`),
    create: (data: { name: string; target: string; scope?: object }) =>
      req<Engagement>('/engagements', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Engagement>) =>
      req<Engagement>(`/engagements/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/engagements/${id}`, { method: 'DELETE' }),
    setSchedule: (id: string, schedule: Partial<EngagementSchedule>) =>
      req<Engagement>(`/engagements/${id}/schedule`, { method: 'PATCH', body: JSON.stringify(schedule) }),
    jobs: (id: string) => req<Job[]>(`/engagements/${id}/jobs`),
    runNow: (id: string) =>
      req<{ ok: boolean; message: string }>(`/engagements/${id}/run-now`, { method: 'POST' }),
    messages: (id: string, sessionId?: string) => {
      const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''
      return req<Record<string, unknown>[]>(`/engagements/${id}/messages${qs}`)
    },
    sessions: {
      list: (engId: string) => req<ChatSession[]>(`/engagements/${engId}/sessions`),
      create: (engId: string, name?: string) =>
        req<ChatSession>(`/engagements/${engId}/sessions`, {
          method: 'POST',
          body: JSON.stringify({ name: name || 'Novo chat' }),
        }),
      rename: (engId: string, sessionId: string, name: string) =>
        req<ChatSession>(`/engagements/${engId}/sessions/${sessionId}`, {
          method: 'PATCH',
          body: JSON.stringify({ name }),
        }),
      delete: (engId: string, sessionId: string) =>
        req<void>(`/engagements/${engId}/sessions/${sessionId}`, { method: 'DELETE' }),
    },
  },
  findings: {
    list: (params?: { engagementId?: string; severity?: string; remediationStatus?: string }) => {
      const qs = new URLSearchParams(params as Record<string, string>).toString()
      return req<Finding[]>(`/findings${qs ? `?${qs}` : ''}`)
    },
    setStatus: (id: string, remediationStatus: RemediationStatus) =>
      req<Finding>(`/findings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ remediationStatus }) }),
  },
  reports: {
    list: (engagementId: string) => req<ReportFile[]>(`/reports/${engagementId}`),
    // URL do relatório GERADO pelo Rift (a partir dos findings). Usada direto no
    // iframe/download — o cookie HttpOnly autentica no request same-origin.
    generatedUrl: (engagementId: string, type: 'technical' | 'executive' = 'technical', download = false) =>
      `/api/reports/${engagementId}/generated?type=${type}${download ? '&download=1' : ''}`,
    // PDF gerado via Chromium headless (design dark preservado). Sempre baixa.
    pdfUrl: (engagementId: string, type: 'technical' | 'executive' = 'technical') =>
      `/api/reports/${engagementId}/generated?type=${type}&format=pdf`,
    // Resumo executivo por IA (opt-in, cacheado). GET = status; POST = gera (admin, ~1min).
    narrativeStatus: (engagementId: string) => req<ReportNarrativeStatus>(`/reports/${engagementId}/narrative`),
    generateNarrative: (engagementId: string) =>
      req<ReportNarrativeStatus>(`/reports/${engagementId}/narrative`, { method: 'POST' }),
  },
  admin: {
    metrics: () => req<SystemMetrics>('/admin/metrics'),
    usage: () => req<UsageEntry[]>('/admin/usage'),
    usageByUser: () => req<UserUsage[]>('/admin/usage/by-user'),
    sku: () => req<SkuUsage>('/admin/sku'),
  },
  users: {
    list: () => req<UserFull[]>('/users'),
    create: (data: { email: string; name: string; password: string; role?: 'admin' | 'user' }) =>
      req<UserFull>('/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { role?: 'admin' | 'user'; name?: string }) =>
      req<UserFull>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/users/${id}`, { method: 'DELETE' }),
    resetPassword: (id: string, password: string) =>
      req<{ ok: boolean }>(`/users/${id}/reset-password`, { method: 'PATCH', body: JSON.stringify({ password }) }),
  },
  settings: {
    getModel: () => req<AgentModelInfo>('/settings/model'),
    setModel: (model: string) =>
      req<{ current: string }>('/settings/model', { method: 'PUT', body: JSON.stringify({ model }) }),
    // Catálogo das versões do agente (seletor A/B/C). A escolha é por-engagement.
    getFrameworks: () => req<FrameworkInfo>('/settings/frameworks'),
  },
}

export interface FrameworkOption {
  id: string
  label: string
  note: string
  available: boolean
  slashCommands: boolean
}
export interface FrameworkInfo {
  default: string
  available: FrameworkOption[]
}

export interface AgentModelOption {
  id: string
  label: string
  note: string
}
export interface AgentModelInfo {
  current: string
  default: string
  available: AgentModelOption[]
}

export interface User {
  id: string
  email: string
  role: 'admin' | 'user'
  name: string
}

export interface UserFull extends User {
  provider: 'local' | 'microsoft'
  lastLogin: string | null
  createdAt: string
}

export interface EngagementSchedule {
  enabled: boolean
  frequency: 'daily' | 'weekly'
  phases: 'recon' | 'recon_enum' | 'full'
  autoExploit: boolean
  costCeilingUsd: number
  nextRunAt: string | null
  lastRunAt: string | null
  lastRunStatus: 'running' | 'completed' | 'budget_exceeded' | 'error' | null
}

export interface Engagement {
  id: string
  name: string
  target: string
  scope: object
  status: 'idle' | 'active' | 'completed'
  // Estado de execução do painel (A-STATE): sobrevive a reload/restart do backend.
  runState?: 'idle' | 'running' | 'stopped' | 'completed' | 'failed'
  // Motivo do desfecho (1.3): operator | budget | incomplete | interrupted | safeguard | timeout | error
  stopReason?: string | null
  phase: string | null
  progress: number
  findingsCount: number
  slug: string
  date: string
  // Versão do agente (seletor A/B/C). Ausente em engagements antigos → tratar como 'v2'.
  frameworkId?: string
  schedule?: EngagementSchedule
  // Custo acumulado (soma de Usage no backend). Persiste entre reloads — o painel
  // usa isto como baseline e soma os cost_update ao vivo por cima.
  costUsd?: number
  tokensTotal?: number
  createdAt: string
  updatedAt: string
}

export interface JobStep {
  key: string
  label: string
  status: 'pending' | 'active' | 'done' | 'skipped'
  startedAt?: string | null
  endedAt?: string | null
}
export interface Job {
  id: string
  engagementId: string
  sessionId: string
  frameworkId: string
  status: 'running' | 'completed' | 'stopped' | 'failed'
  reason?: string | null
  steps: JobStep[]
  currentStep?: string | null
  findingsCount: number
  spentUsd: number
  startedAt: string
  endedAt?: string | null
}

export interface ReportNarrativeStatus {
  exists: boolean
  stale?: boolean
  summary?: string
  riskLevel?: string | null
  attackChains?: string[]
  recommendations?: string[]
  model?: string | null
  findingsCount?: number
  currentFindings?: number
  costUsd?: number
  generatedAt?: string
}

export type RemediationStatus = 'open' | 'fixed' | 'regressed' | 'accepted_risk'

export interface Finding {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  title: string
  description?: string
  cvss?: number
  evidence?: string
  engagement_id: string
  engagement_name?: string
  // Taxonomia + rastreamento de remediação/regressão
  state?: 'confirmed' | 'probable' | 'informational' | 'false_positive'
  confidence?: 'high' | 'medium' | 'low'
  remediationStatus?: RemediationStatus
  fingerprint?: string
  firstSeen?: string | null
  lastSeen?: string | null
}

export interface ChatSession {
  id: string
  name: string
  createdAt: string
  lastMessageAt: string
  messageCount: number
}

export interface ReportFile {
  name: string
  url: string
  viewUrl: string
  size: number
  ext: string
}

export interface SystemMetrics {
  cpu: { model: string; cores: number; loadAvg: number[] }
  memory: { total: number; free: number; used: number; usedPercent: number }
  disk: { total: number; used: number }
  uptime: number
}

export interface UsageEntry {
  date: string
  usd: number
  tokens: number
}

// Utilização da SKU (2.2). available:false quando não há fonte de limite configurada
// — a UI mostra "indisponível" em vez de simular percentual/saldo.
export interface SkuUsage {
  available: boolean
  reason?: string
  spentUsd: number
  tokensTotal: number
  limitUsd?: number
  remainingUsd?: number
  percent?: number
  period?: string
}

export interface UserUsage {
  userId: string
  userName: string
  userEmail: string
  totalUsd: number
  totalTokens: number
  days: Array<{
    date: string
    usd: number
    tokens: number
    engagements: Array<{ engagementId: string; engagementName: string; usd: number; tokens: number }>
  }>
}
