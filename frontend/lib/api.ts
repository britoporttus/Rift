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
    create: (data: { name: string; target: string; scope?: object; domainPackId?: string }) =>
      req<Engagement>('/engagements', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Engagement>) =>
      req<Engagement>(`/engagements/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/engagements/${id}`, { method: 'DELETE' }),
    setSchedule: (id: string, schedule: Partial<EngagementSchedule>) =>
      req<Engagement>(`/engagements/${id}/schedule`, { method: 'PATCH', body: JSON.stringify(schedule) }),
    jobs: (id: string) => req<Job[]>(`/engagements/${id}/jobs`),
    // Credenciais efêmeras de pack autenticado (in-memory no backend, por-engagement).
    // Só metadados voltam (nunca os valores).
    getCredentials: (id: string) =>
      req<{ set: boolean; fields?: string[]; expiresAt?: number }>(`/engagements/${id}/credentials`),
    setCredentials: (id: string, credentials: Record<string, string>) =>
      req<{ ok: boolean; fields: string[]; expiresAt: number }>(`/engagements/${id}/credentials`, { method: 'POST', body: JSON.stringify({ credentials }) }),
    clearCredentials: (id: string) =>
      req<void>(`/engagements/${id}/credentials`, { method: 'DELETE' }),
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
    trace: (id: string) => req<FindingTrace>(`/findings/${id}/trace`),
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
    // Catálogo dos domain packs do módulo de pentest (web/azure/ad/sap). Por-engagement.
    getDomainPacks: () => req<DomainPackInfo>('/settings/domain-packs'),
  },
  // Módulo ASM / Domínios (análise de superfície passiva + vazamento de credenciais).
  domains: {
    list: () => req<DomainSummary[]>('/domains'),
    get: (id: string) => req<DomainDetail>(`/domains/${id}`),
    create: (data: { domain: string; name?: string; kind?: string; notes?: string }) =>
      req<DomainDetail>('/domains', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { name?: string; kind?: string; notes?: string }) =>
      req<DomainDetail>(`/domains/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/domains/${id}`, { method: 'DELETE' }),
    scan: (id: string) =>
      req<{ ok: boolean; message: string }>(`/domains/${id}/scan`, { method: 'POST' }),
    setAuthorization: (id: string, authorized: boolean, note?: string) =>
      req<DomainDetail>(`/domains/${id}/authorization`, { method: 'PATCH', body: JSON.stringify({ authorized, note }) }),
    assets: (id: string, type?: string) =>
      req<DomainAsset[]>(`/domains/${id}/assets${type ? `?type=${type}` : ''}`),
    // Histórico de monitoramento (linha do tempo de scans — sempre-ativo).
    history: (id: string, limit?: number) =>
      req<DomainScanRecord[]>(`/domains/${id}/history${limit ? `?limit=${limit}` : ''}`),
  },
  // Módulo Vazamentos — exposição de credenciais por domínio (estilo QuimeraX).
  leaks: {
    list: () => req<LeakDomainSummary[]>('/leaks'),
    get: (domain: string) => req<LeakAssessment>(`/leaks/${encodeURIComponent(domain)}`),
    search: (domain: string) =>
      req<LeakSearchResult>('/leaks/search', { method: 'POST', body: JSON.stringify({ domain }) }),
    // Ingestão browser-side: o navegador do operador coleta de uma fonte cujo IP
    // do servidor é bloqueado (Hudson Rock) e envia o JSON pro backend normalizar.
    ingest: (domain: string, source: string, raw: unknown) =>
      req<{ domain: string; source: string; ingested: number }>('/leaks/ingest', { method: 'POST', body: JSON.stringify({ domain, source, raw }) }),
    delete: (domain: string) => req<void>(`/leaks/${encodeURIComponent(domain)}`, { method: 'DELETE' }),
    providers: () => req<LeakProvider[]>('/leaks/providers'),
    setProviderKey: (id: string, data: { apiKey?: string; apiUser?: string }) =>
      req<{ id: string; configured: boolean }>(`/leaks/providers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  // Mapa de Superfície — grafo que interliga os dados de ASM + Findings + Vazamentos.
  graph: {
    get: () => req<GraphResponse>('/graph'),
    domain: (id: string) => req<GraphResponse>(`/graph/domain/${id}`),
  },
  // Módulo Rede Interna — descoberta/inventário de LAN via agente local (nmap).
  internalNetworks: {
    list: () => req<InternalNetworkSummary[]>('/internal-networks'),
    get: (id: string) => req<InternalNetworkDetail>(`/internal-networks/${id}`),
    create: (data: { name: string; kind?: InternalNetworkKind; description?: string; authorized?: boolean; authorizationNote?: string }) =>
      req<InternalNetworkDetail>('/internal-networks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { name?: string; kind?: InternalNetworkKind; description?: string }) =>
      req<InternalNetworkDetail>(`/internal-networks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/internal-networks/${id}`, { method: 'DELETE' }),
    setAuthorization: (id: string, authorized: boolean, note?: string) =>
      req<InternalNetworkDetail>(`/internal-networks/${id}/authorization`, { method: 'PATCH', body: JSON.stringify({ authorized, note }) }),
    hosts: (id: string) => req<InternalHost[]>(`/internal-networks/${id}/hosts`),
    history: (id: string, limit?: number) =>
      req<InternalScanRecord[]>(`/internal-networks/${id}/history${limit ? `?limit=${limit}` : ''}`),
    regenerateToken: (id: string) =>
      req<{ ok: boolean; token: string }>(`/internal-networks/${id}/regenerate-token`, { method: 'POST' }),
    agentCommand: (id: string) =>
      req<{ token: string; scriptUrl: string; command: string; commandWindows: string; watchHint: string }>(`/internal-networks/${id}/agent-command`),
  },
}

// ── Mapa de Superfície (grafo) ────────────────────────────────────────────────
export type GraphNodeType =
  | 'domain' | 'subdomain' | 'ip' | 'tech' | 'webserver'
  | 'exposure' | 'vuln' | 'stealer_family' | 'leaked_account' | 'breach'

export interface GraphNode {
  id: string
  type: GraphNodeType
  label: string
  meta: Record<string, unknown>
}
export type GraphEdgeType =
  | 'has_subdomain' | 'resolves_to' | 'runs' | 'served_by'
  | 'exposes' | 'vulnerable_to' | 'leaked' | 'via' | 'appears_in'
export interface GraphEdge {
  source: string
  target: string
  type: GraphEdgeType
}
export interface GraphStats {
  domains: number
  subdomains: number
  ips: number
  techs: number
  exposures: number
  vulns: number
  leaks: number
  families: number
  nodes: number
  edges: number
  truncated: number
}
export interface GraphResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
  stats: GraphStats
}

// ── Módulo ASM / Domínios ─────────────────────────────────────────────────────
export type DomainKind = 'vendor' | 'partner' | 'internal' | 'other'
export type ScanState = 'idle' | 'scanning' | 'done' | 'failed'

export interface DomainSummary {
  id: string
  domain: string
  name: string | null
  kind: DomainKind
  authorized: boolean
  scanState: ScanState
  scanStep?: string | null
  scanError?: string | null
  lastScanAt?: string | null
  assetCount: number
  aliveCount: number
  leakCount: number
  exposureCount: number
  riskScore: number
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'info'
  riskReasons?: string[]
  createdAt: string
  updatedAt: string
}

// O que mudou desde o scan anterior (computado a cada scan, ver asm/diff.js).
// `newAssets`/`missingAssets` são exemplos (até 20); use os counts p/ o total.
export interface DomainDiff {
  computedAt: string | null
  newAssets: Array<{ type: string; value: string; severity?: string }>
  missingAssets: Array<{ type: string; value: string }>
  newCount: number
  missingCount: number
  scoreDelta: number
}

// Um registro do histórico de monitoramento (1 por execução de scan).
export interface DomainScanRecord {
  id: string
  domainId: string
  ranAt: string
  trigger: 'manual' | 'monitor'
  authorized: boolean
  assetCount: number
  aliveCount: number
  exposureCount: number
  cveCount: number
  riskScore: number
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'info'
  newCount: number
  missingCount: number
  scoreDelta: number
}

export interface DomainDetail extends DomainSummary {
  notes?: string | null
  authorizedBy?: string | null
  authorizedAt?: string | null
  authorizationNote?: string | null
  lastDiff?: DomainDiff
}

export interface DomainAsset {
  id: string
  domainId: string
  type: 'subdomain' | 'web' | 'url' | 'exposure'
  value: string
  ips: string[]
  cname?: string | null
  alive: boolean
  statusCode?: number | null
  title?: string | null
  webServer?: string | null
  tech: string[]
  scheme?: string | null
  tlsIssuer?: string | null
  tlsExpiry?: string | null
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  label?: string | null
  cveId?: string | null
  source?: string | null
  firstSeen?: string | null
  lastSeen?: string | null
}

// ── Módulo Rede Interna ───────────────────────────────────────────────────────
export type InternalNetworkKind = 'lan' | 'dmz' | 'cloud' | 'other'
export type DeviceType =
  | 'server' | 'workstation' | 'hypervisor' | 'router' | 'switch' | 'firewall' | 'printer'
  | 'camera' | 'iot' | 'nas' | 'voip' | 'mobile' | 'unknown'
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface InternalNetworkSummary {
  id: string
  name: string
  description?: string | null
  kind: InternalNetworkKind
  authorized: boolean
  lastImportAt?: string | null
  lastImportBy?: string | null
  agent?: { hostname?: string | null; os?: string | null; version?: string | null }
  hostCount: number
  aliveCount: number
  riskyCount: number
  deviceTypeCounts: Record<string, number>
  riskScore: number
  riskLevel: RiskLevel
  riskReasons?: string[]
  createdAt: string
  updatedAt: string
}

export interface InternalNetworkDiff {
  computedAt: string | null
  newHosts: Array<{ ip: string; mac?: string | null; deviceType: string }>
  missingHosts: Array<{ ip: string; mac?: string | null; deviceType: string }>
  newCount: number
  missingCount: number
  scoreDelta: number
}

export interface InternalNetworkDetail extends InternalNetworkSummary {
  authorizedBy?: string | null
  authorizedAt?: string | null
  authorizationNote?: string | null
  lastDiff?: InternalNetworkDiff
}

export interface InternalPort {
  port: number
  proto?: string
  service?: string | null
  product?: string | null
  version?: string | null
}

export interface InternalHost {
  id: string
  networkId: string
  ip: string
  mac?: string | null
  macVendor?: string | null
  hostname?: string | null
  os?: string | null
  deviceType: DeviceType
  openPorts: InternalPort[]
  protocols: string[]
  severity: RiskLevel
  labels: string[]
  status?: 'online' | 'gone'
  goneSince?: string | null
  source?: string
  firstSeen?: string | null
  lastSeen?: string | null
}

export interface InternalScanRecord {
  id: string
  networkId: string
  ranAt: string
  trigger: 'agent' | 'watch'
  agentHost?: string | null
  hostCount: number
  aliveCount: number
  riskyCount: number
  riskScore: number
  riskLevel: RiskLevel
  newCount: number
  missingCount: number
  scoreDelta: number
}

export type LeakCategory = 'malware' | 'breach' | 'combolist'

export interface LeakedCredential {
  id: string
  domain: string
  domainId?: string | null
  category: LeakCategory
  account?: string | null
  provider?: string | null
  breachName?: string | null
  breachTitle?: string | null
  breachDate?: string | null
  addedDate?: string | null
  pwnCount?: number | null
  dataClasses: string[]
  hasPassword: boolean
  sourceUrl?: string | null
  stealerFamily?: string | null
  seenDate?: string | null
  description?: string | null
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  firstSeen?: string | null
}

export interface LeakProvider {
  id: string
  label: string
  needsKey: boolean
  configured: boolean
  real?: boolean
}

export interface LeakProviderReport {
  id: string
  ran: boolean
  available?: boolean
  reason?: string | null
  count?: number
}

// Métricas + gráficos do assessment de exposição (estilo QuimeraX).
export interface ExposureAssessment {
  riskScore: number
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'info'
  riskReasons: string[]
  metrics: {
    malwareCompromises: number
    leakedPasswords: number
    employeesAtRisk: number
    affectedUsers: number
    breachCount: number
  }
  timeline: Array<{ month: string; count: number }>
  stealerFamilies: Array<{ name: string; count: number; pct: number }>
}

// Linha do histórico de buscas (lista do módulo Vazamentos).
export interface LeakDomainSummary {
  id: string
  domain: string
  searchState: 'idle' | 'searching' | 'done' | 'failed'
  searchError?: string | null
  lastSearchAt?: string | null
  providersRan: string[]
  riskScore: number
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'info'
  malwareCompromises: number
  leakedPasswords: number
  employeesAtRisk: number
  affectedUsers: number
  breachCount: number
  logo?: string | null
  thirdPartyDomains?: Array<{ domain: string; occurrence: number }>
}

// Detalhe completo (GET /leaks/:domain).
export interface LeakAssessment {
  domain: string
  summary: LeakDomainSummary | null
  assessment: ExposureAssessment
  credentials: LeakedCredential[]
}

// Resultado imediato de uma busca (POST /leaks/search).
export interface LeakSearchResult {
  domain: string
  authorized: boolean
  providers: LeakProviderReport[]
  assessment: ExposureAssessment
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

// Domain pack do módulo de pentest (ETAPA 0 multi-domínio). `available` = executável
// hoje (status 'ready'); 'planned' = azure/ad/sap em construção (seletor desabilita).
export interface CredentialField {
  name: string
  label: string
  secret: boolean
  optional?: boolean
}
export interface DomainPackOption {
  id: string
  label: string
  note: string
  status: 'ready' | 'planned'
  available: boolean
  position: 'external' | 'network'
  checkpointPolicy: 'per-phase' | 'per-action'
  credentialHandling: 'none' | 'vault'
  requiresRunner: boolean
  credentialFields: CredentialField[]
}
export interface DomainPackInfo {
  default: string
  available: DomainPackOption[]
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
  // Domain pack do módulo de pentest. Ausente em engagements antigos → tratar como 'web'.
  domainPackId?: string
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
  domainPackId?: string
  kind?: 'interactive' | 'scheduled'
  status: 'queued' | 'running' | 'completed' | 'stopped' | 'failed'
  reason?: string | null
  steps: JobStep[]
  currentStep?: string | null
  findingsCount: number
  spentUsd: number
  attempts?: number
  maxAttempts?: number
  resume?: boolean
  queuedAt?: string | null
  startedAt?: string | null
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
  impact?: string
  recommendation?: string
  type?: string | null
  location?: string | null
  engagement_id: string
  engagement_name?: string
  // Taxonomia + rastreamento de remediação/regressão
  state?: 'confirmed' | 'probable' | 'informational' | 'false_positive'
  confidence?: 'high' | 'medium' | 'low'
  remediationStatus?: RemediationStatus
  fingerprint?: string
  firstSeen?: string | null
  lastSeen?: string | null
  // Proveniência — nem todo finding tem, watcher/agente preenche quando disponível
  phase?: number | null
  discoveredBy?: string | null
  owasp?: string | null
  cwe?: string | null
}

// Rastro do achado — reconstrução aproximada (por horário) do que o agente
// fez pouco antes de registrar o finding, a partir do ChatMessage já persistido.
export interface TraceMessage {
  type: 'agent_action' | 'agent_message'
  payload: Record<string, unknown>
  at: string
}
export interface FindingTrace {
  findingAt: string
  messages: TraceMessage[]
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
