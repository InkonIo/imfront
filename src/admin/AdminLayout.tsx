import { useState } from 'react'
import { useAuth } from '../auth'
import AuditHub from './AuditHub'
import CitiesPage from './CitiesPage'
import OutletsPage from './OutletsPage'
import UsersPage from './UsersPage'
import './admin.css'

type SectionId = 'audit' | 'users' | 'outlets' | 'cities'

const SECTIONS: { id: SectionId; icon: string; label: string; hint: string }[] = [
  { id: 'audit', icon: '📜', label: 'Аудит', hint: 'Кто, что и когда делал: входы, смены, пункты, фото' },
  { id: 'users', icon: '👥', label: 'Пользователи', hint: 'Менеджеры, роли и доступ к точкам' },
  { id: 'outlets', icon: '📍', label: 'Точки', hint: 'Заведения, адреса, включение и выключение' },
  { id: 'cities', icon: '🏙️', label: 'Города', hint: 'Справочник городов' },
]

export default function AdminLayout({ onExit }: { onExit: () => void }) {
  const { user, logout } = useAuth()
  const [active, setActive] = useState<SectionId>('audit')
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

        {current.id === 'audit' && <AuditHub />}
        {current.id === 'users' && <UsersPage />}
        {current.id === 'outlets' && <OutletsPage />}
        {current.id === 'cities' && <CitiesPage />}
      </main>
    </div>
  )
}