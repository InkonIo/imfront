import { useCallback, useEffect, useMemo, useState } from 'react'
import { employeeApi } from './api'
import type { Coworker, EmpDay, EmpSchedule } from './api'

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const WD_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']
const pad = (n: number) => String(n).padStart(2, '0')

function almatyNow() { return new Date(Date.now() + 5 * 3600_000) }
function todayStr() { const d = almatyNow(); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` }
function curMonth() { return todayStr().slice(0, 7) }
function shift(m: string, delta: number) {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}
const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const short = (t: string | null) => (t ? (t.endsWith(':00') ? String(Number(t.slice(0, 2))) : `${Number(t.slice(0, 2))}:${t.slice(3)}`) : '')
const hours = (m: number) => `${Math.floor(m / 60)}${m % 60 ? ':' + pad(m % 60) : ''}`

type Kind = 'shift' | 'present' | 'late' | 'miss' | 'off' | 'vac' | 'sick' | 'trip' | 'hol' | 'pv' | 'none'
const LABEL: Record<Kind, string> = {
  shift: 'Смена', present: 'Отработано', late: 'Опоздание', miss: 'Прогул', off: 'Выходной', vac: 'Отпуск',
  sick: 'Больничный', trip: 'Командировка', hol: 'Праздник', pv: 'Работал в выходной', none: '',
}

function kindOf(d: EmpDay | undefined, dateStr: string, today: string): Kind {
  if (!d) return 'none'
  const t = (d.type ?? '').toLowerCase()
  if (!d.planned) {
    if (t === 'weekend') return 'off'
    if (/sick|ill|disab/.test(t)) return 'sick'
    if (/vac|leave/.test(t)) return 'vac'
    if (/trip|busin|command/.test(t)) return 'trip'
    if (/celeb|holiday/.test(t)) return d.workedMin > 0 ? 'present' : 'hol'
    if (t === 'wasinweekend') return 'pv'
    if (t === 'beforework') return 'none'
    return d.planStart ? 'off' : 'none'
  }
  if (dateStr > today) return 'shift'
  if (d.factIn) return d.planStart && mins(d.factIn) - mins(d.planStart) > 5 ? 'late' : 'present'
  if (dateStr === today) return 'shift'
  return t === 'wasnt' ? 'miss' : 'shift'
}

function ics(month: string, days: EmpDay[]): string {
  const [y, m] = month.split('-').map(Number)
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//IM Inside//RU', 'CALSCALE:GREGORIAN']
  for (const d of days) {
    if (!d.planned || !d.planStart || !d.planEnd) continue
    const day = new Date(Date.UTC(y, m - 1, d.day))
    const end = new Date(day)
    if (mins(d.planEnd) <= mins(d.planStart)) end.setUTCDate(end.getUTCDate() + 1)
    const f = (dt: Date, t: string) => `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${t.replace(':', '')}00`
    lines.push('BEGIN:VEVENT', `UID:im-${month}-${d.day}@iminside`, `DTSTAMP:${f(new Date(), '00:00')}Z`.replace('ZZ', 'Z'),
      `DTSTART;TZID=Asia/Almaty:${f(day, d.planStart)}`, `DTEND;TZID=Asia/Almaty:${f(end, d.planEnd)}`, 'SUMMARY:Смена I\'M', 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export default function EmployeeCalendar({ version, onOrder }: { version: number; onOrder: (day: string) => void }) {
  const [month, setMonth] = useState(curMonth())
  const [data, setData] = useState<EmpSchedule | null>(null)
  const [error, setError] = useState('')
  const [sel, setSel] = useState<number | null>(null)
  const [mates, setMates] = useState<Coworker[] | null>(null)
  const today = todayStr()

  const load = useCallback(async () => {
    try { setData(await employeeApi.schedule(month)); setError('') } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка') }
  }, [month])
  useEffect(() => { setSel(null); void load() }, [load, version])

  const byDay = useMemo(() => new Map((data?.days ?? []).map((d) => [d.day, d])), [data])
  const reqByDay = useMemo(() => {
    const m = new Map<number, string>()
    const [y, mo] = month.split('-').map(Number)
    for (const r of data?.requests ?? []) {
      for (let d = 1; d <= (data?.daysInMonth ?? 0); d++) {
        const s = `${y}-${pad(mo)}-${pad(d)}`
        if (s >= r.dateFrom && s <= r.dateTo) m.set(d, r.status)
      }
    }
    return m
  }, [data, month])

  const [y, mo] = month.split('-').map(Number)
  const lead = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7 // понедельник — первый
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: data?.daysInMonth ?? 0 }, (_, i) => i + 1)]
  const dateOf = (d: number) => `${y}-${pad(mo)}-${pad(d)}`

  useEffect(() => {
    setMates(null)
    if (sel == null) return
    const k = kindOf(byDay.get(sel), dateOf(sel), today)
    if (k === 'off' || k === 'none') return
    employeeApi.coworkers(dateOf(sel)).then(setMates).catch(() => setMates([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel])

  const st = data?.stats
  const punct = st && st.came > 0 ? Math.round(((st.came - st.late) / st.came) * 100) : null
  const nextDate = data?.next?.date
  const nextText = (() => {
    if (!nextDate) return null
    const [ny, nm, nd] = nextDate.split('-').map(Number)
    const wd = new Date(Date.UTC(ny, nm - 1, nd)).getUTCDay()
    const diff = Math.round((Date.parse(nextDate) - Date.parse(today)) / 86400000)
    const when = diff === 0 ? 'Сегодня' : diff === 1 ? 'Завтра' : `${nd} ${MONTHS[nm - 1].toLowerCase().replace(/ь$/, 'я').replace(/т$/, 'та').replace(/й$/, 'я')}, ${WD_FULL[wd]}`
    return `${when} · ${data?.next?.planStart}–${data?.next?.planEnd}`
  })()

  function download() {
    if (!data) return
    const blob = new Blob([ics(month, data.days)], { type: 'text/calendar;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `smeny-${month}.ics`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const selDay = sel != null ? byDay.get(sel) : undefined
  const selKind = sel != null ? kindOf(selDay, dateOf(sel), today) : 'none'

  return (
    <div className="emp-cal">
      {nextText && (
        <div className="emp-next"><small>Ближайшая смена</small><strong>{nextText}</strong></div>
      )}
      {!nextText && data && <div className="emp-next calm"><small>Ближайшая смена</small><strong>Пока не назначена</strong></div>}

      <div className="emp-monthbar">
        <button onClick={() => setMonth(shift(month, -1))} aria-label="Назад">‹</button>
        <b>{MONTHS[mo - 1]} {y}</b>
        <button onClick={() => setMonth(shift(month, 1))} aria-label="Вперёд">›</button>
        {month !== curMonth() && <button className="emp-today" onClick={() => setMonth(curMonth())}>Сегодня</button>}
      </div>

      {error && <div className="emp-err">{error}</div>}

      <div className="emp-grid">
        {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((w, i) => <div key={w} className={`emp-wd${i > 4 ? ' we' : ''}`}>{w}</div>)}
        {cells.map((d, i) => {
          if (d == null) return <div key={`e${i}`} />
          const day = byDay.get(d)
          const k = kindOf(day, dateOf(d), today)
          const rs = reqByDay.get(d)
          return (
            <button key={d} className={`emp-day k-${k}${dateOf(d) === today ? ' today' : ''}${sel === d ? ' sel' : ''}`} onClick={() => setSel(sel === d ? null : d)}>
              <span className="n">{d}</span>
              <span className="t">{day?.planned && day.planStart ? `${short(day.planStart)}–${short(day.planEnd)}` : k === 'off' ? 'вых' : ''}</span>
              {rs && <i className={`rq ${rs === 'APPROVED' ? 'ok' : 'wait'}`}>{rs === 'APPROVED' ? '✓' : '…'}</i>}
            </button>
          )
        })}
      </div>

      <div className="emp-legend">
        {(['shift', 'present', 'late', 'miss', 'off', 'vac', 'sick'] as Kind[]).map((k) => <span key={k}><i className={`k-${k}`} />{LABEL[k]}</span>)}
        <span><i className="rq ok">✓</i>заявка одобрена</span>
        <span><i className="rq wait">…</i>ждёт ответа</span>
      </div>

      {sel != null && (
        <div className="emp-detail">
          <div className="emp-detail-h">
            <b>{sel} {MONTHS[mo - 1].toLowerCase()}, {WD_FULL[new Date(Date.UTC(y, mo - 1, sel)).getUTCDay()]}</b>
            <span className={`emp-chip k-${selKind}`}>{LABEL[selKind] || 'Нет данных'}</span>
          </div>
          {selDay?.planned && <div>План: <b>{selDay.planStart}–{selDay.planEnd}</b></div>}
          {selDay?.factIn && <div>Факт: <b>{selDay.factIn}–{selDay.factOut ?? '…'}</b>{selDay.workedMin > 0 && ` (${hours(selDay.workedMin)} ч)`}</div>}
          {mates && mates.length > 0 && (
            <div className="emp-mates">
              <small>В этот день в филиале на смене</small>
              {mates.map((m, i) => <div key={i}><span>{m.fullName}</span><em>{short(m.planStart)}–{short(m.planEnd)}</em></div>)}
            </div>
          )}
          {mates && mates.length === 0 && (selKind === 'shift' || selKind === 'present' || selKind === 'late') && <small className="emp-mute">Других по плану нет</small>}
          {dateOf(sel) > today && <button className="emp-btn" onClick={() => onOrder(dateOf(sel))}>Заказать выходной на этот день</button>}
        </div>
      )}

      {st && (
        <div className="emp-stats">
          <div><b>{st.planned}</b><small>смен в плане</small></div>
          <div><b>{hours(st.plannedMin)}</b><small>часов по плану</small></div>
          <div><b>{hours(st.workedMin)}</b><small>отработано</small></div>
          <div className={punct != null && punct >= 90 ? 'good' : ''}><b>{punct == null ? '—' : `${punct}%`}</b><small>без опозданий</small></div>
        </div>
      )}
      {st && st.came > 0 && st.late === 0 && <div className="emp-praise">🏅 В этом месяце ни одного опоздания. Так держать!</div>}

      <button className="emp-ghost" onClick={download} disabled={!data}>⬇ Смены в мой календарь (.ics)</button>
    </div>
  )
}
