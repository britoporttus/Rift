'use client'
import { useState, useEffect, useCallback } from 'react'
import { api, User } from '@/lib/api'

export function useAuth() {
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

  return { user, loading, login, logout, refreshUser }
}
