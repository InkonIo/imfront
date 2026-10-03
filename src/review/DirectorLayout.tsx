import { useEffect, useState } from 'react'
import AuditHub from '../admin/AuditHub'
import { useAuth } from '../auth'
import ReviewQueue from './ReviewQueue'
import { reviewApi } from './api'
import type { ReviewSummary } from './types'
import '../admin/admin.css'
import '../inside/inside.css'
import './review.css'

type SectionId = 'review' | 'audit'

const SECTIONS: { id: SectionId; icon: string; label: string; hint: string }[] = [
  { id: 'review', icon: '🔎', label: 'Ждут проверки', hint: 'Подтверди выполнение и разбери флаги' },
  { id: 'audit', icon: '📜', label: 'Смены и журнал', hint: 'Отчёты по сменам, фото, история действий' },
]

export default function DirectorLayout() {
  const { user, logout } = useAuth()
  const [active, setActive] = useState<SectionId>('review')
  const [menuOpen, setMenuOpen] = useState(false)
  const [summary, setSummary] = useState<ReviewSummary | null>(null)

  // счётчик в левой панели обновляется раз в минуту
  useEffect(() => {
    let cancelled = false
    const load = () =>
      reviewApi
        .summary()
        .then((s) => {
          if (!cancelled) setSummary(s)
        })
        .catch(() => {})
    void load()
    const timer = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const current = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0]
  const pending = summary ? summary.openFlags + summary.awaitingItems : 0
  const outlets = user?.outlets ?? []

  function go(id: SectionId) {
    setActive(id)
    setMenuOpen(false)
  }

  return (
    <div className="layout">
      <div className={menuOpen ? 'overlay show' : 'overlay'} onClick={() => setMenuOpen(false)} />

      <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
        <div className="side-brand">
          <div className="logo">IM</div>
          <div>
            <div className="name">Директор</div>
            <div className="muted small">{user?.fullName}</div>
          </div>
        </div>

        <div className="side-shift">
          {outlets.length === 0 ? (
            <span className="text-danger">За тобой не закреплены точки</span>
          ) : (
            outlets.map((o) => <span key={o.id}>📍 {o.name}</span>)
          )}
        </div>

        <nav className="side-nav">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={s.id === current.id ? 'nav-item active' : 'nav-item'}
              onClick={() => go(s.id)}
            >
              <span className="nav-icon">{s.icon}</span>
              {s.label}
              {s.id === 'review' && pending > 0 && <span className="nav-badge alert">{pending}</span>}
            </button>
          ))}
        </nav>

        <div className="side-foot">
          <button className="btn ghost small" onClick={logout}>
            Выйти
          </button>
        </div>
      </aside>

      <main className="content">
        <header className="content-head">
          <button className="burger" onClick={() => setMenuOpen(true)} aria-label="Меню">
            ☰
          </button>
          <div>
            <h1>
              {current.icon} {current.label}
            </h1>
            <p className="muted small">{current.hint}</p>
          </div>
        </header>

        {current.id === 'review' && <ReviewQueue onSummary={setSummary} />}
        {current.id === 'audit' && <AuditHub />}
      </main>
    </div>
  )
}