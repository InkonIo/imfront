import { useCallback, useEffect, useState } from 'react'
import { errorText } from '../admin/ui'
import type { DayPart } from '../types'
import { scheduleApi } from './api'
import { WEEKDAY_SHORT, limitText, shiftLabel } from './types'
import type { Limit, MySlot } from './types'

const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const iso = (d: Date) => d.toLocaleDateString('en-CA')
const PART_OPTIONS: { value: DayPart | ''; label: string }[] = [
  { value: '', label: 'Весь день' },
  { value: 'MORNING', label: '🌅 Утро' },
  { value: 'EVENING', label: '🌙 Вечер' },
  { value: 'MIDDLE', label: '🌤 Промеж' },
]

/** Мои смены на 2 недели + мои пожелания «когда я не могу». */
export default function MySchedulePage() {
  const [items, setItems] = useState<MySlot[] | null>(null)
  const [limits, setLimits] = useState<Limit[] | null>(null)
  const [error, setError] = useState('')
  const today = iso(new Date())

  const load = useCallback(async () => {
    try {
      const to = new Date()
      to.setDate(to.getDate() + 13)
      const [s, l] = await Promise.all([scheduleApi.my(iso(new Date()), iso(to)), scheduleApi.myLimits()])
      setItems(s)
      setLimits(l)
      setError('')
    } catch (err) {
      setError(errorText(err))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="page">
      {error && <div className="error">{error}</div>}

      <section className="panel">
        <h2>Мои смены</h2>
        {items === null ? (
          <div className="muted">Загрузка…</div>
        ) : items.length === 0 ? (
          <p className="muted">Смен пока нет. Когда директор опубликует график, они появятся здесь и придут в 🔔 и Telegram.</p>
        ) : (
          <div className="my-shifts">
            {items.map((s) => {
              const d = new Date(`${s.date}T12:00:00`)
              const isToday = s.date === today
              return (
                <div key={`${s.date}${s.dayPart}${s.role}${s.startTime ?? ''}`} className={isToday ? 'my-shift today' : 'my-shift'}>
                  <b>
                    {DOW[d.getDay()]} {s.date.slice(8, 10)}.{s.date.slice(5, 7)}
                  </b>
                  {isToday && <span className="chip my-today">сегодня</span>}
                  <span>{shiftLabel(s)}</span>
                  <span className="muted small">📍 {s.outletName}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <LimitsPanel limits={limits} onChange={load} />
    </div>
  )
}

function LimitsPanel({ limits, onChange }: { limits: Limit[] | null; onChange: () => void }) {
  const [days, setDays] = useState<number[]>([])
  const [part, setPart] = useState<DayPart | ''>('')
  const [temporary, setTemporary] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const toggleDay = (n: number) => setDays((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort()))

  async function add() {
    setError('')
    if (days.length === 0) return setError('Выбери хотя бы один день недели')
    if (temporary && !from && !to) return setError('Укажи срок или выбери «Постоянно»')
    setBusy(true)
    try {
      await scheduleApi.addMyLimit({
        weekdays: days,
        dayPart: part || null,
        from: temporary ? from || null : null,
        to: temporary ? to || null : null,
        note: note.trim() || null,
      })
      setDays([])
      setNote('')
      onChange()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: number) {
    if (!confirm('Удалить это пожелание?')) return
    try {
      await scheduleApi.deleteMyLimit(id)
      onChange()
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <section className="panel my-limits">
      <h2>🙅 Когда я не могу</h2>
      <p className="muted small">
        Директор учитывает это при составлении графика. Если ничего не указано, ты доступен полностью: до 5 смен в неделю.
      </p>

      {limits && limits.length > 0 && (
        <div className="sch-limit-list">
          {limits.map((l) => (
            <span key={l.id} className="sch-limit-chip" title={l.note ?? ''}>
              {limitText(l)}
              {l.note ? ` (${l.note})` : ''}
              <button type="button" onClick={() => void remove(l.id)} aria-label="Удалить">
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="my-limit-form">
        <div className="my-days">
          {WEEKDAY_SHORT.map((d, i) => (
            <button
              key={d}
              type="button"
              className={days.includes(i + 1) ? 'my-day on' : 'my-day'}
              onClick={() => toggleDay(i + 1)}
            >
              {d}
            </button>
          ))}
          <button type="button" className="my-day all" onClick={() => setDays([1, 2, 3, 4, 5, 6, 7])}>
            все
          </button>
        </div>

        <div className="sch-row">
          <select className="select" value={part} onChange={(e) => setPart(e.target.value as DayPart | '')}>
            {PART_OPTIONS.map((o) => (
              <option key={o.label} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="filter-tabs">
            <button className={!temporary ? 'tab active' : 'tab'} type="button" onClick={() => setTemporary(false)}>
              Постоянно
            </button>
            <button className={temporary ? 'tab active' : 'tab'} type="button" onClick={() => setTemporary(true)}>
              Временно
            </button>
          </div>
          {temporary && (
            <>
              <label className="sch-inline">
                с <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="sch-inline">
                по <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </label>
            </>
          )}
        </div>

        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Причина (необязательно), например «учёба»" />
        {error && <div className="error">{error}</div>}
        <button className="btn primary" disabled={busy} onClick={add}>
          ＋ Добавить
        </button>
      </div>
    </section>
  )
}