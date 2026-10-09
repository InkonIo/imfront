import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { extApi } from './api'
import type { AnData, AnEmp, SchedCell } from './api'
import { MONTHS, WD, currentMonth, hm, shiftMonth } from './util'

type SortKey = 'fullName' | 'planned' | 'attended' | 'late' | 'noshow' | 'earlyLeave' | 'hours' | 'avgShiftMin' | 'reliability'

const C = { plan: '#f0cf7a', came: '#6fbf4f', late: '#a3315f', miss: '#e5392f' }
const DOW = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

function pct(a: number, b: number): string {
  return b > 0 ? `${Math.round((100 * a) / b)}%` : '—'
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' | 'bad' | 'good' }) {
  return (
    <div className={`an-tile${tone ? ` ${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  )
}

function lateOf(c: SchedCell): number | null {
  if (!c.factIn || !c.planStart) return null
  const [fh, fm] = c.factIn.split(':').map(Number)
  const [ph, pm] = c.planStart.split(':').map(Number)
  return fh * 60 + fm - (ph * 60 + pm)
}

function EmployeeDrawer({ emp, month, branchId, onClose }: { emp: AnEmp; month: string; branchId: number | null; onClose: () => void }) {
  const [cells, setCells] = useState<SchedCell[] | null>(null)
  const [err, setErr] = useState('')
  const [y, mo] = month.split('-').map(Number)

  useEffect(() => {
    extApi
      .schedule(month, branchId)
      .then((d) => setCells(d.cells.filter((c) => c.employeeId === emp.id).sort((a, b) => a.day - b.day)))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Ошибка'))
  }, [emp.id, month, branchId])

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const rows = (cells ?? []).filter((c) => c.type !== 'weekend' || c.workedMin > 0)
  const chart = (cells ?? []).map((c) => ({ day: c.day, h: Math.round((c.workedMin / 60) * 10) / 10 }))

  return createPortal(
    <div className="ext an-overlay" onClick={onClose}>
      <aside className="an-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={emp.fullName}>
        <header>
          <div>
            <h3>{emp.fullName}</h3>
            <p>{emp.position ?? ''} · {MONTHS[mo - 1]} {y}</p>
          </div>
          <button className="ext-btn sq" onClick={onClose} aria-label="Закрыть">✕</button>
        </header>
        <div className="an-mini">
          <Tile label="Смен по плану" value={String(emp.planned)} />
          <Tile label="Надёжность" value={emp.reliability == null ? '—' : `${emp.reliability}%`} sub="пришёл вовремя" tone={emp.reliability != null && emp.reliability < 70 ? 'bad' : 'good'} />
          <Tile label="Опоздал" value={`${emp.late}`} sub={emp.late ? `в сумме ${emp.lateMin} мин` : ''} tone={emp.late > 2 ? 'warn' : undefined} />
          <Tile label="Пропусков" value={String(emp.noshow)} tone={emp.noshow ? 'bad' : undefined} />
        </div>
        {err && <div className="ext-msg err">{err}</div>}
        {cells && (
          <>
            <div className="an-chart small">
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={chart} margin={{ top: 6, right: 4, left: -22, bottom: 0 }}>
                  <CartesianGrid stroke="var(--e-line)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: 'var(--e-mute)', fontSize: 10 }} interval={1} />
                  <YAxis tick={{ fill: 'var(--e-mute)', fontSize: 10 }} />
                  <Tooltip formatter={(v) => [`${v} ч`, 'Отработано']} labelFormatter={(d) => `${d} ${MONTHS[mo - 1]}`} />
                  <Bar dataKey="h" fill={C.came} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="an-days">
              <thead><tr><th>День</th><th>План</th><th>Факт</th><th>Часы</th><th></th></tr></thead>
              <tbody>
                {rows.map((c) => {
                  const wd = WD[new Date(Date.UTC(y, mo - 1, c.day)).getUTCDay()]
                  const l = lateOf(c)
                  return (
                    <tr key={c.day}>
                      <td>{c.day} <small>{wd}</small></td>
                      <td>{c.planStart && c.type !== 'weekend' ? `${c.planStart}–${c.planEnd}` : '—'}</td>
                      <td>{c.factIn ? `${c.factIn}–${c.factOut ?? '…'}` : '—'}</td>
                      <td>{c.workedMin > 0 ? hm(c.workedMin) : '—'}</td>
                      <td>{l != null && l > 0 ? <span className="an-badge late">+{l} мин</span> : c.factIn ? <span className="an-badge ok">вовремя</span> : ''}</td>
                    </tr>
                  )
                })}
                {rows.length === 0 && <tr><td colSpan={5} className="ext-empty">Нет данных за месяц</td></tr>}
              </tbody>
            </table>
          </>
        )}
      </aside>
    </div>,
    document.body,
  )
}

export default function ExtAnalytics({ branchId }: { branchId: number | null }) {
  const [month, setMonth] = useState(currentMonth())
  const [data, setData] = useState<AnData | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'late', dir: -1 })
  const [open, setOpen] = useState<AnEmp | null>(null)
  const [y, mo] = month.split('-').map(Number)

  useEffect(() => {
    let off = false
    extApi
      .analytics(month, branchId)
      .then((d) => {
        if (!off) {
          setData(d)
          setError('')
        }
      })
      .catch((e) => !off && setError(e instanceof Error ? e.message : 'Ошибка'))
    return () => {
      off = true
    }
  }, [month, branchId])

  const rows = useMemo(() => {
    const w = q.trim().toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean)
    const list = (data?.employees ?? []).filter((e) => {
      const n = e.fullName.toLowerCase().replace(/ё/g, 'е')
      return w.every((x) => n.includes(x))
    })
    const k = sort.key
    return [...list].sort((a, b) => {
      const av = a[k] ?? -1
      const bv = b[k] ?? -1
      const r = typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv, 'ru') : Number(av) - Number(bv)
      return r * sort.dir || a.fullName.localeCompare(b.fullName, 'ru')
    })
  }, [data, q, sort])

  const s = data?.summary
  const maxHours = Math.max(1, ...rows.map((r) => r.hours))
  const top = useMemo(() => {
    const e = data?.employees ?? []
    return {
      late: [...e].filter((x) => x.late > 0).sort((a, b) => b.late - a.late || b.lateMin - a.lateMin).slice(0, 5),
      miss: [...e].filter((x) => x.noshow > 0).sort((a, b) => b.noshow - a.noshow).slice(0, 5),
      best: [...e].filter((x) => x.plannedPast >= 4 && (x.reliability ?? 0) >= 90).sort((a, b) => (b.reliability ?? 0) - (a.reliability ?? 0) || b.plannedPast - a.plannedPast).slice(0, 5),
    }
  }, [data])

  const weekday = (data?.weekday ?? []).map((w) => ({ name: DOW[w.dow - 1], 'В плане': w.planned, 'Пришло': w.came ?? 0 }))
  const daily = (data?.daily ?? []).map((d) => ({ day: d.day, 'В плане': d.planned, 'Пришло': d.came, 'Опоздали': d.came > 0 ? d.late : null }))
  const buckets = (data?.lateBuckets ?? []).map((b) => ({ name: b.label, n: b.n }))

  function head(key: SortKey, label: string, cls = '') {
    const on = sort.key === key
    return (
      <th className={`${cls}${on ? ' on' : ''}`} onClick={() => setSort({ key, dir: on ? (sort.dir === 1 ? -1 : 1) : key === 'fullName' ? 1 : -1 })}>
        {label}{on ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
      </th>
    )
  }

  const empty = data && (s?.planned ?? 0) === 0 && (s?.attended ?? 0) === 0

  return (
    <>
      <div className="sch-bar">
        <div className="sch-month">
          <button className="ext-btn sq" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Предыдущий месяц">‹</button>
          <strong>{MONTHS[mo - 1]} {y}</strong>
          <button className="ext-btn sq" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Следующий месяц">›</button>
        </div>
        <input className="ext-input sch-search" type="search" placeholder="Поиск по ФИО" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {error && <div className="ext-msg err">{error}</div>}
      {empty && <div className="ext-msg err">За этот месяц график не загружен. Открой вкладку «График» и нажми «Загрузить из Таймтрекера».</div>}

      {s && !empty && (
        <>
          <div className="an-tiles">
            <Tile label="Сотрудников" value={String(s.employees)} />
            <Tile label="Смен по плану" value={String(s.planned)} sub={s.extra ? `+${s.extra} вне плана` : undefined} />
            <Tile label="Явка" value={pct(s.attended, s.plannedPast)} sub={`${s.attended} из ${s.plannedPast} прошедших смен`} tone={s.plannedPast > 0 && s.attended / s.plannedPast < 0.9 ? 'warn' : 'good'} />
            <Tile label="Опоздания" value={String(s.late)} sub={s.late ? `в среднем ${Math.round(s.avgLateMin)} мин · ${pct(s.late, s.attended)} от выходов` : 'нет'} tone={s.attended > 0 && s.late / s.attended > 0.2 ? 'warn' : undefined} />
            <Tile label="Пропуски" value={String(s.noshow)} sub="смена в плане, отметок нет" tone={s.noshow ? 'bad' : 'good'} />
            <Tile label="Отработано" value={`${Math.round(s.hours)} ч`} sub={`средняя смена ${hm(s.avgShiftMin)}`} />
          </div>

          <div className="an-grid">
            <section className="an-card wide">
              <h4>Загрузка по дням</h4>
              <p>Сколько людей стоит в плане и сколько пришло. Линия: сколько из пришедших опоздало.</p>
              <div className="an-chart">
                <ResponsiveContainer width="100%" height={250}>
                  <ComposedChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke="var(--e-line)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fill: 'var(--e-mute)', fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fill: 'var(--e-mute)', fontSize: 11 }} />
                    <Tooltip labelFormatter={(d) => `${d} ${MONTHS[mo - 1]}`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="В плане" fill={C.plan} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Пришло" fill={C.came} radius={[3, 3, 0, 0]} />
                    <Line type="monotone" dataKey="Опоздали" stroke={C.late} strokeWidth={2} dot={{ r: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="an-card">
              <h4>По дням недели</h4>
              <p>Среднее число людей в день.</p>
              <div className="an-chart">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={weekday} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                    <CartesianGrid stroke="var(--e-line)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: 'var(--e-mute)', fontSize: 11 }} />
                    <YAxis tick={{ fill: 'var(--e-mute)', fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="В плане" fill={C.plan} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Пришло" fill={C.came} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="an-card">
              <h4>Насколько опаздывают</h4>
              <p>Сколько раз за месяц и на сколько минут.</p>
              <div className="an-chart">
                {buckets.length ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={buckets} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                      <CartesianGrid stroke="var(--e-line)" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--e-mute)', fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={84} tick={{ fill: 'var(--e-mute)', fontSize: 11 }} />
                      <Tooltip formatter={(v) => [`${v}`, 'Раз']} />
                      <Bar dataKey="n" fill={C.late} radius={[0, 3, 3, 0]} label={{ position: 'right', fill: 'var(--e-text)', fontSize: 11 }} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="ext-empty">Опозданий нет</div>
                )}
              </div>
            </section>
          </div>

          <div className="an-tops">
            <TopList title="Чаще всех опаздывают" items={top.late} val={(e) => `${e.late} раз · ${e.lateMin} мин`} onOpen={setOpen} tone="late" />
            <TopList title="Пропуски" items={top.miss} val={(e) => `${e.noshow} смен`} onOpen={setOpen} tone="miss" />
            <TopList title="Самые надёжные" items={top.best} val={(e) => `${e.reliability}% вовремя`} onOpen={setOpen} tone="ok" />
          </div>

          <div className="ext-wrap an-wrap">
            <table className="an-table">
              <thead>
                <tr>
                  {head('fullName', 'Сотрудник', 'l')}
                  {head('planned', 'Смен')}
                  {head('attended', 'Были')}
                  {head('late', 'Опозд.')}
                  {head('noshow', 'Пропуски')}
                  {head('earlyLeave', 'Рано ушли')}
                  {head('hours', 'Часы')}
                  {head('avgShiftMin', 'Ср. смена')}
                  {head('reliability', 'Надёжность')}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} onClick={() => setOpen(e)} tabIndex={0} onKeyDown={(ev) => ev.key === 'Enter' && setOpen(e)}>
                    <td className="l"><strong>{e.fullName}</strong><small>{e.position ?? ''}</small></td>
                    <td>{e.planned}</td>
                    <td>{e.attended}</td>
                    <td className={e.late ? 'warn' : 'dim'}>{e.late || '·'}</td>
                    <td className={e.noshow ? 'bad' : 'dim'}>{e.noshow || '·'}</td>
                    <td className={e.earlyLeave ? 'warn' : 'dim'}>{e.earlyLeave || '·'}</td>
                    <td><div className="an-bar"><i style={{ width: `${(100 * e.hours) / maxHours}%` }} /><span>{e.hours}</span></div></td>
                    <td>{e.avgShiftMin ? hm(e.avgShiftMin) : '—'}</td>
                    <td>
                      {e.reliability == null ? '—' : (
                        <span className={`an-rel ${e.reliability >= 90 ? 'g' : e.reliability >= 70 ? 'y' : 'r'}`}>{e.reliability}%</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="ext-meta" style={{ marginTop: 8 }}>
            «Опоздал» считается по первой отметке прихода против начала смены, «пропуск» — смена в плане без отметок в прошедшие дни (отпуск и больничные не считаются). «Надёжность» — доля прошедших смен, на которые человек пришёл вовремя.
          </p>
        </>
      )}

      {open && <EmployeeDrawer emp={open} month={month} branchId={branchId} onClose={() => setOpen(null)} />}
    </>
  )
}

function TopList({ title, items, val, onOpen, tone }: { title: string; items: AnEmp[]; val: (e: AnEmp) => string; onOpen: (e: AnEmp) => void; tone: string }) {
  return (
    <section className={`an-card top ${tone}`}>
      <h4>{title}</h4>
      {items.length === 0 && <div className="dim">Никого</div>}
      {items.map((e, i) => (
        <button key={e.id} onClick={() => onOpen(e)}>
          <b>{i + 1}</b>
          <span>{e.fullName}</span>
          <em>{val(e)}</em>
        </button>
      ))}
    </section>
  )
}
