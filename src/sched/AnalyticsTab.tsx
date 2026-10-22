import { useEffect, useMemo, useState } from 'react'
import { planApi } from './planApi'
import type { AnCoverage, AnShift, AnShifts } from './planApi'
import { extApi } from '../ext/api'
import { addDays, clk, dayLabel, errText, hm, hrs, mondayOf, parseIso, shortName, toIso } from './planUtil'
import './plan.css'

type Mode = 'day' | 'week' | 'month' | 'report'

/** Позиции, по которым считаем производственные и непроизводственные часы. К, С и остальные считаются производственными целиком. */
const GROUPS = ['DLK', 'MR', 'GEL', 'NIGHT'] as const
type Group = (typeof GROUPS)[number]
const G_TITLE: Record<Group, string> = { DLK: 'DLK', MR: 'MR', GEL: 'GEL', NIGHT: 'Ночь' }

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const daysBetween = (a: string, b: string) => Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86400000)
const gcphFmt = (v: number | null) => (v == null ? '—' : v.toFixed(2).replace('.', ','))
const num = (v: number) => v.toLocaleString('ru')

/* Сколько часов смены непроизводственные. Задаёт сам пользователь, хранится в этом браузере. Ночь всегда целиком непроизводственная. */
interface Np { pct: number }
type NpMap = Record<'DLK' | 'MR' | 'GEL', Np>
const NP_KEY = 'sched.analytics.np2'
const DEFAULT_NP: NpMap = { DLK: { pct: 50 }, MR: { pct: 50 }, GEL: { pct: 50 } }
const loadNp = (): NpMap => { try { const r = localStorage.getItem(NP_KEY); return r ? { ...DEFAULT_NP, ...JSON.parse(r) } : DEFAULT_NP } catch { return DEFAULT_NP } }
const saveNp = (m: NpMap) => { try { localStorage.setItem(NP_KEY, JSON.stringify(m)) } catch { /* без хранилища тоже работает */ } }

const isNightTime = (start: string) => { const m = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)); return m >= 21 * 60 || m < 4 * 60 }
const groupOf = (code: string | null, start: string): Group | null => {
  if (code) {
    if (/^(NT|COMBO)/i.test(code)) return 'NIGHT'
    if (code === 'DLK' || code === 'MR' || code === 'GEL') return code
    return null
  }
  return isNightTime(start) ? 'NIGHT' : null
}

function rangeOf(mode: Mode, anchor: string, cov: AnCoverage | null): { from: string; to: string } {
  if (mode === 'day') return { from: anchor, to: anchor }
  if (mode === 'week') { const f = mondayOf(anchor); return { from: f, to: addDays(f, 6) } }
  if (mode === 'month') {
    const d = parseIso(anchor)
    return { from: toIso(new Date(d.getFullYear(), d.getMonth(), 1)), to: toIso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) }
  }
  const to = cov?.salesTo ?? anchor
  let from = cov?.salesFrom ?? anchor
  if (daysBetween(from, to) > 61) from = addDays(to, -61)
  return { from, to }
}
function step(mode: Mode, anchor: string, dir: 1 | -1) {
  if (mode === 'day') return addDays(anchor, dir)
  if (mode === 'week') return addDays(anchor, 7 * dir)
  const d = parseIso(anchor)
  return toIso(new Date(d.getFullYear(), d.getMonth() + dir, 1))
}

interface Sh extends AnShift { group: Group | null; np: number; prod: number }
interface Tot { shifts: number; min: number; np: number; prod: number }
const zero = (): Tot => ({ shifts: 0, min: 0, np: 0, prod: 0 })
const add = (t: Tot, s: Sh) => { t.shifts++; t.min += s.min; t.np += s.np; t.prod += s.prod }

export default function AnalyticsTab({ branchId }: { branchId: number }) {
  const today = toIso(new Date())
  const [cov, setCov] = useState<AnCoverage | null>(null)
  const [mode, setMode] = useState<Mode>('week')
  const [anchor, setAnchor] = useState(mondayOf(today))
  const [data, setData] = useState<AnShifts | null>(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [np, setNp] = useState<NpMap>(loadNp)
  const [skipNoShow, setSkipNoShow] = useState(true)
  const [withManagers, setWithManagers] = useState(false)
  const [tick, setTick] = useState(0)
  const [up, setUp] = useState(false)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    let alive = true
    planApi.analyticsCoverage(branchId).then((c) => {
      if (!alive) return
      setCov(c)
      if (c.salesTo) { setMode('report'); setAnchor(c.salesTo) }
    }).catch(() => { /* без покрытия работает и так */ })
    return () => { alive = false }
  }, [branchId, tick])

  const { from, to } = rangeOf(mode, anchor, cov)

  useEffect(() => {
    let alive = true
    setData(null)
    planApi.analyticsShifts(branchId, from, to, false)
      .then((d) => { if (alive) { setData(d); setError('') } })
      .catch((e) => { if (alive) setError(errText(e)) })
    return () => { alive = false }
  }, [branchId, from, to, tick])

  const setPct = (g: 'DLK' | 'MR' | 'GEL', pct: number) => { const m = { ...np, [g]: { pct } }; setNp(m); saveNp(m) }

  const calc = useMemo(() => {
    if (!data) return null
    const staff: Sh[] = []
    let noShow = 0, noPos = 0, managers = 0
    for (const s of data.shifts) {
      if (s.noShow) { noShow++; if (skipNoShow) continue }
      const isMgr = s.role === 'MANAGER'
      if (isMgr && !withManagers) continue
      const can = data.can[String(s.emp)] ?? []
      const code = s.pos ?? (can.length === 1 ? can[0] : null)
      const group = isMgr ? null : groupOf(code, s.start)
      if (!isMgr && group == null && s.pos == null) noPos++
      let n = 0
      if (group === 'NIGHT') n = s.min
      else if (group) n = Math.round(s.min * np[group].pct / 100)
      if (isMgr) managers++
      staff.push({ ...s, group: isMgr ? null : group, pos: code, np: n, prod: s.min - n })
    }
    const people = staff.filter((s) => s.role !== 'MANAGER')
    const byGroup = new Map<Group, Tot & { people: Set<number> }>()
    const byEmp = new Map<number, { name: string; g: Map<Group, Tot> }>()
    for (const s of people) {
      if (!s.group) continue
      const t = byGroup.get(s.group) ?? { ...zero(), people: new Set<number>() }
      add(t, s); t.people.add(s.emp); byGroup.set(s.group, t)
      const e = byEmp.get(s.emp) ?? { name: s.name, g: new Map<Group, Tot>() }
      const gt = e.g.get(s.group) ?? zero(); add(gt, s); e.g.set(s.group, gt); byEmp.set(s.emp, e)
    }
    const perDay = new Map<string, Tot>()
    for (const s of staff) { const t = perDay.get(s.day) ?? zero(); add(t, s); perDay.set(s.day, t) }
    return { staff, people, byGroup, byEmp, perDay, noShow, noPos, managers }
  }, [data, np, skipNoShow, withManagers])

  const gc = useMemo(() => {
    if (!data || !calc) return null
    const sd = data.sales.byDay.filter((d) => d.total > 1 && calc.perDay.has(d.day))
    const guests = sd.reduce((a, d) => a + d.total, 0)
    const prodMin = sd.reduce((a, d) => a + (calc.perDay.get(d.day)?.prod ?? 0), 0)
    const all = data.sales.byDay.filter((d) => d.total > 1).length
    return { guests, prodMin, days: sd.length, allDays: all, gcph: guests > 0 && prodMin > 0 ? guests / (prodMin / 60) : null }
  }, [data, calc])

  const dayGcph = (day: string) => {
    const g = data?.sales.byDay.find((d) => d.day === day)?.total ?? 0
    const p = calc?.perDay.get(day)?.prod ?? 0
    return g > 1 && p > 0 ? g / (p / 60) : null
  }

  async function upload(f: File | undefined) {
    if (!f) return
    setUp(true); setMsg(''); setError('')
    try {
      const buf = new Uint8Array(await f.arrayBuffer())
      let bin = ''
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      const r = await planApi.importSales(branchId, f.name, btoa(bin))
      setMsg(`Отчёт загружен: ${dayLabel(r.from)} – ${dayLabel(r.to)}, дней ${r.days}, гостей ${num(r.guests)}`)
      setTick((x) => x + 1)
    } catch (e) { setError(errText(e)) } finally { setUp(false) }
  }

  async function syncTt() {
    setSyncing(true); setMsg(''); setError('')
    try {
      const months = new Set<string>()
      for (let d = from; d <= to; d = addDays(d, 1)) months.add(d.slice(0, 7))
      for (const m of months) await extApi.syncSchedule(m)
      setMsg(`График из  а обновлён: ${[...months].join(', ')}`)
      setTick((x) => x + 1)
    } catch (e) { setError(errText(e)) } finally { setSyncing(false) }
  }

  const dayOptions = useMemo(() => {
    const dates = [cov?.salesFrom, cov?.salesTo, cov?.ttFrom, cov?.ttTo].filter((x): x is string => !!x).sort()
    if (dates.length === 0) return [] as string[]
    let a = dates[0]; const b = dates[dates.length - 1]
    if (daysBetween(a, b) > 120) a = addDays(b, -120)
    const out: string[] = []
    for (let d = b; d >= a; d = addDays(d, -1)) out.push(d)
    return out
  }, [cov])

  const label = mode === 'month' ? `${MONTHS[parseIso(from).getMonth()]} ${parseIso(from).getFullYear()}` : mode === 'day' ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}`
  const totalGuests = data ? data.sales.byDay.reduce((a, d) => a + (d.total > 1 ? d.total : 0), 0) : 0
  const gTot = calc ? [...calc.byGroup.values()].reduce((a, t) => ({ min: a.min + t.min, np: a.np + t.np, prod: a.prod + t.prod }), { min: 0, np: 0, prod: 0 }) : { min: 0, np: 0, prod: 0 }
  const emps = calc ? [...calc.byEmp.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, 'ru')) : []

  return (
    <>
      <div className="pl-bar">
        <div className="sch-seg">
          <button className={mode === 'day' ? 'on' : ''} onClick={() => { setMode('day'); if (mode === 'report') setAnchor(cov?.salesTo ?? today) }}>День</button>
          <button className={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')}>Неделя</button>
          <button className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>Месяц</button>
          <button className={mode === 'report' ? 'on' : ''} onClick={() => setMode('report')} disabled={!cov?.salesFrom}>Период отчёта</button>
        </div>
        {mode !== 'report' && (
          <div className="wk-nav">
            <button className="ext-btn sq" aria-label="Раньше" onClick={() => setAnchor(step(mode, anchor, -1))}>‹</button>
            <div className="wk-label">{label}</div>
            <button className="ext-btn sq" aria-label="Позже" onClick={() => setAnchor(step(mode, anchor, 1))}>›</button>
          </div>
        )}
        {mode === 'report' && <div className="wk-label">{label}</div>}
        {mode === 'day' && dayOptions.length > 0 && (
          <select className="ext-input an-daysel" value={dayOptions.includes(anchor) ? anchor : ''} onChange={(e) => e.target.value && setAnchor(e.target.value)} aria-label="День">
            <option value="">выбрать день…</option>
            {dayOptions.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
          </select>
        )}
      </div>

      <div className="an-info">
        <span>Гости из отчёта: <b>{cov?.salesFrom ? `${dayLabel(cov.salesFrom)} – ${dayLabel(cov.salesTo ?? cov.salesFrom)}` : 'не загружены'}</b></span>
        <label className={`ext-btn sm an-up${up ? ' dis' : ''}`}>
          {up ? 'Загружаю…' : 'Загрузить Excel'}
          <input type="file" accept=".xlsx" hidden disabled={up} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        <button className="ext-btn sm" disabled={syncing} onClick={() => void syncTt()}>{syncing ? 'Обновляю…' : 'Обновить график из ТТ'}</button>
      </div>

      {error && <div className="ext-msg err">{error}</div>}
      {msg && <div className="ext-msg ok">{msg}</div>}
      {!data && !error && <div className="ext-empty">Загрузка…</div>}

      {data && calc && (
        <>
          <div className="an-tiles">
            <div className="gc"><b>{gcphFmt(gc?.gcph ?? null)}</b><span>GCPH</span></div>
            <div><b>{num(totalGuests)}</b><span>гостей (GC)</span></div>
            <div className="hi"><b>{hrs(gc?.prodMin ?? 0)} ч</b><span>производственные часы всех</span></div>
            <div><b>{calc.people.length}</b><span>смен сотрудников</span></div>
          </div>

          <div className="an-set2">
            <b>Непроизводственная часть смены:</b>
            {(['DLK', 'MR', 'GEL'] as const).map((g) => (
              <label key={g} className="an-pct">{g}
                <input className="ext-input an-num" type="number" min={0} max={100} step={5} value={np[g].pct} onChange={(e) => setPct(g, Math.min(100, Math.max(0, Number(e.target.value))))} />%
              </label>
            ))}
            <span className="an-mute">Ночь (NT1, NT2, Combo) — вся смена. К, С — всё производственное.</span>
          </div>

          <div className="an-opts">
            <label className="ext-check"><input type="checkbox" checked={skipNoShow} onChange={(e) => setSkipNoShow(e.target.checked)} /> не считать не вышедших (нет пробития в ТТ){calc.noShow > 0 ? `: ${calc.noShow}` : ''}</label>
            <label className="ext-check"><input type="checkbox" checked={withManagers} onChange={(e) => setWithManagers(e.target.checked)} /> менеджеры в GCPH</label>
          </div>

          {calc.people.length === 0 && <div className="ext-msg err">За этот период нет смен. Нажмите «Обновить график из ТТ».</div>}
          {calc.people.length > 0 && totalGuests === 0 && <div className="ext-msg err">За этот период нет гостей из отчёта. GCPH не посчитать: загрузите Excel с этими датами.</div>}
          {gc && gc.allDays > gc.days && <div className="ext-msg err">GCPH по {gc.days} из {gc.allDays} дней: считаются только дни, где есть и гости, и смены.</div>}
          {calc.noPos > 0 && (
            <div className="ext-msg err">
              У {calc.noPos} смен нет позиции (это К, С или позиция неизвестна), они в таблицах DLK / MR / GEL / Ночь не показаны, но в часах и GCPH учтены как производственные.
              {cov?.planFrom ? ` Позиции есть там, где загружен наш график: ${dayLabel(cov.planFrom)} – ${dayLabel(cov.planTo ?? cov.planFrom)}.` : ''}
            </div>
          )}

          {mode === 'day' ? (
            <DayList day={from} calc={calc} guests={data.sales.byDay.find((d) => d.day === from)?.total ?? 0} gcph={dayGcph(from)} />
          ) : (
            <>
              <h3 className="hub-h">По позициям</h3>
              <div className="ext-wrap pl-wrap">
                <table className="pl-grid an-tbl">
                  <thead><tr><th className="pl-rowh">Позиция</th><th>Людей</th><th>Смен</th><th>В смене</th><th>Непроизводственные</th><th>Производственные</th></tr></thead>
                  <tbody>
                    {GROUPS.map((g) => {
                      const t = calc.byGroup.get(g)
                      return (
                        <tr key={g}>
                          <td className="pl-rowh">{G_TITLE[g]}</td>
                          <td>{t ? t.people.size : '—'}</td><td>{t?.shifts ?? '—'}</td>
                          <td>{t ? `${hrs(t.min)} ч` : '—'}</td><td>{t ? `${hrs(t.np)} ч` : '—'}</td><td><b>{t ? `${hrs(t.prod)} ч` : '—'}</b></td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr><th className="pl-rowh">Итого</th><td /><td /><td className="ov-foot">{hrs(gTot.min)} ч</td><td className="ov-foot">{hrs(gTot.np)} ч</td><td className="ov-foot">{hrs(gTot.prod)} ч</td></tr>
                  </tfoot>
                </table>
              </div>

              <h3 className="hub-h">По сотрудникам</h3>
              {emps.length === 0 ? <div className="ext-wrap"><div className="ext-empty">Нет смен на DLK, MR, GEL и ночью за этот период.</div></div> : (
                <div className="ext-wrap pl-wrap">
                  <table className="pl-grid an-tbl">
                    <thead>
                      <tr><th className="pl-rowh">Сотрудник</th>{GROUPS.map((g) => <th key={g}>{G_TITLE[g]}</th>)}<th>Непроизв.</th><th>Произв.</th></tr>
                    </thead>
                    <tbody>
                      {emps.map(([id, e]) => {
                        const tot = [...e.g.values()].reduce((a, t) => ({ np: a.np + t.np, prod: a.prod + t.prod }), { np: 0, prod: 0 })
                        return (
                          <tr key={id}>
                            <td className="pl-rowh">{shortName(e.name)}</td>
                            {GROUPS.map((g) => {
                              const t = e.g.get(g)
                              return <td key={g}>{t ? <>{hrs(t.min)} ч<small className="an-sub">непр. {hrs(t.np)}</small></> : <span className="ov-none">·</span>}</td>
                            })}
                            <td>{hrs(tot.np)} ч</td><td><b>{hrs(tot.prod)} ч</b></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <h3 className="hub-h">По дням</h3>
              <div className="ext-wrap pl-wrap">
                <table className="pl-grid an-tbl">
                  <thead><tr><th className="pl-rowh">День</th><th>Гостей (GC)</th><th>Выручка, ₸</th><th>Произв. часы всех</th><th>GCPH</th></tr></thead>
                  <tbody>
                    {data.sales.byDay.map((sd) => {
                      const g = sd.total > 1 ? sd.total : 0
                      const pd = calc.perDay.get(sd.day)
                      return (
                        <tr key={sd.day} className="an-row" onClick={() => { setMode('day'); setAnchor(sd.day) }} title="Открыть этот день">
                          <td className="pl-rowh">{dayLabel(sd.day)}</td>
                          <td>{g ? num(g) : '—'}</td><td>{g ? num(sd.amount) : '—'}</td>
                          <td>{pd ? `${hrs(pd.prod)} ч` : '—'}</td><td><b>{gcphFmt(dayGcph(sd.day))}</b></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <p className="an-note">
            GCPH = гости (GC) из отчёта iiko ÷ производственные часы всех сотрудников{withManagers ? ' и менеджеров' : ' (без менеджеров)'}. Производственные часы = часы в смене минус непроизводственная часть.
            Время смен берётся из  а, позиции из нашего графика. Ночные смены без позиции определяются по времени (с 21:00 до 04:00).
          </p>
        </>
      )}
    </>
  )
}

function DayList({ day, calc, guests, gcph }: { day: string; calc: { people: Sh[]; perDay: Map<string, Tot> }; guests: number; gcph: number | null }) {
  const list = calc.people.filter((s) => s.day === day && s.group).sort((a, b) => String(a.group).localeCompare(String(b.group)) || a.start.localeCompare(b.start))
  const all = calc.perDay.get(day)
  return (
    <>
      <div className="an-day">
        <b>{dayLabel(day)}</b>
        <span>гостей: <b>{guests > 1 ? num(guests) : 'нет в отчёте'}</b></span>
        <span>смен всего: <b>{all?.shifts ?? 0}</b></span>
        <span>производственные часы всех: <b>{hrs(all?.prod ?? 0)} ч</b></span>
        <span>GCPH дня: <b>{gcphFmt(gcph)}</b></span>
      </div>
      {list.length === 0 ? <div className="ext-wrap"><div className="ext-empty">В этот день нет смен на DLK, MR, GEL и ночью (или позиция неизвестна).</div></div> : (
        <div className="ext-wrap pl-wrap">
          <table className="pl-grid an-tbl">
            <thead><tr><th className="pl-rowh">Сотрудник</th><th>Позиция</th><th>Смена</th><th>В смене</th><th>Непроизв.</th><th>Произв.</th></tr></thead>
            <tbody>
              {list.map((s, i) => (
                <tr key={i}>
                  <td className="pl-rowh">{shortName(s.name)}</td>
                  <td>{s.group ? G_TITLE[s.group] : ''}</td>
                  <td>{s.start}–{clk(s.end)}{s.noShow ? <small className="ov-ns"> не вышел</small> : s.factIn ? <small className="ov-in"> пришёл {s.factIn}</small> : null}</td>
                  <td>{hm(s.min)}</td><td>{hm(s.np)}</td><td><b>{hm(s.prod)}</b></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th className="pl-rowh">Итого</th><td /><td />
                <td className="ov-foot">{hm(list.reduce((a, s) => a + s.min, 0))}</td>
                <td className="ov-foot">{hm(list.reduce((a, s) => a + s.np, 0))}</td>
                <td className="ov-foot">{hm(list.reduce((a, s) => a + s.prod, 0))}</td></tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  )
}
// тип результата useMemo для DayList