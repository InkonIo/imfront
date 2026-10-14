import { useMemo, useRef, useState } from 'react'
import { importApi } from './importApi'
import type { ImpApplied, ImpCell, ImpPreview, ImpWeek } from './importApi'
import './schedule-import.css'

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const POS: Record<string, string> = { INS: 'Инсайд', K: 'Кухня', C: 'Прилавок', MNGR: 'Задачи' }
const PART: Record<string, string> = { MORNING: 'утро', MID: 'промеж', EVENING: 'вечер', NIGHT: 'ночь' }

const fmt = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new Error('Не удалось прочитать файл'))
    r.onload = () => {
      const s = String(r.result ?? '')
      resolve(s.slice(s.indexOf(',') + 1))
    }
    r.readAsDataURL(file)
  })
}

function CellView({ c }: { c: ImpCell }) {
  if (c.kind === 'EMPTY') return <td className="si-c si-empty">·</td>
  if (c.kind === 'OFF') return <td className="si-c si-off">вых</td>
  if (c.kind === 'VACATION') return <td className="si-c si-vac">отпуск</td>
  if (c.kind === 'TASK') {
    return <td className="si-c si-task" title={c.warn ?? ''}><span>{c.note}</span><em>без времени</em></td>
  }
  const part = c.part ?? 'MORNING'
  return (
    <td className={`si-c si-shift p-${part.toLowerCase()}`} title={c.raw}>
      <b>{c.start}–{c.end}</b>
      <span className="si-tags">
        <i className={`si-pos pos-${c.pos ?? ''}`}>{POS[c.pos ?? ''] ?? c.pos}</i>
        <i className="si-part">{PART[part]}</i>
      </span>
      {c.note && <small>{c.note}</small>}
      {c.warn && <u>!</u>}
    </td>
  )
}

const GROUPS = ['MORNING', 'MID', 'EVENING', 'NIGHT'] as const
const POS_ORDER = ['INS', 'K', 'C', 'MNGR']
const GROUP_LABEL: Record<string, string> = { MORNING: '🌅 Утро', MID: '⛅ Промеж', EVENING: '🌙 Вечер', NIGHT: '🌌 Ночь' }

/** «Лисотова Диана» → «Диана» (в Excel фамилия первой). */
const firstName = (n: string) => n.trim().split(/\s+/)[1] ?? n

/** Так же, как в генераторе: дни по строкам, колонки — часть дня и позиция, в клетке имена. */
function PosGrid({ week }: { week: ImpWeek }) {
  const cols = useMemo(() => {
    const set = new Set<string>()
    for (const p of week.people) for (const c of p.cells) if (c.kind === 'SHIFT' && c.part && c.pos) set.add(`${c.part}|${c.pos}`)
    return [...set].sort((a, b) => {
      const [ga, pa] = a.split('|'); const [gb, pb] = b.split('|')
      return GROUPS.indexOf(ga as (typeof GROUPS)[number]) - GROUPS.indexOf(gb as (typeof GROUPS)[number]) || POS_ORDER.indexOf(pa) - POS_ORDER.indexOf(pb)
    })
  }, [week])
  const groups = GROUPS.filter((g) => cols.some((c) => c.startsWith(`${g}|`)))
  return (
    <div className="si-grid-wrap">
      <table className="si-pg">
        <thead>
          <tr>
            <th rowSpan={2}>Дата</th>
            {groups.map((g) => <th key={g} className={`g-${g.toLowerCase()}`} colSpan={cols.filter((c) => c.startsWith(`${g}|`)).length}>{GROUP_LABEL[g]}</th>)}
          </tr>
          <tr>{cols.map((c) => <th key={c} className="sub">{POS[c.split('|')[1]] ?? c.split('|')[1]}</th>)}</tr>
        </thead>
        <tbody>
          {DAYS.map((d, i) => {
            const date = addDays(week.weekStart, i)
            return (
              <tr key={d}>
                <th className={i >= 5 ? 'we' : ''}>{d} <span>{fmt(date)}</span></th>
                {cols.map((col) => {
                  const [g, pos] = col.split('|')
                  const who = week.people.flatMap((p) => p.cells.filter((c) => c.day === i && c.kind === 'SHIFT' && c.part === g && c.pos === pos).map((c) => ({ p, c })))
                  return (
                    <td key={col}>
                      {who.map(({ p, c }) => (
                        <span key={p.name} className="si-chip" title={`${p.name}${c.note ? ' — ' + c.note : ''}`}>
                          {firstName(p.name)}<small>{c.start}</small>
                        </span>
                      ))}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Загрузка Excel «Расписание менеджеров».
 * Файл → предпросмотр по неделям (с позициями и частью дня) → «Загрузить в график».
 */
export default function ScheduleImport({ branchId, onDone, onClose }: { branchId: number; onDone: () => void; onClose: () => void }) {
  const [data, setData] = useState('')
  const [fileName, setFileName] = useState('')
  const [pv, setPv] = useState<ImpPreview | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [active, setActive] = useState<string>('')
  const [map, setMap] = useState<Record<string, number>>({})
  const [publish, setPublish] = useState(true)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<'pos' | 'people'>('pos')
  const [error, setError] = useState('')
  const [done, setDone] = useState<ImpApplied[] | null>(null)
  const input = useRef<HTMLInputElement>(null)

  async function onFile(f: File | undefined) {
    if (!f) return
    setError(''); setPv(null); setDone(null); setMap({})
    if (!/\.xlsx$/i.test(f.name)) { setError('Нужен файл Excel в формате .xlsx'); return }
    setBusy(true)
    try {
      const b64 = await toBase64(f)
      const r = await importApi.preview(branchId, b64)
      setData(b64); setFileName(f.name); setPv(r)
      const withShifts = r.weeks.filter((w) => w.shifts > 0).map((w) => w.weekStart)
      setPicked(withShifts)
      setActive(withShifts[0] ?? r.weeks[0]?.weekStart ?? '')
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  const week: ImpWeek | undefined = useMemo(() => pv?.weeks.find((w) => w.weekStart === active), [pv, active])

  function toggle(ws: string) {
    setPicked((p) => (p.includes(ws) ? p.filter((x) => x !== ws) : [...p, ws]))
  }

  const pickedMissing = useMemo(() => {
    if (!pv) return 0
    const names = new Set<string>()
    for (const w of pv.weeks) {
      if (!picked.includes(w.weekStart)) continue
      for (const p of w.people) if (p.employeeId == null && map[p.name] == null && p.cells.some((c) => c.kind === 'SHIFT')) names.add(p.name)
    }
    return names.size
  }, [pv, picked, map])

  async function apply() {
    if (!pv || picked.length === 0) return
    setBusy(true); setError('')
    try {
      const r = await importApi.apply(branchId, data, picked, map, publish)
      setDone(r.results)
      onDone()
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  const totalShifts = pv ? pv.weeks.filter((w) => picked.includes(w.weekStart)).reduce((a, w) => a + w.shifts, 0) : 0

  return (
    <div className="si-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="si-box" role="dialog" aria-label="Загрузка графика из Excel">
        <div className="si-head">
          <div>
            <h3>Загрузить график из Excel</h3>
            <p>Файл «Расписание менеджеров»: один лист — одна неделя. Время начала определяет часть дня, текст в клетке — позицию.</p>
          </div>
          <button className="si-x" onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        {!done && (
          <div className="si-drop" onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void onFile(e.dataTransfer.files[0]) }}>
            <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
            <b>{busy && !pv ? 'Читаю файл…' : fileName ? `📄 ${fileName}` : 'Нажмите или перетащите сюда .xlsx'}</b>
            {fileName && <span>Нажмите, чтобы выбрать другой файл</span>}
          </div>
        )}

        {error && <div className="ext-msg err">{error}</div>}

        {pv && !done && (
          <>
            <div className="si-weeks">
              {pv.weeks.map((w) => (
                <div key={w.weekStart} className={`si-wk${w.weekStart === active ? ' on' : ''}${w.shifts === 0 ? ' dim' : ''}`}>
                  <label>
                    <input type="checkbox" checked={picked.includes(w.weekStart)} disabled={w.shifts === 0} onChange={() => toggle(w.weekStart)} />
                    <span onClick={(e) => { e.preventDefault(); setActive(w.weekStart) }}>
                      <b>{fmt(w.weekStart)} – {fmt(addDays(w.weekStart, 6))}</b>
                      <em>{w.shifts > 0 ? `${w.shifts} смен` : 'пусто'}{w.hasDraft ? ' · уже есть график' : ''}</em>
                    </span>
                  </label>
                </div>
              ))}
            </div>

            <div className="si-tabs">
              <button className={view === 'pos' ? 'on' : ''} onClick={() => setView('pos')}>По позициям</button>
              <button className={view === 'people' ? 'on' : ''} onClick={() => setView('people')}>По людям</button>
            </div>

            {week && view === 'pos' && <PosGrid week={week} />}

            {week && view === 'people' && (
              <div className="si-grid-wrap">
                <table className="si-grid">
                  <thead>
                    <tr>
                      <th>Кто</th>
                      {DAYS.map((d, i) => (
                        <th key={d}>{d} {fmt(addDays(week.weekStart, i))}{week.dayNotes[i] ? <small>{week.dayNotes[i]}</small> : null}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {week.people.map((p) => {
                      const sel = map[p.name] ?? p.employeeId
                      return (
                        <tr key={p.name}>
                          <th className={sel == null ? 'si-who bad' : 'si-who'}>
                            <b>{p.name}</b>
                            <small>{p.title}</small>
                            {p.employeeId == null && (
                              <select value={map[p.name] ?? ''} onChange={(e) => {
                                const v = e.target.value
                                setMap((m) => { const n = { ...m }; if (v) n[p.name] = Number(v); else delete n[p.name]; return n })
                              }}>
                                <option value="">— не найден, выберите —</option>
                                {pv.employees.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                              </select>
                            )}
                          </th>
                          {p.cells.map((c) => <CellView key={c.day} c={c} />)}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {week && week.warnings.length > 0 && (
              <ul className="si-warn">{week.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            )}

            <div className="si-legend">
              <i className="p-morning">утро — старт до 11:00</i>
              <i className="p-mid">промеж — 11:00–15:00</i>
              <i className="p-evening">вечер — с 15:00</i>
              <span>«!» — проверьте клетку · пунктир — задача без времени, в график не попадёт</span>
            </div>

            <div className="si-foot">
              <label className="si-pub">
                <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
                Сразу опубликовать (иначе останется черновиком)
              </label>
              <button className="ext-btn primary" disabled={busy || picked.length === 0} onClick={() => void apply()}>
                {busy ? 'Загружаю…' : `Загрузить в график: ${picked.length} нед., ${totalShifts} смен`}
              </button>
            </div>
            {pickedMissing > 0 && (
              <p className="si-hint">Людей без пары в выбранных неделях: {pickedMissing}. Выберите их в таблице или их смены будут пропущены.</p>
            )}
          </>
        )}

        {done && (
          <div className="si-done">
            <div className="ext-msg ok">Готово. График загружен{publish ? ' и опубликован' : ' в черновик'}.</div>
            <ul>
              {done.map((r) => (
                <li key={r.weekStart}>
                  <b>{fmt(r.weekStart)} – {fmt(addDays(r.weekStart, 6))}</b>{' '}
                  {r.error ? <span className="si-bad">{r.error}</span> : <>— смен: {r.shifts}, людей: {r.people}{r.skippedPeople && r.skippedPeople.length > 0 ? `, пропущены: ${r.skippedPeople.join(', ')}` : ''}</>}
                </li>
              ))}
            </ul>
            <button className="ext-btn primary" onClick={onClose}>Закрыть</button>
          </div>
        )}
      </div>
    </div>
  )
}