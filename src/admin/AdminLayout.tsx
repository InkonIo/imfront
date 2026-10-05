import { useState } from 'react'
import { useAuth } from '../auth'
import ReviewQueue from '../review/ReviewQueue'
import AuditHub from './AuditHub'
import CitiesPage from './CitiesPage'
import OutletsPage from './OutletsPage'
import UsersPage from './UsersPage'
import './admin.css'
import TemplatesPage from '../template/TemplatesPage'
import RatingPage from '../rating/RatingPage'
import NotificationBell from '../notify/NotificationBell'

type SectionId = 'review' | 'audit' | 'users' | 'outlets' | 'cities' | 'templates' | 'rating'

const SECTIONS: { id: SectionId; icon: string; label: string; hint: string }[] = [
  { id: 'review', icon: '🔎', label: 'Проверка', hint: 'Подтверждение пунктов и разбор флагов по всем точкам' },
  { id: 'audit', icon: '📜', label: 'Аудит', hint: 'Кто, что и когда делал: смены, пункты, фото' },
  { id: 'templates', icon: '🧭', label: 'Маршруты', hint: 'Чек-листы для ролей: пункты, время, фото, инструкции' },
  { id: 'users', icon: '👥', label: 'Пользователи', hint: 'Менеджеры, роли и доступ к точкам' },
  { id: 'outlets', icon: '📍', label: 'Точки', hint: 'Заведения, адреса, включение и выключение' },
  { id: 'cities', icon: '🏙️', label: 'Города', hint: 'Справочник городов' },
  { id: 'rating', icon: '🏆', label: 'Рейтинг', hint: 'Подиум и места по баллам за период' },
]

export default function AdminLayout({ onExit }: { onExit: () => void }) {
  const { user, logout } = useAuth()
  const [active, setActive] = useState<SectionId>('review')
  const [menuOpen, setMenuOpen] = useState(false)
  const current = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0]

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
            <div className="name">Настройки</div>
            <div className="muted small">{user?.fullName}</div>
          </div>
          <NotificationBell />
        </div>

        <div className="side-shift">
          <span>⚙️ Панель суперадмина</span>
          <span className="muted">Изменения сразу видны всем</span>
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
            </button>
          ))}
        </nav>

        <div className="side-foot">
          <button className="btn" onClick={onExit}>
            ← Вернуться к работе
          </button>
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

        {current.id === 'review' && <ReviewQueue />}
        {current.id === 'audit' && <AuditHub />}
        {current.id === 'templates' && <TemplatesPage />}
        {current.id === 'rating' && <RatingPage />}
        {current.id === 'users' && <UsersPage />}
        {current.id === 'outlets' && <OutletsPage />}
        {current.id === 'cities' && <CitiesPage />}
      </main>
    </div>
  )
}