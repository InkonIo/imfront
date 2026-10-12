import { useEffect, useRef, useState } from 'react'
import './date-picker.css'

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s: string) => new Date(`${s}T12:00:00`)
const show = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`

type Props = {
  value: string
  onChange: (v: string) => void
  min?: string
  max?: string
  placeholder?: string
}

/** Свой календарь вместо нативного <input type="date">. Значение — строка YYYY-MM-DD. */
export default function DatePicker({ value, onChange, min, max, placeholder = 'дд.мм.гггг' }: Props) {
  const [open, setOpen] = useState(false)
  const base = value ? parse(value) : min ? parse(min) : new Date()
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggle() {
    if (!open) {
      const b = value ? parse(value) : min ? parse(min) : new Date()
      setView({ y: b.getFullYear(), m: b.getMonth() })
    }
    setOpen(!open)
  }

  function shift(delta: number) {
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  // сетка: недели с понедельника
  const first = new Date(view.y, view.m, 1)
  const lead = (first.getDay() + 6) % 7
  const cells = Array.from({ length: 42 }, (_, i) => new Date(view.y, view.m, 1 - lead + i))
  const today = toIso(new Date())

  function pick(d: Date) {
    onChange(toIso(d))
    setOpen(false)
  }

  const disabled = (iso: string) => (min !== undefined && iso < min) || (max !== undefined && iso > max)

  return (
    <div className="dp" ref={ref}>
      <button type="button" className={value ? 'dp-field' : 'dp-field empty'} onClick={toggle}>
        <span>{value ? show(value) : placeholder}</span>
        <span className="dp-ico" aria-hidden>
          📅
        </span>
      </button>

      {open && (
        <div className="dp-pop" role="dialog">
          <div className="dp-head">
            <button type="button" className="dp-nav" onClick={() => shift(-1)} aria-label="Предыдущий месяц">
              ‹
            </button>
            <b>
              {MONTHS[view.m]} {view.y}
            </b>
            <button type="button" className="dp-nav" onClick={() => shift(1)} aria-label="Следующий месяц">
              ›
            </button>
          </div>
          <div className="dp-week">
            {WEEK.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="dp-grid">
            {cells.map((d) => {
              const iso = toIso(d)
              const cls = ['dp-day']
              if (d.getMonth() !== view.m) cls.push('out')
              if (iso === today) cls.push('today')
              if (iso === value) cls.push('sel')
              return (
                <button key={iso} type="button" className={cls.join(' ')} disabled={disabled(iso)} onClick={() => pick(d)}>
                  {d.getDate()}
                </button>
              )
            })}
          </div>
          <div className="dp-foot">
            <button
              type="button"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
            >
              Очистить
            </button>
            <button type="button" disabled={disabled(today)} onClick={() => pick(new Date())}>
              Сегодня
            </button>
          </div>
        </div>
      )}
    </div>
  )
}