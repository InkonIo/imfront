import { useEffect, useMemo, useState } from 'react'
import { planApi } from './planApi'
import { extApi } from '../ext/api'
import type { Overview, OverviewCell } from './planApi'
import WeekNav from './WeekNav'
import DayEditor from '../ext/DayEditor'
import type { DayTarget } from '../ext/DayEditor'
import { clk, dayLabel, errText, mondayOf, parseIso, posClass, shortName, toIso } from './planUtil'
import './plan.css'

const ROLE_TITLE = { MANAGER: 'Менеджеры', INSTRUCTOR: 'Инструкторы', STAFF: 'Сотрудники' } as const
const ABS: [RegExp, string][] = [[/vac/i, 'отпуск'], [/sick/i, 'больничный'], [/trip/i, 'командировка'], [/fire|dismiss/i, 'уволен'], [/holiday|celeb/i, 'праздник']]
const absLabel = (t?: string) => ABS.find(([re]) => re.test(t ?? ''))?.[1] ?? 'нет'

/** Общий график: все (менеджеры, инструкторы, сотрудники): кто, когда, во сколько и на какой позиции. */
export default function OverviewTab({ branchId, canEdit = false }: { branchId: number; canEdit?: boolean }) {
  const today = toIso(new Date())
  const [from, setFrom] = useState(mondayOf(today))
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  // Показываем только менеджеров (фильтр «Все / Сотрудники» скрыт — раскомментируй setWho и блок ниже, чтобы вернуть)
  const [who] = useState<'ALL' | 'MANAGER' | 'STAFF'>('MANAGER')
  // const [who, setWho] = useState<'ALL' | 'MANAGER' | 'STAFF'>('ALL')
  const [hideEmpty, setHideEmpty] = useState(false)
  const [dayF, setDayF] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [note, setNote] = useState('')
  const [edit, setEdit] = useState<DayTarget | null>(null)

  useEffect(() => {
    let alive = true
    planApi.overview(branchId, from, 7).then((d) => { if (alive) { setData(d); setError('') } }).catch((e) => { if (alive) setError(errText(e)) })
    return () => { alive = false }
  }, [branchId, from, tick])
  useEffect(() => { setData(null); setDayF(null) }, [branchId, from])

  /** Подтянуть график из  а прямо сейчас (месяцы, в которые попала неделя). */
  async function syncNow() {
    setSyncing(true); setError(''); setNote('')
    try {
      const a = from.slice(0, 7), b = toIso(new Date(parseIso(from).getTime() + 6 * 86400000)).slice(0, 7)
      await extApi.syncSchedule(a)
      if (b !== a) await extApi.syncSchedule(b)
      setTick((x) => x + 1)
      setNote('График из  а обновлён')
    } catch (e) { setError(errText(e)) } finally { setSyncing(false) }
  }

  const groups = useMemo(() => {
    if (!data) return []
    const needle = q.trim().toLowerCase()
    const rows = data.rows.filter((r) =>
      (!needle || r.name.toLowerCase().includes(needle)) &&
      (who === 'ALL' || (who === 'MANAGER' ? r.role === 'MANAGER' : r.role !== 'MANAGER')) &&
      (!hideEmpty || r.any) &&
      (dayF == null || r.cells[dayF]?.kind === 'SHIFT'))
    return (['MANAGER', 'INSTRUCTOR', 'STAFF'] as const)
      .map((role) => ({ role, rows: rows.filter((r) => r.role === role) }))
      .filter((g) => g.rows.length > 0)
  }, [data, q, who, hideEmpty, dayF])

  /** Что показать в окне правки дня. */
  function target(r: { id: number; name: string }, i: number, c: OverviewCell): DayTarget {
    const day = data!.days[i]
    const now = c.kind === 'SHIFT' ? `${c.start}–${clk(c.end)}` : c.kind === 'OFF' ? 'выходной' : absLabel(c.note)
    const tt = c.ttStart != null ? `${c.ttStart}–${clk(c.ttEnd)}` : c.ttNote != null ? 'выходной/отсутствие' : null
    return {
      employeeId: r.id, name: r.name, day, dayTitle: dayLabel(day), now, tt, edited: false,
      warn: c.kind === 'ABSENCE' ? `В  е тут: ${absLabel(c.note)}` : null,
    }
  }

  const onShift = (i: number) => data ? data.rows.filter((r) => r.cells[i]?.kind === 'SHIFT' && !r.cells[i]?.noShow).length : 0

  return (
    <>
      <div className="pl-bar">
        <WeekNav from={from} onChange={setFrom} home={mondayOf(today)} homeLabel="Эта неделя" />
        <input className="ext-input" type="search" placeholder="Поиск по имени" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} />
        {/* Фильтр «Все / Менеджеры / Сотрудники» скрыт:
        <div className="sch-seg">
          <button className={who === 'ALL' ? 'on' : ''} onClick={() => setWho('ALL')}>Все</button>
          <button className={who === 'MANAGER' ? 'on' : ''} onClick={() => setWho('MANAGER')}>Менеджеры</button>
          <button className={who === 'STAFF' ? 'on' : ''} onClick={() => setWho('STAFF')}>Сотрудники</button>
        </div>
        */}
        <label className="ext-check"><input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} /> Скрыть без смен</label>
        <button className="ext-btn" disabled={syncing} onClick={() => void syncNow()}>{syncing ? 'Обновляю…' : 'Обновить'}</button>
        {dayF != null && data && <button className="ext-btn sm" onClick={() => setDayF(null)}>Только {dayLabel(data.days[dayF])} ✕</button>}
      </div>
      {data && data.ttSyncedMin != null && data.ttSyncedMin > 120 && (
        <div className="ext-msg err">Данные  а обновлялись {data.ttSyncedAt} — это давно, замены могут не отображаться. <button className="ext-btn sm" disabled={syncing} onClick={() => void syncNow()}>Обновить сейчас</button></div>
      )}
      {note && <div className="ext-msg ok">{note}</div>}
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
                  const i = data.days.indexOf(d)
                  return <th key={d} className={`${wd === 0 || wd === 6 ? 'wkend' : ''} ${d === today ? 'today' : ''} ov-dayh${dayF === i ? ' sel' : ''}`} title="Нажмите: показать только тех, кто работает в этот день" onClick={() => setDayF(dayF === i ? null : i)}>{dayLabel(d)}</th>
                })}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows key={g.role} title={`${ROLE_TITLE[g.role]} · ${g.rows.length}`} cols={data.days.length}>
                  {g.rows.map((r) => (
                    <tr key={r.id} className={r.any ? '' : 'ov-dim'}>
                      <th className="pl-rowh" title={r.name}>{shortName(r.name)}</th>
                      {r.cells.map((c, i) => (
                        <td key={i} className={data.days[i] === today ? 'today' : ''}
                          style={canEdit && c ? { cursor: 'pointer' } : undefined}
                          title={canEdit && c ? 'Нажмите, чтобы исправить время или поставить выходной' : undefined}
                          onClick={canEdit && c ? () => setEdit(target(r, i, c)) : undefined}>
                          <Cell c={c} />
                        </td>
                      ))}
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
        Главный источник —  : кто и когда работает. Позиция берётся из нашего графика (пунктир — черновик, ещё не опубликован). Для будущих дней, которых ещё нет в  е, показан наш график{data?.ttSyncedAt ? `, обновлено ${data.ttSyncedAt}` : ''}.
        Метка «≠ТТ» — в  е у человека другое время или выходной; «план …» — в плане было иначе; «замена» — человек вышел вместо другого; «не вышел» — в  е нет пробития спустя 3 часа после начала смены. В строке «На смене» такие не считаются.
      </p>
      {canEdit && <p className="muted-s">Нажмите на клетку, чтобы исправить время смены или поставить выходной. Правка сохраняется у нас и не затирается обновлением из ТТ.</p>}
      {edit && <DayEditor t={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setTick((x) => x + 1) }} />}
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

const planText = (p: { start: string; end: string; pos: string }) => `${p.pos} ${p.start}–${clk(p.end)}`

function Cell({ c }: { c: OverviewCell | null }) {
  if (!c) return <span className="ov-none">·</span>
  if (c.kind === 'OFF' || c.kind === 'ABSENCE') {
    return (
      <div className="ov-offc">
        {c.kind === 'OFF' ? <span className="ov-off">вых</span> : <span className="ov-abs">{absLabel(c.note)}</span>}
        {c.plan && <small className="ov-was" title="В нашем графике была смена">было {planText(c.plan)}{c.replacedBy ? ` → ${shortName(c.replacedBy)}` : ''}</small>}
      </div>
    )
  }
  const mismatch = c.ttStart != null || c.ttNote != null
  const ttTitle = c.ttStart != null ? `В  е: ${c.ttStart}–${clk(c.ttEnd)}` : 'В  е выходной/отсутствие'
  return (
    <div className={`ov-shift src-${c.src}${c.noShow ? ' noshow' : ''}`} title={c.src === 'DRAFT' ? 'Черновик, ещё не опубликован' : c.src === 'TT' ? 'Из  а' : 'Опубликованный график'}>
      <b>{c.start}–{clk(c.end)}</b>
      {c.noShow && <small className="ov-ns" title="В  е нет пробития спустя несколько часов после начала смены">не вышел</small>}
      {c.factIn && <small className="ov-in" title="Пробитие в  е">пришёл {c.factIn}</small>}
      {c.pos && <span className={`pl-pos ${posClass(c.pos)}`}>{c.pos}</span>}
      {c.parts && c.parts.length > 1 && <small className="ov-parts">{c.parts.map((p) => `${p.pos} ${p.start}–${clk(p.end)}`).join(' · ')}</small>}
      {c.replaces && <small className="ov-rep" title="Вышел вместо этого человека">замена: {shortName(c.replaces)}</small>}
      {c.plan && !c.replaces && <small className="ov-was" title="В нашем графике было иначе">план {planText(c.plan)}</small>}
      {mismatch && <em title={ttTitle}>≠ТТ</em>}
    </div>
  )
}