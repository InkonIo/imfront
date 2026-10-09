import { useEffect, useMemo, useState } from 'react'
import { planApi } from './planApi'
import type { Overview, OverviewCell } from './planApi'
import WeekNav from './WeekNav'
import { clk, dayLabel, errText, parseIso, posClass, shortName, toIso } from './planUtil'
import './plan.css'

const ROLE_TITLE = { MANAGER: 'Менеджеры', INSTRUCTOR: 'Инструкторы', STAFF: 'Сотрудники' } as const
const ABS: [RegExp, string][] = [[/vac/i, 'отпуск'], [/sick/i, 'больничный'], [/trip/i, 'командировка'], [/fire|dismiss/i, 'уволен'], [/holiday|celeb/i, 'праздник']]
const absLabel = (t?: string) => ABS.find(([re]) => re.test(t ?? ''))?.[1] ?? 'нет'

/** Общий график: все (менеджеры, инструкторы, сотрудники): кто, когда, во сколько и на какой позиции. */
export default function OverviewTab({ branchId }: { branchId: number }) {
  const today = toIso(new Date())
  const [from, setFrom] = useState(today)
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [who, setWho] = useState<'ALL' | 'MANAGER' | 'STAFF'>('ALL')
  const [hideEmpty, setHideEmpty] = useState(false)

  useEffect(() => {
    let alive = true
    setData(null)
    planApi.overview(branchId, from, 7).then((d) => { if (alive) { setData(d); setError('') } }).catch((e) => { if (alive) setError(errText(e)) })
    return () => { alive = false }
  }, [branchId, from])

  const groups = useMemo(() => {
    if (!data) return []
    const needle = q.trim().toLowerCase()
    const rows = data.rows.filter((r) =>
      (!needle || r.name.toLowerCase().includes(needle)) &&
      (who === 'ALL' || (who === 'MANAGER' ? r.role === 'MANAGER' : r.role !== 'MANAGER')) &&
      (!hideEmpty || r.any))
    return (['MANAGER', 'INSTRUCTOR', 'STAFF'] as const)
      .map((role) => ({ role, rows: rows.filter((r) => r.role === role) }))
      .filter((g) => g.rows.length > 0)
  }, [data, q, who, hideEmpty])

  const onShift = (i: number) => data ? data.rows.filter((r) => r.cells[i]?.kind === 'SHIFT').length : 0

  return (
    <>
      <div className="pl-bar">
        <WeekNav from={from} onChange={setFrom} home={today} homeLabel="Сегодня" />
        <input className="ext-input" type="search" placeholder="Поиск по имени" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} />
        <div className="sch-seg">
          <button className={who === 'ALL' ? 'on' : ''} onClick={() => setWho('ALL')}>Все</button>
          <button className={who === 'MANAGER' ? 'on' : ''} onClick={() => setWho('MANAGER')}>Менеджеры</button>
          <button className={who === 'STAFF' ? 'on' : ''} onClick={() => setWho('STAFF')}>Сотрудники</button>
        </div>
        <label className="ext-check"><input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} /> Скрыть без смен</label>
      </div>
      {error && <div className="ext-msg err">{error}</div>}
      {!data && !error && <div className="ext-wrap"><div className="ext-empty">Загрузка…</div></div>}
      {data && (
        <div className="ext-wrap pl-wrap">
          <table className="pl-grid ov-grid">
            <thead>
              <tr>
                <th className="pl-rowh">Кто</th>
                {data.days.map((d) => {
                  const wd = parseIso(d).getDay()
                  return <th key={d} className={`${wd === 0 || wd === 6 ? 'wkend' : ''} ${d === today ? 'today' : ''}`}>{dayLabel(d)}</th>
                })}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows key={g.role} title={`${ROLE_TITLE[g.role]} · ${g.rows.length}`} cols={data.days.length}>
                  {g.rows.map((r) => (
                    <tr key={r.id} className={r.any ? '' : 'ov-dim'}>
                      <th className="pl-rowh" title={r.name}>{shortName(r.name)}</th>
                      {r.cells.map((c, i) => <td key={i} className={data.days[i] === today ? 'today' : ''}><Cell c={c} /></td>)}
                    </tr>
                  ))}
                </GroupRows>
              ))}
              {groups.length === 0 && <tr><td colSpan={data.days.length + 1} className="ext-empty">Никого не найдено</td></tr>}
            </tbody>
            <tfoot>
              <tr>
                <th className="pl-rowh">На смене</th>
                {data.days.map((d, i) => <td key={d} className="ov-foot">{onShift(i)}</td>)}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="muted-s" style={{ marginTop: 8 }}>
        Позиция указана там, где смена из нашего графика (пунктир — черновик, ещё не опубликован). Остальное время берётся из Таймтрекера{data?.ttSyncedAt ? `, обновлено ${data.ttSyncedAt}` : ''}.
        Метка «≠ТТ» значит, что в Таймтрекере у человека другое время.
      </p>
    </>
  )
}

function GroupRows({ title, cols, children }: { title: string; cols: number; children: React.ReactNode }) {
  return (
    <>
      <tr className="ov-group"><td colSpan={cols + 1}>{title}</td></tr>
      {children}
    </>
  )
}

function Cell({ c }: { c: OverviewCell | null }) {
  if (!c) return <span className="ov-none">·</span>
  if (c.kind === 'OFF') return <span className="ov-off">вых</span>
  if (c.kind === 'ABSENCE') return <span className="ov-abs">{absLabel(c.note)}</span>
  const mismatch = c.ttStart != null
  return (
    <div className={`ov-shift src-${c.src}`} title={c.src === 'DRAFT' ? 'Черновик, ещё не опубликован' : c.src === 'TT' ? 'Из Таймтрекера' : 'Опубликованный график'}>
      <b>{c.start}–{clk(c.end)}</b>
      {c.pos && <span className={`pl-pos ${posClass(c.pos)}`}>{c.pos}</span>}
      {mismatch && <em title={`В Таймтрекере: ${c.ttStart}–${clk(c.ttEnd)}`}>≠ТТ</em>}
    </div>
  )
}