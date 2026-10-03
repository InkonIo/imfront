import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api, setUnauthorizedHandler, tokenStore } from './api'
import { AuthContext } from './auth'
import type { AuthState } from './auth'
import type { Shift, User } from './types'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [shift, setShift] = useState<Shift | null>(null)
  const [loading, setLoading] = useState(() => tokenStore.get() !== null)

  /** Просто очистить сессию (например, после 401). */
  const clearSession = useCallback(() => {
    tokenStore.clear()
    setUser(null)
    setShift(null)
  }, [])

  /** Выход по кнопке: запрос уходит с текущим токеном, а сессия очищается сразу. */
  const logout = useCallback(() => {
    void api.logout().catch(() => {})
    clearSession()
  }, [clearSession])

  useEffect(() => {
    setUnauthorizedHandler(clearSession)
  }, [clearSession])

  useEffect(() => {
    if (!tokenStore.get()) return
    let cancelled = false
    ;(async () => {
      try {
        const me = await api.me()
        const current = await api.currentShift()
        if (cancelled) return
        setUser(me)
        setShift(current ?? null)
      } catch {
        if (!cancelled) clearSession()
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clearSession])

  const value = useMemo<AuthState>(
    () => ({
      user,
      shift,
      loading,
      logout,
      login: async (login, password) => {
        const res = await api.login(login, password)
        tokenStore.set(res.token)
        setUser(res.user)
        setShift((await api.currentShift()) ?? null)
      },
      changePassword: async (oldPassword, newPassword) => {
        await api.changePassword(oldPassword, newPassword)
        setUser(await api.me())
      },
      startShift: async (body) => {
        setShift(await api.startShift(body))
      },
      finishShift: async () => {
        await api.finishShift()
        setShift(null)
      },
    }),
    [user, shift, loading, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}