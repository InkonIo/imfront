import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import './App.css'
import { useAuth } from './auth'
import Login from './screens/Login'
import ChangePassword from './screens/ChangePassword'
import Wizard from './screens/Wizard'
import InsideLayout from './inside/InsideLayout'
import AdminLayout from './admin/AdminLayout'
import DirectorLayout from './review/DirectorLayout'
import EmployeeLayout from './employee/EmployeeLayout'
import SchedulerShell, { ModeChooser } from './sched/SchedulerShell'
import { useCaps } from './sched/useCaps'

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
  // менеджер, которого супер-админ назначил ответственным за расписание, может зайти без смены
  const [mode, setMode] = useState<'choose' | 'shift' | 'sched'>('choose')
  const isMgr = user?.accountRole === 'MANAGER'
  const { caps, refresh } = useCaps(isMgr, user?.id)
  useEffect(() => {
    if (!shift) setMode('choose')
  }, [shift])

  if (loading) return <Centered><div className="muted">Загрузка…</div></Centered>
  if (!user) return <Login />
  if (user.mustChangePassword) return <Centered><ChangePassword /></Centered>
  // сотрудник видит только свой экран, ничего из менеджерского
  if (String(user.accountRole) === 'EMPLOYEE') return <EmployeeLayout />
  if (user.accountRole === 'DIRECTOR') return <DirectorLayout />

  const isAdmin = user.accountRole === 'SUPER_ADMIN'
  const openSettings = isAdmin ? () => setView('settings') : undefined

  if (isAdmin && view === 'settings') return <AdminLayout onExit={() => setView('work')} />

  if (isMgr && !shift) {
    if (!caps) return <Centered><div className="muted">Загрузка…</div></Centered>
    if (caps.canManageSchedule) {
      if (mode === 'sched') return <SchedulerShell onBack={() => setMode('choose')} onChanged={() => void refresh()} />
      if (mode === 'choose') {
        return <ModeChooser pending={caps.pending} onShift={() => setMode('shift')} onSched={() => setMode('sched')} />
      }
    }
  }

  if (!shift) return <Centered><Wizard onOpenSettings={openSettings} /></Centered>
  // любая смена (инсайд, кухня, прилавок; утро, вечер, промеж) работает по своему маршруту
  return <InsideLayout onOpenSettings={openSettings} />
}