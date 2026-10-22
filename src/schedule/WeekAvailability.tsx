import { useEffect, useMemo, useState } from 'react'
import { errorText } from '../admin/ui'
import type { DayPart } from '../types'
import { scheduleApi } from './api'
import './week-availability.css'

type Mode = 'all' | 'off' | 'am' | 'pm' | 'custom'
interface DayPlan {
  mode: Mode
  from: string
  to: string
}

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MODES: { id: Mode; label: string }[] = [
  { id: 'all', label: 'Весь день' },
  { id: 'off', label: 'Офф' },
  { id: 'am', label: 'Утро' },
  { id: 'pm', label: 'Вечер' },
]
// смены: утро 10–16, вечер 16–24 (как в чек-листе смены)
const MORNING: [number, number] = [10, 16]
const EVENING: [number, number] = [16, 24]

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dm = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`
const mondayOf = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
const hours = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h + m / 60 || 0
}
const overlap = (a: [number, number], b: [number, number]) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]))

const FROM_OPTS = Array.from({ length: 36 }, (_, i) => `${pad(6 + Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`) // 06:00 … 23:30
const TO_OPTS = [...Array.from({ length: 35 }, (_, i) => `${pad(7 + Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`), '00:00'] // 07:00 … 00:00

const blank = (): DayPlan[] => Array.from({ length: 7 }, () => ({ mode: 'all' as Mode, from: '10:00', to: '22:00' }))

/** Что именно запретить в этот день: часть дня (null — весь день) и пояснение. null — ограничений нет. */
function toLimit(p: DayPlan): { dayPart: DayPart | null; note: string } | null {
  if (p.mode === 'all') return null
  if (p.mode === 'off') return { dayPart: null, note: 'офф' }
  if (p.mode === 'am') return { dayPart: 'EVENING', note: 'только утро' }
  if (p.mode === 'pm') return { dayPart: 'MORNING', note: 'только вечер' }
  const s = hours(p.from)
  const e = hours(p.to) === 0 ? 24 : hours(p.to)
  const note = `${p.from}–${p.to}`
  const okMorning = overlap([s, e], MORNING) / (MORNING[1] - MORNING[0]) >= 0.5
  const okEvening = overlap([s, e], EVENING) / (EVENING[1] - EVENING[0]) >= 0.5
  if (okMorning && okEvening) return { dayPart: null, note: `${note}` } // почти весь день — только пометка
  if (!okMorning && !okEvening) return { dayPart: null, note }
  return { dayPart: okMorning ? 'EVENING' : 'MORNING', note }
}

const storeKey = (monday: Date) => `my-week:${iso(monday)}`
const readStore = (monday: Date): { ids: number[]; plan: DayPlan[] } | null => {
  try {
    const raw = localStorage.getItem(storeKey(monday))
    return raw ? (JSON.parse(raw) as { ids: number[]; plan: DayPlan[] }) : null
  } catch {
    return null
  }
}
const writeStore = (monday: Date, v: { ids: number[]; plan: DayPlan[] }) => {
  try {
    localStorage.setItem(storeKey(monday), JSON.stringify(v))
  } catch {
    /* без хранилища тоже работает */
  }
}

/** Быстрый ввод недели: на каждый день — «весь день», «офф», «утро» или «вечер». */
export default function WeekAvailability({ onChange }: { onChange: () => void }) {
  const [offset, setOffset] = useState(0)
  const monday = useMemo(() => addDays(mondayOf(new Date()), offset * 7), [offset])
  const [plan, setPlan] = useState<DayPlan[]>(blank)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const today = iso(new Date())

  useEffect(() => {
    setPlan(readStore(monday)?.plan ?? blank())
    setMsg('')
    setError('')
  }, [monday])

  const patch = (i: number, p: Partial<DayPlan>) => {
    setPlan((cur) => cur.map((x, k) => (k === i ? { ...x, ...p } : x)))
    setMsg('')
  }
  const setAll = (mode: Mode) => {
    setPlan((cur) => cur.map((x, i) => (iso(addDays(monday, i)) < today ? x : { ...x, mode })))
    setMsg('')
  }

  async function save() {
    setBusy(true)
    setError('')
    setMsg('')
    try {
      // убираем то, что сохранили для этой недели раньше
      for (const id of readStore(monday)?.ids ?? []) {
        try {
          await scheduleApi.deleteMyLimit(id)
        } catch {
          /* уже удалено */
        }
      }
      const before = new Set((await scheduleApi.myLimits()).map((l) => l.id))
      for (let i = 0; i < 7; i++) {
        const date = iso(addDays(monday, i))
        if (date < today) continue
        const lim = toLimit(plan[i])
        if (!lim) continue
        await scheduleApi.addMyLimit({ weekdays: [i + 1], dayPart: lim.dayPart, from: date, to: date, note: lim.note })
      }
      const ids = (await scheduleApi.myLimits()).map((l) => l.id).filter((id) => !before.has(id))
      writeStore(monday, { ids, plan })
      setMsg('Сохранено ✓ Директор увидит это при составлении графика')
      onChange()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const range = `${dm(monday)} – ${dm(addDays(monday, 6))}`
  const title = offset === 0 ? 'Эта неделя' : offset === 1 ? 'Следующая неделя' : `Через ${offset} нед.`

  return (
    <div className="wk">
      <div className="wk-nav">
        <button type="button" className="wk-arrow" disabled={offset === 0} onClick={() => setOffset(offset - 1)} aria-label="Раньше">
          ‹
        </button>
        <div>
          <b>{title}</b>
          <span>{range}</span>
        </div>
        <button type="button" className="wk-arrow" disabled={offset >= 8} onClick={() => setOffset(offset + 1)} aria-label="Позже">
          ›
        </button>
      </div>

      <div className="wk-quick">
        Все дни:
        <button type="button" onClick={() => setAll('all')}>Свободен</button>
        <button type="button" onClick={() => setAll('off')}>Офф</button>
      </div>

      <div className="wk-days">
        {plan.map((p, i) => {
          const d = addDays(monday, i)
          const past = iso(d) < today
          return (
            <div key={i} className={['wk-day', past ? 'past' : '', p.mode !== 'all' ? 'set' : ''].join(' ').trim()}>
              <div className="wk-label">
                <b>{DAY_NAMES[i]}</b>
                <span>{dm(d)}</span>
              </div>
              <div className="wk-modes">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={past}
                    className={p.mode === m.id ? `on m-${m.id}` : ''}
                    onClick={() => patch(i, { mode: m.id })}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {p.mode === 'custom' && !past && (
                <div className="wk-time">
                  <select value={p.from} onChange={(e) => patch(i, { from: e.target.value })} aria-label="С">
                    {FROM_OPTS.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  <span>–</span>
                  <select value={p.to} onChange={(e) => patch(i, { to: e.target.value })} aria-label="До">
                    {TO_OPTS.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {error && <div className="error">{error}</div>}
      <div className="wk-foot">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Сохраняю…' : 'Сохранить неделю'}
        </button>
        {msg && <span className="wk-ok">{msg}</span>}
      </div>
    </div>
  )
}