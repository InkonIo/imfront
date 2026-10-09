import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { employeeApi } from './api'
import type { EmpMe } from './api'
import EmployeeCalendar from './EmployeeCalendar'
import EmployeeRequests from './EmployeeRequests'
import './employee.css'

/**
 * Весь интерфейс роли EMPLOYEE. Намеренно НЕ использует ни InsideLayout, ни компоненты менеджера/директора:
 * сотрудник не должен даже случайно получить их экраны.
 */
export default function EmployeeLayout() {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState<'schedule' | 'requests'>('schedule')
  const [me, setMe] = useState<EmpMe | null>(null)
  const [prefill, setPrefill] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => { employeeApi.me().then(setMe).catch(() => {}) }, [])

  function order(day: string) {
    setPrefill(day)
    setTab('requests')
  }

  return (
    <div className="emp">
      <header className="emp-head">
        <div className="emp-logo">IM</div>
        <div className="emp-who">
          <strong>{me?.fullName ?? user?.fullName}</strong>
          <small>{[me?.position, me?.branch].filter(Boolean).join(' · ')}</small>
        </div>
        <button className="emp-link" onClick={logout}>Выйти</button>
      </header>

      <nav className="emp-tabs">
        <button className={tab === 'schedule' ? 'on' : ''} onClick={() => setTab('schedule')}>📅 Моё расписание</button>
        <button className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>📝 Мои заявки</button>
      </nav>

      <main className="emp-main">
        {tab === 'schedule' && <EmployeeCalendar version={version} onOrder={order} />}
        {tab === 'requests' && <EmployeeRequests prefill={prefill} onUsed={() => setPrefill(null)} onChanged={() => setVersion((v) => v + 1)} />}
      </main>
    </div>
  )
}
