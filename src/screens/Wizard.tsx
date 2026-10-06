import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import NotificationBell from '../notify/NotificationBell'
import { scheduleApi } from '../schedule/api'
import type { MySlot } from '../schedule/types'
import { POSITION_LABEL } from '../schedule/types'
import { DAY_PART_LABEL, SHIFT_ROLE_LABEL } from '../types'
import type { DayPart, Outlet, ShiftRole } from '../types'

const ROLES: { value: ShiftRole; icon: string; hint: string }[] = [
  { value: 'INSIDE', icon: '🧭', hint: 'Контроль зала и кухни по маршруту' },
  { value: 'PRODUCTION_MANAGER', icon: '🍔', hint: 'Производство, качество, сроки' },
  { value: 'SERVICE_MANAGER', icon: '🛎️', hint: 'Обслуживание гостей и зал' },
]

const PARTS: { value: DayPart; icon: string; hint: string }[] = [
  { value: 'MORNING', icon: '🌅', hint: 'Открытие, приём ночников, готовность к 10:00' },
  { value: 'EVENING', icon: '🌙', hint: 'Приём смены, инвентаризация, закрытие' },
]

export default function Wizard({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { user, logout, startShift } = useAuth()
  const [planned, setPlanned] = useState<MySlot[] | null>(null)
  const [manual, setManual] = useState(false)
  const [outlets, setOutlets] = useState<Outlet[] | null>(null)
  const [outletId, setOutletId] = useState<number | null>(null)
  const [role, setRole] = useState<ShiftRole | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // смены на сегодня по опубликованному графику
  useEffect(() => {
    let cancelled = false
    scheduleApi
      .today()
      .then((s) => {
        if (!cancelled) setPlanned(s)
      })
      .catch(() => {
        if (!cancelled) setPlanned([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      try {
        let list = user.outlets
        if (list.length === 0 && user.accountRole === 'SUPER_ADMIN') list = await api.adminOutlets()
        list = list.filter((o) => o.active)
        if (cancelled) return
        setOutlets(list)
        if (list.length === 1) setOutletId(list[0].id)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Ошибка')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  async function begin(body: { outletId: number; shiftRole: ShiftRole; dayPart: DayPart }) {
    setError('')
    setBusy(true)
    try {
      await startShift(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
      setBusy(false)
    }
  }

  const step = outletId === null ? 1 : role === null ? 2 : 3
  const outletName = outlets?.find((o) => o.id === outletId)?.name
  const showPlanned = !manual && planned !== null && planned.length > 0

  function back() {
    setError('')
    if (step === 3) setRole(null)
    else if (step === 2 && (outlets?.length ?? 0) > 1) setOutletId(null)
  }
  const canGoBack = step === 3 || (step === 2 && (outlets?.length ?? 0) > 1)

  return (
    <div className="card wide">
      <header className="topbar">
        <div>
          <div className="muted small">Привет,</div>
          <div className="name">{user?.fullName}</div>
        </div>
        <div className="topbar-actions">
          <NotificationBell />
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

      {planned === null && <div className="muted center-text">Загрузка…</div>}

      {/* ---------- по графику ---------- */}
      {showPlanned && (
        <>
          <h1>Сегодня по графику</h1>
          <div className="grid two">
            {planned.map((p) => (
              <button
                key={`${p.outletId}${p.dayPart}${p.role}`}
                className="tile"
                disabled={busy}
                onClick={() => void begin({ outletId: p.outletId, shiftRole: p.role, dayPart: p.dayPart })}
              >
                <span className="tile-icon">{p.dayPart === 'MORNING' ? '🌅' : '🌙'}</span>
                <span className="tile-title">
                  {DAY_PART_LABEL[p.dayPart]} · {POSITION_LABEL[p.role]}
                </span>
                <span className="tile-hint">📍 {p.outletName}. Нажми, чтобы начать смену</span>
              </button>
            ))}
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn ghost" onClick={() => setManual(true)}>
            Выхожу не по графику (подмена)
          </button>
        </>
      )}

      {/* ---------- ручной выбор (запасной вариант) ---------- */}
      {planned !== null && !showPlanned && (
        <>
          {planned.length === 0 && !manual && (
            <p className="muted">На сегодня тебя нет в графике. Выбери смену вручную, она будет отмечена как «вне графика».</p>
          )}

          <div className="steps">
            {[1, 2, 3].map((n) => (
              <span key={n} className={n === step ? 'dot active' : n < step ? 'dot done' : 'dot'} />
            ))}
          </div>

          {outlets === null && !error && <div className="muted center-text">Загрузка…</div>}
          {outlets !== null && outlets.length === 0 && (
            <div className="error">За тобой не закреплена ни одна точка. Попроси суперадмина.</div>
          )}

          {outlets !== null && outlets.length > 0 && step === 1 && (
            <>
              <h1>Где ты сегодня?</h1>
              <div className="grid">
                {outlets.map((o) => (
                  <button key={o.id} className="tile" onClick={() => setOutletId(o.id)}>
                    <span className="tile-icon">📍</span>
                    <span className="tile-title">{o.name}</span>
                    <span className="tile-hint">
                      {o.cityName}
                      {o.address ? `, ${o.address}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1>Кто ты сегодня?</h1>
              <p className="muted">Точка: {outletName}</p>
              <div className="grid">
                {ROLES.map((r) => (
                  <button key={r.value} className="tile" onClick={() => setRole(r.value)}>
                    <span className="tile-icon">{r.icon}</span>
                    <span className="tile-title">{SHIFT_ROLE_LABEL[r.value]}</span>
                    <span className="tile-hint">{r.hint}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 3 && role && (
            <>
              <h1>Какая смена?</h1>
              <p className="muted">
                {outletName} · {SHIFT_ROLE_LABEL[role]}
              </p>
              <div className="grid two">
                {PARTS.map((p) => (
                  <button
                    key={p.value}
                    className="tile"
                    disabled={busy}
                    onClick={() => outletId !== null && void begin({ outletId, shiftRole: role, dayPart: p.value })}
                  >
                    <span className="tile-icon">{p.icon}</span>
                    <span className="tile-title">{DAY_PART_LABEL[p.value]}</span>
                    <span className="tile-hint">{p.hint}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {error && <div className="error">{error}</div>}
          {canGoBack && (
            <button className="btn ghost" onClick={back} disabled={busy}>
              ← Назад
            </button>
          )}
          {manual && planned.length > 0 && (
            <button className="btn ghost" onClick={() => setManual(false)}>
              ← К сменам по графику
            </button>
          )}
        </>
      )}
    </div>
  )
}