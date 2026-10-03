import { useState } from 'react'
import { useAuth } from '../auth'
import { DAY_PART_LABEL, SHIFT_ROLE_LABEL } from '../types'

export default function Home({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { user, shift, finishShift, logout } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!shift) return null

  async function finish() {
    if (!confirm('Завершить смену?')) return
    setBusy(true)
    setError('')
    try {
      await finishShift()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
      setBusy(false)
    }
  }

  const started = new Date(shift.startedAt).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="card wide">
      <header className="topbar">
        <div>
          <div className="muted small">Смена идёт</div>
          <div className="name">{user?.fullName}</div>
        </div>
        <div className="topbar-actions">
          {onOpenSettings && (
            <button className="btn ghost small" onClick={onOpenSettings}>
              ⚙️ Настройки
            </button>
          )}
          <button className="btn ghost small" onClick={logout}>
            Выйти
          </button>
        </div>
      </header>

      <div className="badges">
        <span className="badge">📍 {shift.outletName}</span>
        <span className="badge">{SHIFT_ROLE_LABEL[shift.shiftRole]}</span>
        <span className="badge">{DAY_PART_LABEL[shift.dayPart]}</span>
        <span className="badge">с {started}</span>
      </div>

      <div className="placeholder">
        <div className="tile-icon">✅</div>
        <h2>Чек-лист появится здесь</h2>
        <p className="muted">Следующий шаг: маршрут инсайда с пунктами, таймингами и фото.</p>
      </div>

      {error && <div className="error">{error}</div>}
      <button className="btn danger" onClick={finish} disabled={busy}>
        Завершить смену
      </button>
    </div>
  )
}