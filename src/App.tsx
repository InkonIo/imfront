import { useState } from 'react'
import type { ReactNode } from 'react'
import './App.css'
import { useAuth } from './auth'
import Login from './screens/Login'
import ChangePassword from './screens/ChangePassword'
import Wizard from './screens/Wizard'
import Home from './screens/Home'
import InsideLayout from './inside/InsideLayout'
import AdminLayout from './admin/AdminLayout'

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <main className="shell">{children}</main>
    </div>
  )
}

export default function App() {
  const { user, shift, loading } = useAuth()
  const [view, setView] = useState<'work' | 'settings'>('work')

  if (loading) return <Centered><div className="muted">Загрузка…</div></Centered>
  if (!user) return <Login />
  if (user.mustChangePassword) return <Centered><ChangePassword /></Centered>

  const isAdmin = user.accountRole === 'SUPER_ADMIN'
  const openSettings = isAdmin ? () => setView('settings') : undefined

  if (isAdmin && view === 'settings') return <AdminLayout onExit={() => setView('work')} />
  if (!shift) return <Centered><Wizard onOpenSettings={openSettings} /></Centered>
  if (shift.shiftRole === 'INSIDE') return <InsideLayout onOpenSettings={openSettings} />
  return <Centered><Home onOpenSettings={openSettings} /></Centered>
}