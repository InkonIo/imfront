import { useEffect, useMemo, useState } from 'react'
import { noteApi } from '../board/api'
import type { Note } from '../board/api'
import { sheetApi } from '../sheet/api'
import type { Sheet } from '../sheet/api'
import { AFTER, DURING, DURING_TOP, EXPIRY, HOURLY, HOURS, PREP, SPECIAL } from '../sheet/schema'
import './shift-extras.css'

type Part = 'm' | 'e'

const toNum = (s: string | undefined) => {
  if (!s) return null
  const n = parseFloat(s.replace(/[^\d,.-]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const nf = (n: number) => Math.round(n).toLocaleString('ru-RU')
const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null)

const ALL_ITEMS = [...PREP.flatMap((g) => g.items), ...DURING_TOP, ...DURING.flatMap((g) => g.items), ...SPECIAL, ...AFTER]

interface Props {
  outletId: number
  dayPart: string
  startedAt: string
}

/** Дополнительные цифры в «Итогах смены»: продажи, цели, каналы, бланк чек-листа и заметки точки. */
export default function ShiftExtras({ outletId, dayPart, startedAt }: Props) {
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let off = false
    sheetApi.current().then((s) => !off && setSheet(s)).catch(() => !off && setFailed(true))
    noteApi.list(outletId, true).then((n) => !off && setNotes(n)).catch(() => {})
    return () => {
      off = true
    }
  }, [outletId])

  const parts: Part[] = dayPart === 'MORNING' ? ['m'] : dayPart === 'EVENING' ? ['e'] : ['m', 'e']

  const d = useMemo(() => {
    if (!sheet) return null
    const v = sheet.values
    const sum = (col: string, sub: 'p' | 'f') => {
      let total = 0
      let any = false
      for (const part of parts) {
        HOURS[part].forEach((_, i) => {
          const n = toNum(v[`hr.${part}.${i}.${col}.${sub}`])
          if (n !== null) {
            total += n
            any = true
          }
        })
      }
      return any ? total : null
    }
    const sales = { p: sum('sales', 'p'), f: sum('sales', 'f') }
    const gc = { p: sum('gc', 'p'), f: sum('gc', 'f') }
    const channels = [
      { id: 'counter', label: 'Прилавок' },
      { id: 'kiosk', label: 'Киоски' },
      { id: 'mob', label: 'Моб. приложение' },
      { id: 'dlv', label: 'Delivery' },
    ].map((c) => ({ ...c, f: sum(c.id, 'f'), p: sum(c.id, 'p') }))

    // средний чек по накоплению — последнее заполненное значение, иначе выручка / гости
    let avg: number | null = null
    for (const part of [...parts].reverse()) {
      for (let i = HOURS[part].length - 1; i >= 0 && avg === null; i--) avg = toNum(v[`hr.${part}.${i}.avcheck.v`])
    }
    if (avg === null && sales.f && gc.f) avg = sales.f / gc.f

    const goals = ['sales', 'gc', 'avcheck'].map((id) => ({
      id,
      label: id === 'sales' ? 'Выручка' : id === 'gc' ? 'Гости (GC)' : 'Средний чек',
      goal: toNum(v[`goal.${id}.goal`]),
      result: toNum(v[`goal.${id}.result`]),
    }))

    const ticked = ALL_ITEMS.filter((it) => parts.some((p) => v[`chk.${it.id}.${p}`] === '1')).length
    const exp = EXPIRY.filter((_, i) => parts.some((p) => (v[`exp.${i}.${p}`] ?? '').trim() !== '')).length
    const prio = [1, 2, 3].map((n) => v[`prio.${n}`]).filter((x): x is string => !!x && x.trim() !== '')
    const hoursFilled = HOURLY.length > 0 ? parts.reduce((a, p) => a + HOURS[p].filter((_, i) => toNum(v[`hr.${p}.${i}.gc.f`]) !== null).length, 0) : 0
    const hoursTotal = parts.reduce((a, p) => a + HOURS[p].length, 0)

    return { sales, gc, avg, channels, goals, ticked, exp, prio, hoursFilled, hoursTotal }
  }, [sheet, parts.join('')]) // eslint-disable-line react-hooks/exhaustive-deps

  const started = new Date(startedAt).getTime()
  const mine = notes.filter((n) => new Date(n.createdAt).getTime() >= started).length
  const closed = notes.filter((n) => n.status === 'DONE' && n.statusAt && new Date(n.statusAt).getTime() >= started).length
  const open = notes.filter((n) => n.status !== 'DONE')

  if (failed && notes.length === 0) return null

  return (
    <div className="sx">
      {d && (
        <>
          <h3>Продажи за смену</h3>
          <div className="sx-grid">
            <Card label="Выручка (факт)" value={d.sales.f !== null ? nf(d.sales.f) : '—'} sub={d.sales.p ? `план ${nf(d.sales.p)}${d.sales.f !== null ? ` · ${pctOf(d.sales.f, d.sales.p)}%` : ''}` : 'план не задан'} bar={d.sales.f !== null && d.sales.p ? pctOf(d.sales.f, d.sales.p) : null} />
            <Card label="Гостей (GC)" value={d.gc.f !== null ? nf(d.gc.f) : '—'} sub={d.gc.p ? `план ${nf(d.gc.p)}${d.gc.f !== null ? ` · ${pctOf(d.gc.f, d.gc.p)}%` : ''}` : 'план не задан'} bar={d.gc.f !== null && d.gc.p ? pctOf(d.gc.f, d.gc.p) : null} />
            <Card label="Средний чек" value={d.avg !== null ? nf(d.avg) : '—'} sub="по накоплению" />
            <Card label="Часы заполнены" value={`${d.hoursFilled}/${d.hoursTotal}`} sub="в почасовой таблице" bar={pctOf(d.hoursFilled, d.hoursTotal)} />
          </div>

          <h3>Цели дня</h3>
          <div className="sx-goals">
            {d.goals.map((g) => (
              <div key={g.id} className="sx-goal">
                <span>{g.label}</span>
                <b>{g.result !== null ? nf(g.result) : '—'}</b>
                <small>
                  цель {g.goal !== null ? nf(g.goal) : '—'}
                  {g.goal && g.result !== null ? ` · ${pctOf(g.result, g.goal)}%` : ''}
                </small>
              </div>
            ))}
          </div>

          {d.channels.some((c) => c.f !== null) && (
            <>
              <h3>Каналы продаж (доля от гостей)</h3>
              <div className="sx-channels">
                {d.channels.map((c) => {
                  const share = c.f !== null && d.gc.f ? pctOf(c.f, d.gc.f) : null
                  return (
                    <div key={c.id} className="sx-ch">
                      <div>
                        <span>{c.label}</span>
                        <b>{share !== null ? `${share}%` : '—'}</b>
                      </div>
                      <i>
                        <u style={{ width: `${Math.min(100, share ?? 0)}%` }} />
                      </i>
                      <small>{c.f !== null ? `${nf(c.f)} гостей` : 'нет данных'}</small>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          <h3>Бланк «Чек-лист смены»</h3>
          <div className="sx-grid">
            <Card label="Галочек поставлено" value={`${d.ticked}/${ALL_ITEMS.length}`} sub={parts.length === 1 ? (parts[0] === 'm' ? 'за утро' : 'за вечер') : 'утро и вечер'} bar={pctOf(d.ticked, ALL_ITEMS.length)} />
            <Card label="Сроки хранения" value={`${d.exp}/${EXPIRY.length}`} sub="продуктов отмечено" bar={pctOf(d.exp, EXPIRY.length)} />
            <Card label="Приоритетов выбрано" value={`${d.prio.length}/3`} sub={d.prio.length ? d.prio.join(' · ') : 'ещё не выбраны'} />
          </div>
        </>
      )}

      <h3>Заметки точки</h3>
      <div className="sx-grid">
        <Card label="Добавлено за смену" value={String(mine)} sub="в «Табличке дня»" />
        <Card label="Закрыто за смену" value={String(closed)} sub="решённых проблем" tone="good" />
        <Card label="Ещё не закрыто" value={String(open.length)} sub={open.slice(0, 2).map((n) => n.title).join(' · ') || 'всё решено'} tone={open.length ? 'bad' : 'good'} />
      </div>
    </div>
  )
}

function Card({ label, value, sub, bar, tone }: { label: string; value: string; sub?: string; bar?: number | null; tone?: 'good' | 'bad' }) {
  return (
    <div className={tone ? `sx-card ${tone}` : 'sx-card'}>
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
      {bar != null && (
        <i>
          <u style={{ width: `${Math.min(100, bar)}%` }} />
        </i>
      )}
    </div>
  )
}