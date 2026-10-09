import { useEffect, useMemo, useState } from 'react'
import { employeeApi } from './api'
import type { EmpSchedule } from './api'

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MON_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const WD = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
const WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (t: Date) => `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
export const addDays = (s: string, n: number) => { const t = parse(s); t.setUTCDate(t.getUTCDate() + n); return iso(t) }
const MAX_DAYS = 31
const MAX_AHEAD = 90

export const todayStr = () => iso(new Date(Date.now() + 5 * 3600_000))
export const human = (s: string) => { const t = parse(s); return `${t.getUTCDate()} ${MONTHS_GEN[t.getUTCMonth()]}` }
const short = (t: string | null) => (t ? (t.endsWith(':00') ? String(Number(t.slice(0, 2))) : `${Number(t.slice(0, 2))}:${t.slice(3)}`) : '')
export const plural = (n: number, a: string, b: string, c: string) => (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c)

/** Сгруппировать выбранные даты в подряд идущие отрезки (каждый станет отдельной заявкой, максимум 14 дней). */
export function runs(days: string[]): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = []
  for (const d of [...days].sort()) {
    const last = out[out.length - 1]
    const len = last ? (Date.parse(last.to) - Date.parse(last.from)) / 86400000 + 1 : 0
    if (last && addDays(last.to, 1) === d && len < 14) last.to = d
    else out.push({ from: d, to: d })
  }
  return out
}

/** «17–19 окт, 23 окт» */
export function describe(days: string[]): string {
  return runs(days).map((r) => {
    const a = parse(r.from), b = parse(r.to)
    if (r.from === r.to) return `${a.getUTCDate()} ${MON_SHORT[a.getUTCMonth()]}`
    return a.getUTCMonth() === b.getUTCMonth()
      ? `${a.getUTCDate()}–${b.getUTCDate()} ${MON_SHORT[b.getUTCMonth()]}`
      : `${a.getUTCDate()} ${MON_SHORT[a.getUTCMonth()]} – ${b.getUTCDate()} ${MON_SHORT[b.getUTCMonth()]}`
  }).join(', ')
}

/**
 * Выбор дней списком: каждая строка — день, видно свою смену. Тап по строке — отметить/снять,
 * можно выбрать любые дни, а не только подряд. Кнопки сверху — быстрые наборы.
 */
export default function DayPicker({ days, onChange, lead }: { days: string[]; onChange: (d: string[]) => void; lead: number }) {
  const today = todayStr()
  const min = addDays(today, lead)
  const max = addDays(today, MAX_AHEAD)
  const [weeks, setWeeks] = useState(4)
  const [cache, setCache] = useState<Record<string, EmpSchedule>>({})
  const [hint, setHint] = useState('')
  const sel = useMemo(() => new Set(days), [days])

  const list = useMemo(() => {
    const out: string[] = []
    const lastDay = addDays(min, weeks * 7 - 1)
    for (let d = min; d <= lastDay && d <= max; d = addDays(d, 1)) out.push(d)
    return out
  }, [min, max, weeks])

  useEffect(() => {
    const need = new Set(list.map((d) => d.slice(0, 7)))
    need.forEach((m) => {
      if (cache[m]) return
      employeeApi.schedule(m).then((r) => setCache((c) => ({ ...c, [m]: r }))).catch(() => {})
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list])

  const dayInfo = (d: string) => cache[d.slice(0, 7)]?.days.find((x) => x.day === Number(d.slice(8)))
  const booked = useMemo(() => {
    const m = new Map<string, string>()
    Object.values(cache).forEach((c) => c.requests.forEach((r) => {
      for (let d = r.dateFrom; d <= r.dateTo; d = addDays(d, 1)) m.set(d, r.status)
    }))
    return m
  }, [cache])
  const free = (d: string) => !booked.has(d)

  // недели (с понедельника)
  const groups = useMemo(() => {
    const g: { key: string; days: string[] }[] = []
    for (const d of list) {
      const dow = (parse(d).getUTCDay() + 6) % 7
      const key = addDays(d, -dow)
      const last = g[g.length - 1]
      if (last && last.key === key) last.days.push(d)
      else g.push({ key, days: [d] })
    }
    return g
  }, [list])

  function set(next: string[]) {
    setHint('')
    if (next.length > MAX_DAYS) { setHint(`Можно выбрать не больше ${MAX_DAYS} дней сразу.`); return }
    onChange([...new Set(next)].sort())
  }
  const toggle = (d: string) => set(sel.has(d) ? days.filter((x) => x !== d) : [...days, d])
  const toggleMany = (ds: string[]) => {
    const f = ds.filter(free)
    const all = f.every((d) => sel.has(d))
    set(all ? days.filter((d) => !f.includes(d)) : [...days, ...f])
  }
  function nextWeekend() {
    const out: string[] = []
    for (let d = min; out.length < 2 && d <= max; d = addDays(d, 1)) {
      const w = parse(d).getUTCDay()
      if (w === 6 || w === 0) out.push(d)
    }
    set(out.filter(free))
  }

  const shifts = days.filter((d) => dayInfo(d)?.planned).length
  const mf = (d: string) => `${WD[parse(d).getUTCDay()]}, ${human(d)}`

  return (
    <div className="dp">
      <div className="dp-quick">
        <button type="button" onClick={nextWeekend}>Ближайшие сб–вс</button>
        <button type="button" onClick={() => toggleMany(list.filter((d) => dayInfo(d)?.planned).slice(0, 7))}>Мои 7 ближайших смен</button>
        {days.length > 0 && <button type="button" className="clear" onClick={() => { onChange([]); setHint('') }}>Сбросить</button>}
      </div>

      <div className="dp-list">
        {groups.map((g) => {
          const f = g.days.filter(free)
          const all = f.length > 0 && f.every((d) => sel.has(d))
          return (
            <div key={g.key} className="dp-week">
              <div className="dp-wh">
                <span>{describe(g.days).replace(/,.*/, '')}</span>
                {f.length > 1 && <button type="button" onClick={() => toggleMany(g.days)}>{all ? 'Снять неделю' : 'Выбрать неделю'}</button>}
              </div>
              {g.days.map((d) => {
                const info = dayInfo(d)
                const on = sel.has(d)
                const bk = booked.get(d)
                const w = parse(d).getUTCDay()
                const planned = !!info?.planned
                return (
                  <button key={d} type="button" disabled={!!bk} onClick={() => toggle(d)}
                    className={`dp-row${on ? ' on' : ''}${on && planned ? ' loss' : ''}${w === 0 || w === 6 ? ' we' : ''}`}>
                    <span className="box">{on ? '✓' : ''}</span>
                    <span className="nm"><b>{WD_SHORT[w]}, {parse(d).getUTCDate()}</b> {MON_SHORT[parse(d).getUTCMonth()]}</span>
                    <span className="inf">
                      {bk ? (bk === 'APPROVED' ? '✓ уже есть заявка' : '… заявка ждёт ответа')
                        : planned ? `Смена ${short(info!.planStart)}–${short(info!.planEnd)}`
                        : info ? 'Выходной' : '…'}
                    </span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
      {list[list.length - 1] < max && <button type="button" className="dp-more" onClick={() => setWeeks((w) => w + 4)}>Показать ещё 4 недели</button>}

      {days.length > 0 ? (
        <div className={`dp-sum${shifts ? ' warn' : ''}`}>
          <b>{describe(days)}</b>
          <span>{days.length} {plural(days.length, 'день', 'дня', 'дней')}</span>
          <span>{shifts > 0 ? `из них ${shifts} ${plural(shifts, 'смена', 'смены', 'смен')} в плане` : 'смен в эти дни нет'}</span>
        </div>
      ) : <div className="dp-sum empty">Отметьте нужные дни. Можно любые, не только подряд. Доступны даты с {mf(min)}.</div>}
      {hint && <div className="emp-err">{hint}</div>}
    </div>
  )
}