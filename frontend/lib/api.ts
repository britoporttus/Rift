const BASE = '/api'

function token() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('rift_token')
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = token()
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(init.headers ?? {}),
    },
  })
  if (res.status === 401) {
    localStorage.removeItem('rift_token')
    window.location.href = '/login'
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
      req<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    me: () => req<{ user: User }>('/auth/me'),
    // Troca o código de uso único do SSO pelo JWT (token não trafega na URL).
    exchange: (code: string) =>
      req<{ token: string }>('/auth/exchange', {
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
  },
  admin: {
    metrics: () => req<SystemMetrics>('/admin/metrics'),
    usage: () => req<UsageEntry[]>('/admin/usage'),
    usageByUser: () => req<UserUsage[]>('/admin/usage/by-user'),
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
  },
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
  runState?: 'idle' | 'running' | 'stopped' | 'completed'
  phase: string | null
  progress: number
  findingsCount: number
  slug: string
  date: string
  schedule?: EngagementSchedule
  // Custo acumulado (soma de Usage no backend). Persiste entre reloads — o painel
  // usa isto como baseline e soma os cost_update ao vivo por cima.
  costUsd?: number
  tokensTotal?: number
  createdAt: string
  updatedAt: string
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
