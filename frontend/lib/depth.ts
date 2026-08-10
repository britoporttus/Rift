// Profundidade de leitura (Fase 6) — técnico / gestor / diretor.
//
// `role` (acesso) é ortogonal a `depth` (quanto a tela mostra). O padrão vem do
// cadastro (User.depth, servido pelo /me). Operador INTERNO (admin/user) pode
// alternar — a escolha vive em localStorage, sem tocar no backend, porque é
// preferência de leitura, não controle de acesso. Cliente fica PRESO ao seu depth.
import type { User, Depth } from './api'

const KEY = 'rift-depth'

export const DEPTH_LABEL: Record<Depth, string> = {
  tecnico: 'Técnico',
  gestor:  'Gestor',
  diretor: 'Diretoria',
}

export const DEPTH_HINT: Record<Depth, string> = {
  tecnico: 'todos os detalhes técnicos',
  gestor:  'andamento das correções',
  diretor: 'o veredito, em uma tela',
}

export function canSwitchDepth(user?: Pick<User, 'role'> | null): boolean {
  return !!user && user.role !== 'client'
}

// Profundidade EFETIVA: cliente segue o cadastro; interno pode ter sobrescrito.
export function effectiveDepth(user?: Pick<User, 'role' | 'depth'> | null): Depth {
  const base = (user?.depth as Depth) || 'tecnico'
  if (!canSwitchDepth(user)) return base
  if (typeof window === 'undefined') return base
  const override = window.localStorage.getItem(KEY) as Depth | null
  return override && ['tecnico', 'gestor', 'diretor'].includes(override) ? override : base
}

export function setDepthOverride(d: Depth) {
  if (typeof window !== 'undefined') window.localStorage.setItem(KEY, d)
}

// A "casa" de cada profundidade — onde a pessoa aterrissa.
export function homeForDepth(d: Depth): string {
  if (d === 'diretor') return '/executivo'
  if (d === 'gestor')  return '/painel'
  return '/dominios'
}
