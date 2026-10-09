import { useAuth } from '../auth'
import ScheduleHub from './ScheduleHub'
import './sched.css'

/** Отдельный экран «Расписание» для ответственной, когда у неё нет открытой смены. */
export default function SchedulerShell({ onBack, onChanged }: { onBack: () => void; onChanged: () => void }) {
  const { user, logout } = useAuth()
  return (
    <div className="ext shell-wrap">
      <header className="shell-head">
        <button className="ext-btn" onClick={onBack}>← Назад</button>
        <strong>Расписание</strong>
        <span className="muted-s">{user?.fullName}</span>
        <button className="ext-btn" onClick={logout}>Выйти</button>
      </header>
      <ScheduleHub onChanged={onChanged} />
    </div>
  )
}

/** Выбор для ответственной, если смена не начата: идти на смену или в расписание. */
export function ModeChooser({ pending, onShift, onSched }: { pending: number; onShift: () => void; onSched: () => void }) {
  const { user, logout } = useAuth()
  return (
    <div className="ext choose">
      <div className="choose-box">
        <h2>Привет, {user?.fullName?.split(' ')[0]}</h2>
        <button className="ext-btn primary big" onClick={onShift}>Начать смену</button>
        <button className="ext-btn big" onClick={onSched}>
          Расписание{pending > 0 && <span className="dot-badge">{pending}</span>}
        </button>
        <button className="ext-btn link" onClick={logout}>Выйти</button>
      </div>
    </div>
  )
}