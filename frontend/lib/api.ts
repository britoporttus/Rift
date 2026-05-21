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
  },
  engagements: {
    list: () => req<Engagement[]>('/engagements'),
    get: (id: string) => req<Engagement>(`/engagements/${id}`),
    create: (data: { name: string; target: string; scope?: object }) =>
      req<Engagement>('/engagements', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Engagement>) =>
      req<Engagement>(`/engagements/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/engagements/${id}`, { method: 'DELETE' }),
  },
  findings: {
    list: (params?: { engagementId?: string; severity?: string }) => {
      const qs = new URLSearchParams(params as Record<string, string>).toString()
      return req<Finding[]>(`/findings${qs ? `?${qs}` : ''}`)
    },
  },
  reports: {
    list: (engagementId: string) => req<ReportFile[]>(`/reports/${engagementId}`),
  },
  admin: {
    metrics: () => req<SystemMetrics>('/admin/metrics'),
    usage: () => req<UsageEntry[]>('/admin/usage'),
  },
  users: {
    list: () => req<UserFull[]>('/users'),
    create: (data: { email: string; name: string; password: string; role?: 'admin' | 'user' }) =>
      req<UserFull>('/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { role?: 'admin' | 'user'; name?: string }) =>
      req<UserFull>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/users/${id}`, { method: 'DELETE' }),
  },
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

export interface Engagement {
  id: string
  name: string
  target: string
  scope: object
  status: 'idle' | 'active' | 'completed'
  phase: string | null
  progress: number
  findingsCount: number
  slug: string
  date: string
  createdAt: string
  updatedAt: string
}

export interface Finding {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  title: string
  description?: string
  cvss?: number
  evidence?: string
  engagement_id: string
  engagement_name?: string
}

export interface ReportFile {
  name: string
  url: string
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
