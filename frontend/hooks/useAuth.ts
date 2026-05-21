'use client'
import { useState, useEffect, useCallback } from 'react'
import { api, User } from '@/lib/api'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = localStorage.getItem('rift_token')
    if (!t) { setLoading(false); return }
    api.auth.me()
      .then(({ user }) => setUser(user))
      .catch(() => localStorage.removeItem('rift_token'))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { token, user } = await api.auth.login(email, password)
    localStorage.setItem('rift_token', token)
    setUser(user)
    return user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('rift_token')
    setUser(null)
  }, [])

  // Used after SSO redirect — stores the JWT and loads the user profile
  const setToken = useCallback(async (token: string) => {
    localStorage.setItem('rift_token', token)
    const { user } = await api.auth.me()
    setUser(user)
  }, [])

  return { user, loading, login, logout, setToken }
}
