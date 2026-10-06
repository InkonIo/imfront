import { useEffect, useState } from 'react'
import { errorText } from '../admin/ui'
import { scheduleApi } from './api'
import { POSITION_LABEL } from './types'
import type { MySlot } from './types'

const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const iso = (d: Date) => d.toLocaleDateString('en-CA')

/** Мои смены на 2 недели вперёд (только опубликованный график). */
export default function MySchedulePage() {
  const [items, setItems] = useState<MySlot[] | null>(null)
  const [error, setError] = useState('')
  const today = iso(new Date())

  useEffect(() => {
    let cancelled = false
    const to = new Date()
    to.setDate(to.getDate() + 13)
    scheduleApi
      .my(iso(new Date()), iso(to))
      .then((list) => {
        if (!cancelled) setItems(list)
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <div className="error">{error}</div>
  if (!items) return <div className="muted">Загрузка…</div>

  if (items.length === 0) {
    return (
      <div className="placeholder">
        <div className="tile-icon">🗓</div>
        <h2>Смен пока нет</h2>
        <p className="muted">Когда директор опубликует график, твои смены появятся здесь и придут в 🔔 и Telegram.</p>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="section-items">
        {items.map((s) => {
          const d = new Date(`${s.date}T12:00:00`)
          const isToday = s.date === today
          return (
            <div key={`${s.date}${s.dayPart}${s.role}`} className={isToday ? 'panel my-shift today' : 'panel my-shift'}>
              <div className="panel-row">
                <h2>
                  {DOW[d.getDay()]} {s.date.slice(8, 10)}.{s.date.slice(5, 7)}
                  {isToday && <span className="chip my-today">сегодня</span>}
                </h2>
                <span className="chip">
                  {s.dayPart === 'MORNING' ? '🌅 Утро' : '🌙 Вечер'} · {POSITION_LABEL[s.role]}
                </span>
              </div>
              <p className="muted small">📍 {s.outletName}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}