import { Skull, OctagonAlert, AlertTriangle, AlertCircle, Info as InfoIcon } from 'lucide-react'

// Fonte única de cores/ordem de severidade — antes duplicado em ~6 componentes
// (dashboard, findings, admin, FindingsReport…), com o "high" divergindo entre
// #F59E0B / #f97316. Consolidar aqui evita a inconsistência.
export const SEV_COLOR: Record<string, string> = {
  critical: '#F04452',
  high:     '#F5892E',
  medium:   '#eab308',
  low:      '#22c55e',
  info:     '#3b82f6',
}

export const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const

// Ícone por severidade — cor sozinha não diferencia bem em diagramas densos
// (Mapa/Caminho); o ícone dá uma 2ª pista visual, sem depender só da cor.
export const SEV_ICON: Record<string, typeof Skull> = {
  critical: Skull,
  high:     OctagonAlert,
  medium:   AlertTriangle,
  low:      AlertCircle,
  info:     InfoIcon,
}

// SEC-5: só permite URLs http(s). URLs de findings vêm de dados do ALVO (hostil),
// então um `javascript:`/`data:` viraria XSS na origem da app — e mesmo com o JWT
// em cookie HttpOnly (não mais localStorage), esse XSS ainda sequestra a sessão via
// requests same-origin com o cookie anexado. Devolve a href segura ou null (aí o
// chamador renderiza como texto).
export function safeHref(uri?: string | null): string | null {
  if (!uri) return null
  const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  try {
    const u = new URL(String(uri), base)
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null
  } catch {
    return null
  }
}
