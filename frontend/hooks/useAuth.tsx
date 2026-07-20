'use client'
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { api, User } from '@/lib/api'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// P1-28 (auditoria 2026-07-20): useAuth() era um hook solto — cada componente
// que o chamava (layout + página, às vezes mais de um por tela) disparava seu
// próprio fetch de /api/auth/me, com estados de user/loading desacoplados
// (gates de isAdmin podiam piscar de forma inconsistente entre Sidebar e
// conteúdo no mesmo render). Um único Provider no layout raiz carrega o
// usuário UMA vez; useAuth() agora só lê do Context.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // A sessão vive num cookie HttpOnly — não há nada legível em JS para checar
  // antes de perguntar ao backend; /me responde 401 se não houver cookie válido.
  useEffect(() => {
    api.auth.me()
      .then(({ user }) => setUser(user))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { user } = await api.auth.login(email, password)
    setUser(user)
    return user
  }, [])

  const logout = useCallback(async () => {
    await api.auth.logout().catch(() => {})
    setUser(null)
  }, [])

  // Usado após o redirect do SSO — o cookie já foi setado pelo POST /exchange,
  // só falta carregar o perfil.
  const refreshUser = useCallback(async () => {
    const { user } = await api.auth.me()
    setUser(user)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth() precisa ser chamado dentro de <AuthProvider>')
  return ctx
}
