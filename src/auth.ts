import { createContext, useContext } from 'react'
import type { Shift, StartShiftBody, User } from './types'

export interface AuthState {
  user: User | null
  shift: Shift | null
  loading: boolean
  login: (login: string, password: string) => Promise<void>
  logout: () => void
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>
  startShift: (body: StartShiftBody) => Promise<void>
  finishShift: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth вне AuthProvider')
  return ctx
}