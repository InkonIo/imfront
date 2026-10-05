import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { DAY_PART_LABEL } from '../types'
import type { Checklist } from '../types'
import { DailyPage, InventoryPage, ProblemsPage, RoutePage, SummaryPage } from './pages'
import { DAILY_SECTION, pct } from './utils'
import NotificationBell from '../notify/NotificationBell'
import RatingPage from '../rating/RatingPage'
import './inside.css'

type SectionId = 'route' | 'daily' | 'problems' | 'inventory' | 'summary' | 'rating'

const SECTIONS: { id: SectionId; icon: string; label: string; eveningOnly?: boolean }[] = [
  { id: 'route', icon: '🧭', label: 'Маршрут' },
  { id: 'daily', icon: '📅', label: 'Регламент дня' },
  { id: 'problems', icon: '📸', label: 'Проблемные зоны' },
  { id: 'inventory', icon: '📦', label: 'Инвентаризация', eveningOnly: true },
  { id: 'rating', icon: '🏆', label: 'Рейтинг' },
  { id: 'summary', icon: '📊', label: 'Итоги смены' },
]

export default function InsideLayout({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { user, shift, finishShift, logout } = useAuth()
  const [active, setActive] = useState<SectionId>('route')
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [checklist, setChecklist] = useState<Checklist | null | undefined>(undefined)
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    try {
      const c = await api.checklistCurrent()
      setChecklist(c ?? null)
      setLoadError('')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Ошибка')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

    // сигнал «я тут»: раз в минуту, пока вкладка видна
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState === 'visible') void api.ping().catch(() => {})
    }
    beat()
    const timer = setInterval(beat, 60_000)
    document.addEventListener('visibilitychange', beat)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', beat)
    }
  }, [])

  if (!shift) return null

  const sections = SECTIONS.filter((s) => !s.eveningOnly || shift.dayPart === 'EVENING')
  const current = sections.find((s) => s.id === active) ?? sections[0]
  const started = new Date(shift.startedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const p = checklist ? pct(checklist.completed, checklist.total) : 0

  function badge(id: SectionId) {
    if (!checklist) return null
    if (id === 'problems' && checklist.problems > 0)
      return <span className="nav-badge danger">{checklist.problems}</span>
    if (id === 'daily') {
      const left = checklist.items.filter((i) => i.sectionTitle === DAILY_SECTION && i.status === 'PENDING').length
      return left > 0 ? <span className="nav-badge">{left}</span> : null
    }
    if (id === 'route') {
      const left = checklist.total - checklist.completed
      return left > 0 ? <span className="nav-badge">{left}</span> : null
    }
    return null
  }

  function go(id: SectionId) {
    setActive(id)
    setMenuOpen(false)
  }

  async function finish() {
    const left = checklist ? checklist.total - checklist.completed : 0
    const text = left > 0 ? `Осталось ${left} пунктов. Всё равно завершить смену?` : 'Завершить смену?'
    if (!confirm(text)) return
    setBusy(true)
    setError('')
    try {
      await finishShift()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
      setBusy(false)
    }
  }

  const pageProps = { shift, checklist: checklist ?? null, onChange: setChecklist }

  return (
  <div className="layout">
    <div
      className={menuOpen ? 'overlay show' : 'overlay'}
      onClick={() => setMenuOpen(false)}
    />

    <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>

      <div className="side-brand">
        <div className="logo">IM</div>
        <div>
          <div className="name">Инсайд</div>
          <div className="muted small">{user?.fullName}</div>
        </div>

        <NotificationBell />
      </div>

      <div className="side-shift">
        <span>📍 {shift.outletName}</span>
        <span className="muted">
          {shift.dayPart === 'MORNING' ? '🌅' : '🌙'}{' '}
          {DAY_PART_LABEL[shift.dayPart]} · с {started}
        </span>
      </div>

      {checklist && (
        <div className="side-progress">
          <div className="panel-row">
            <span className="muted">Маршрут</span>
            <strong>{p}%</strong>
          </div>

          <div className="progress">
            <span style={{ width: `${p}%` }} />
          </div>
        </div>
      )}

      <nav className="side-nav">
        {sections.map((s) => (
          <button
            key={s.id}
            className={s.id === current.id ? 'nav-item active' : 'nav-item'}
            onClick={() => go(s.id)}
          >
            <span className="nav-icon">{s.icon}</span>
            {s.label}
            {badge(s.id)}
          </button>
        ))}
      </nav>

      <div className="side-foot">
        {onOpenSettings && (
          <button className="btn" onClick={onOpenSettings}>
            ⚙️ Настройки
          </button>
        )}

        {error && <div className="error">{error}</div>}

        <button
          className="btn danger"
          onClick={finish}
          disabled={busy}
        >
          Завершить смену
        </button>

        <button className="btn ghost small" onClick={logout}>
          Выйти
        </button>
      </div>
    </aside>

    <main className="content">
      <header className="content-head">
        <button
          className="burger"
          onClick={() => setMenuOpen(true)}
          aria-label="Меню"
        >
          ☰
        </button>

        <h1>
          {current.icon} {current.label}
        </h1>
      </header>

      {checklist === undefined && !loadError && (
        <div className="muted">Загружаем чек-лист…</div>
      )}

      {loadError && (
        <div className="page">
          <div className="error">{loadError}</div>
          <button className="btn" onClick={() => void load()}>
            Повторить
          </button>
        </div>
      )}

      {checklist !== undefined && !loadError && (
        <>
          {current.id === 'route' && <RoutePage {...pageProps} />}
          {current.id === 'daily' && <DailyPage {...pageProps} />}
          {current.id === 'problems' && <ProblemsPage {...pageProps} />}
          {current.id === 'inventory' && <InventoryPage {...pageProps} />}
          {current.id === 'summary' && <SummaryPage {...pageProps} />}
          {current.id === 'rating' && <RatingPage />}
        </>
      )}
    </main>
  </div>
  )
}