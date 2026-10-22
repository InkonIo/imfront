import { useEffect, useRef, useState } from 'react'

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONTHS_SHORT = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.']
const WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s: string) => new Date(`${s}T12:00:00`)
const short = (s: string) => `${Number(s.slice(8, 10))} ${MONTHS_SHORT[Number(s.slice(5, 7)) - 1]}`

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return iso(d)
}

interface Preset { label: string; range: () => [string, string] }

const PRESETS: Preset[] = [
  { label: 'Сегодня', range: () => [daysAgo(0), daysAgo(0)] },
  { label: '7 дней', range: () => [daysAgo(6), daysAgo(0)] },
  { label: '14 дней', range: () => [daysAgo(13), daysAgo(0)] },
  { label: '30 дней', range: () => [daysAgo(29), daysAgo(0)] },
  { label: '90 дней', range: () => [daysAgo(89), daysAgo(0)] },
  {
    label: 'Этот месяц',
    range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(n)] },
  },
  {
    label: 'Прошлый месяц',
    range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), iso(new Date(n.getFullYear(), n.getMonth(), 0))] },
  },
]

/** Период одной кнопкой: быстрые варианты слева, календарь справа (клик — начало, второй клик — конец). */
export default function RangePicker({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState<string | null>(null) // первый клик в календаре, ждём второй
  const [hover, setHover] = useState<string | null>(null)
  const b = parse(to)
  const [view, setView] = useState({ y: b.getFullYear(), m: b.getMonth() })
  const ref = useRef<HTMLDivElement>(null)
  const today = iso(new Date())

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])

  const current = PRESETS.find((p) => { const [a, z] = p.range(); return a === from && z === to })
  const label = from === to ? short(from) : `${short(from)} – ${short(to)}`

  function toggle() {
    if (!open) { const t = parse(to); setView({ y: t.getFullYear(), m: t.getMonth() }); setStart(null) }
    setOpen(!open)
  }

  function apply(a: string, z: string) {
    onChange(a, z)
    setStart(null)
    setOpen(false)
  }

  function pick(d: string) {
    if (d > today) return
    if (!start) { setStart(d); return }
    apply(start <= d ? start : d, start <= d ? d : start)
  }

  function shift(delta: number) {
    setView((v) => { const d = new Date(v.y, v.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  }

  const first = new Date(view.y, view.m, 1)
  const lead = (first.getDay() + 6) % 7
  const cells = Array.from({ length: 42 }, (_, i) => new Date(view.y, view.m, 1 - lead + i))

  const a = start ?? from
  const z = start ? (hover && hover >= start ? hover : start) : to
  const lo = a <= z ? a : z
  const hi = a <= z ? z : a

  return (
    <div className="rp" ref={ref}>
      <button type="button" className="rp-btn" onClick={toggle} aria-expanded={open}>
        <span aria-hidden>📅</span>
        <span className="rp-name">{current?.label ?? 'Произвольная'}</span>
        <span className="rp-dates">{label}</span>
        <span className="rp-caret" aria-hidden>▾</span>
      </button>

      {open && (
        <div className="rp-pop">
          <div className="rp-presets">
            {PRESETS.map((p) => (
              <button key={p.label} type="button" className={current?.label === p.label ? 'on' : ''} onClick={() => { const [x, y] = p.range(); apply(x, y) }}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="rp-cal">
            <div className="rp-nav">
              <button type="button" onClick={() => shift(-1)} aria-label="Предыдущий месяц">‹</button>
              <b>{MONTHS[view.m]} {view.y}</b>
              <button type="button" onClick={() => shift(1)} aria-label="Следующий месяц">›</button>
            </div>
            <div className="rp-grid rp-week">{WEEK.map((w) => <span key={w}>{w}</span>)}</div>
            <div className="rp-grid" onMouseLeave={() => setHover(null)}>
              {cells.map((c) => {
                const k = iso(c)
                const other = c.getMonth() !== view.m
                const inR = k >= lo && k <= hi
                const edge = k === lo || k === hi
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={k > today}
                    className={['rp-d', other ? 'other' : '', inR ? 'in' : '', edge ? 'edge' : '', k === today ? 'today' : ''].join(' ').trim()}
                    onClick={() => pick(k)}
                    onMouseEnter={() => setHover(k)}
                  >
                    {c.getDate()}
                  </button>
                )
              })}
            </div>
            <div className="rp-hint">{start ? 'Теперь выберите последний день периода' : 'Выберите первый день периода'}</div>
          </div>
        </div>
      )}
    </div>
  )
}