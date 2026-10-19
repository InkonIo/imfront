import { useEffect, useRef, useState } from 'react'
import { api, tokenStore } from '../api'
import { Modal } from '../admin/ui'
import { useAuth } from '../auth'
import type { Outlet } from '../types'
import { managerScheduleApi } from './api'
import { SHIFT_PRESETS, addDays, currentMonday, dm, dowLabel, restWarning } from './types'
import type { ManagerBoard, ManagerEntry, ManagerWeek } from './types'
import './manager-schedule.css'

const WEEK_DAYS = 7
const BASE = (import.meta.env.VITE_API_URL ?? '') 
const API = `${BASE}/api/manager-schedule`

function shiftClass(start: string | null, end: string | null, dayOff: boolean, offReq: boolean): string {
  if (dayOff) return offReq ? 'day-off-req' : 'day-off'
  if (!start) return 'empty'
  const h = parseInt(start.slice(0, 2), 10)
  const endH = end ? parseInt(end.slice(0, 2), 10) : 0
  if (h >= 15 || endH >= 23 || (endH >= 0 && endH <= 3)) return 'shift-evening'
  if (h < 10) return 'shift-morning'
  return 'shift-midday'
}

export default function ManagerSchedulePage() {
  const { user } = useAuth()
  const isAdmin = user?.accountRole === 'SUPER_ADMIN'
  const [outlets, setOutlets] = useState<Outlet[]>(isAdmin ? [] : (user?.outlets ?? []))
  const [outletId, setOutletId] = useState<number | null>(isAdmin ? null : (user?.outlets[0]?.id ?? null))
  const [weeks, setWeeks] = useState<ManagerWeek[]>([])
  const [activeWeekId, setActiveWeekId] = useState<number | null>(null)
  const [board, setBoard] = useState<ManagerBoard | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [picker, setPicker] = useState<{ userId: number; date: string } | null>(null)
  const [showNewWeek, setShowNewWeek] = useState(false)
  const [showImport, setShowImport] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    api.adminOutlets().then(o => {
      setOutlets(o)
      setOutletId(cur => cur ?? o[0]?.id ?? null)
    }).catch(() => {})
  }, [isAdmin])

  useEffect(() => {
    if (outletId === null) return
    managerScheduleApi.weeks(outletId).then(w => {
      setWeeks(w)
      setActiveWeekId(w[0]?.id ?? null)
    }).catch(() => setError('Ошибка загрузки'))
  }, [outletId])

  useEffect(() => {
    if (!activeWeekId) return
    setBoard(null)
    managerScheduleApi.board(activeWeekId).then(setBoard).catch(() => setError('Ошибка загрузки'))
  }, [activeWeekId])

  async function onSaveEntry(entry: Omit<ManagerEntry, 'id' | 'userName' | 'jobTitle'>) {
    if (!board || !outletId) return
    setBusy(true)
    try {
      const saved = await managerScheduleApi.saveEntry({ ...entry, weekId: board.week.id, outletId })
      setBoard(b => b ? {
        ...b,
        entries: b.entries.some(e => e.userId === saved.userId && e.date === saved.date)
          ? b.entries.map(e => e.userId === saved.userId && e.date === saved.date ? saved : e)
          : [...b.entries, saved]
      } : b)
    } catch { setError('Ошибка сохранения') }
    finally { setBusy(false) }
  }

  async function onCreateWeek(weekStart: string, title: string, copyFrom: number | null) {
    if (!outletId) return
    setBusy(true)
    try {
      const w = await managerScheduleApi.createWeek({ outletId, weekStart, title: title || undefined, copyFromWeekId: copyFrom })
      setWeeks(ws => [w, ...ws])
      setActiveWeekId(w.id)
      setShowNewWeek(false)
    } catch (e: any) { setError(e?.message ?? 'Ошибка') }
    finally { setBusy(false) }
  }

  function reloadAfterImport() {
    if (!outletId) return
    managerScheduleApi.weeks(outletId).then(w => {
      setWeeks(w)
      if (w.length > 0) {
        setActiveWeekId(w[0].id)
      }
    }).catch(() => {})
    setShowImport(false)
  }

  if (outletId === null) return <div className="muted">Нет точек</div>

  return (
    <div className="page ms">
      <div className="toolbar" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        {isAdmin && (
          <select className="select" value={outletId ?? ''} onChange={e => setOutletId(Number(e.target.value))}>
            {outlets.map(o => <option key={o.id} value={o.id}>📍 {o.name}</option>)}
          </select>
        )}
        <button className="btn" onClick={() => setShowImport(true)}>📥 Загрузить из Excel</button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="ms-weeks">
        {weeks.map(w => (
          <button key={w.id}
            className={w.id === activeWeekId ? 'ms-week-tab active' : 'ms-week-tab'}
            onClick={() => setActiveWeekId(w.id)}>
            {dm(w.weekStart)}–{dm(addDays(w.weekStart, 6))}
            {w.title && <span> · {w.title}</span>}
          </button>
        ))}
        <button className="ms-week-tab new" onClick={() => setShowNewWeek(true)}>＋ Новый лист</button>
      </div>

      {board ? (
        <ScheduleGrid board={board} busy={busy} onCellClick={(userId, date) => setPicker({ userId, date })} />
      ) : !error ? <div className="muted">Загрузка…</div> : null}

      {picker && board && (
        <CellPicker board={board} userId={picker.userId} date={picker.date} outletId={outletId!}
          onClose={() => setPicker(null)}
          onSave={entry => { setPicker(null); void onSaveEntry(entry) }} />
      )}
      {showNewWeek && (
        <NewWeekModal weeks={weeks} onClose={() => setShowNewWeek(false)} onCreate={onCreateWeek} busy={busy} />
      )}
      {showImport && (
        <ExcelImportModal outletId={outletId!} onClose={() => setShowImport(false)} onDone={reloadAfterImport} />
      )}
    </div>
  )
}

function ScheduleGrid({ board, busy, onCellClick }: {
  board: ManagerBoard; busy: boolean; onCellClick: (userId: number, date: string) => void
}) {
  const { week, entries, staff } = board
  const dates = Array.from({ length: WEEK_DAYS }, (_, i) => addDays(week.weekStart, i))
  const entryAt = (userId: number, date: string) => entries.find(e => e.userId === userId && e.date === date)
  const consecutiveShifts = (userId: number, date: string) => {
    let count = 0, d = date
    while (true) { const e = entryAt(userId, d); if (!e || e.dayOff) break; count++; d = addDays(d, -1) }
    return count
  }

  return (
    <div className={`panel table-panel${busy ? ' loading' : ''}`}>
      <div className="table-scroll">
        <table className="ms-grid">
          <thead>
            <tr>
              <th className="ms-name-col">Менеджер</th>
              {dates.map(d => (
                <th key={d} className={['Сб','Вс'].includes(dowLabel(d)) ? 'ms-day-col weekend' : 'ms-day-col'}>
                  <span className="ms-dow">{dowLabel(d)}</span>
                  <span className="ms-dm">{dm(d)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map(s => (
              <tr key={s.userId}>
                <td className="ms-name">
                  <div className="ms-fullname">{s.fullName}</div>
                  <div className="ms-job">{s.jobTitle}</div>
                </td>
                {dates.map(date => {
                  const entry = entryAt(s.userId, date)
                  const warn5 = consecutiveShifts(s.userId, date) >= 5
                  const offReq = !!(entry?.dayOff && entry.comment?.includes('**'))
                  const cls = shiftClass(entry?.shiftStart ?? null, entry?.shiftEnd ?? null, !!entry?.dayOff, offReq)
                  return (
                    <td key={date}
                      className={['ms-cell', cls, warn5 ? 'warn-5' : ''].filter(Boolean).join(' ')}
                      onClick={() => onCellClick(s.userId, date)}>
                      {entry?.dayOff ? (
                        <span className="ms-off">{offReq ? 'OFF**' : 'OFF'}</span>
                      ) : entry ? (
                        <>
                          {warn5 && <span className="ms-warn-icon" title="5+ смен подряд">⚠</span>}
                          {entry.shiftStart && <span className="ms-time">{entry.shiftStart}–{entry.shiftEnd}</span>}
                          {entry.comment && <span className="ms-comment">{entry.comment.replace('**','').trim()}</span>}
                        </>
                      ) : <span className="ms-empty-hint">+</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CellPicker({ board, userId, date, onClose, onSave }: {
  board: ManagerBoard; userId: number; date: string; outletId: number
  onClose: () => void; onSave: (e: Omit<ManagerEntry, 'id' | 'userName' | 'jobTitle'>) => void
}) {
  const existing = board.entries.find(e => e.userId === userId && e.date === date)
  const person = board.staff.find(s => s.userId === userId)
  const [shiftStart, setShiftStart] = useState(existing?.shiftStart ?? '')
  const [shiftEnd, setShiftEnd] = useState(existing?.shiftEnd ?? '')
  const [dayOff, setDayOff] = useState(existing?.dayOff ?? false)
  const [offReq, setOffReq] = useState(!!(existing?.comment?.includes('**')))
  const [comment, setComment] = useState((existing?.comment ?? '').replace('**','').trim())
  const prev = board.entries.find(e => e.userId === userId && e.date === addDays(date, -1))
  const warnRest = restWarning(prev?.shiftEnd ?? null, shiftStart || null)

  function save() {
    const finalComment = dayOff && offReq ? ('**' + (comment ? ' ' + comment.trim() : '')) : comment.trim() || null
    onSave({ userId, date, shiftStart: dayOff ? null : shiftStart || null, shiftEnd: dayOff ? null : shiftEnd || null, dayOff, comment: finalComment })
  }

  return (
    <Modal title={`${person?.fullName} · ${dowLabel(date)} ${dm(date)}`} onClose={onClose}>
      <div className="ms-picker">
        <label className="check"><input type="checkbox" checked={dayOff} onChange={e => setDayOff(e.target.checked)} /> Выходной (OFF)</label>
        {dayOff && <label className="check"><input type="checkbox" checked={offReq} onChange={e => setOffReq(e.target.checked)} /> OFF** — по запросу сотрудника</label>}
        {!dayOff && (<>
          <div className="ms-presets">
            {SHIFT_PRESETS.map(p => (
              <button key={p.label} className="btn small" onClick={() => { setShiftStart(p.start); setShiftEnd(p.end) }}>
                {p.label}<br /><span className="muted small">{p.start}–{p.end}</span>
              </button>
            ))}
          </div>
          <div className="sch-row">
            <label className="sch-inline">с <input type="time" value={shiftStart} onChange={e => setShiftStart(e.target.value)} /></label>
            <label className="sch-inline">до <input type="time" value={shiftEnd} onChange={e => setShiftEnd(e.target.value)} /></label>
          </div>
          {warnRest && <div className="sch-warn">⚠ Вчера закончил в {prev?.shiftEnd} — отдых менее 8 ч</div>}
        </>)}
        <textarea className="ms-comment-input" placeholder="Задачи на день…" value={comment} rows={3} onChange={e => setComment(e.target.value)} />
        <div className="sch-row">
          {existing && <button className="btn ghost small" onClick={() => onSave({ userId, date, shiftStart: null, shiftEnd: null, dayOff: false, comment: null })}>Очистить</button>}
          <span className="sch-spacer" />
          <button className="btn primary" onClick={save}>Сохранить</button>
        </div>
      </div>
    </Modal>
  )
}

function ExcelImportModal({ outletId, onClose, onDone }: {
  outletId: number; onClose: () => void; onDone: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [sheets, setSheets] = useState<string[]>([])
  const [sheet, setSheet] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [importError, setImportError] = useState('')

  async function onFile(f: File) {
    setFile(f); setLog([]); setImportError('')
    const fd = new FormData(); fd.append('file', f)
    try {
      const token = tokenStore.get()
      const r = await fetch(`${API}/import/sheets`, { method: 'POST', body: fd, headers: token ? { Authorization: `Bearer ${token}` } : {} })
      const names: string[] = await r.json()
      setSheets(names); setSheet(names[0] ?? '')
    } catch { setSheets([]); setSheet('') }
  }

  async function doImport() {
    if (!file) return
    setBusy(true); setLog([]); setImportError('')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('outletId', String(outletId))
    if (sheet) fd.append('sheetName', sheet)
    try {
      const token = tokenStore.get()
      const r = await fetch(`${API}/import`, { method: 'POST', body: fd, headers: token ? { Authorization: `Bearer ${token}` } : {} })
      const data = await r.json()
      setLog(data.log ?? [])
      if (data.error) setImportError(data.error)
    } catch (e: any) { setImportError(e.message) }
    finally { setBusy(false) }
  }

  return (
    <Modal title="Загрузить расписание из Excel" onClose={onClose}>
      <div className="ms-picker">
        <p style={{fontSize:13,color:'#6b7280',margin:0}}>Загрузи Excel файл расписания — все листы будут определены автоматически.</p>
        <input ref={fileRef} type="file" accept=".xlsx" style={{display:'none'}} onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
        <button className="btn" onClick={() => fileRef.current?.click()}>
          📂 {file ? file.name : 'Выбрать файл .xlsx'}
        </button>
        {sheets.length > 1 && (
          <label>
            Лист:&nbsp;
            <select className="ms-sheet-select" value={sheet} onChange={e => setSheet(e.target.value)}>
              {sheets.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        {(log.length > 0 || importError) && (
          <div className={`ms-import-log${importError ? ' has-error' : ''}`}>
            {importError && <p style={{color:'#dc2626',fontWeight:700}}>❌ {importError}</p>}
            {log.map((l, i) => <p key={i}>{l}</p>)}
          </div>
        )}
        <div className="sch-row">
          <span className="sch-spacer" />
          {log.length > 0 && !importError && <button className="btn primary" onClick={onDone}>Готово →</button>}
          {file && (log.length === 0 || importError) && (
            <button className="btn primary" disabled={busy} onClick={doImport}>
              {busy ? 'Импорт…' : '📥 Импортировать'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

function NewWeekModal({ weeks, onClose, onCreate, busy }: {
  weeks: ManagerWeek[]; onClose: () => void
  onCreate: (weekStart: string, title: string, copyFrom: number | null) => void; busy: boolean
}) {
  const [weekStart, setWeekStart] = useState(currentMonday())
  const [title, setTitle] = useState('')
  const [copyFrom, setCopyFrom] = useState<number | ''>('')
  return (
    <Modal title="Новый лист" onClose={onClose}>
      <div className="ms-picker">
        <label className="sch-inline">Неделя с (понедельник) <input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)} /></label>
        <input placeholder="Название (необязательно)" value={title} onChange={e => setTitle(e.target.value)} />
        <label>Скопировать из:
          <select className="select" value={copyFrom} onChange={e => setCopyFrom(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">— пустой лист —</option>
            {weeks.map(w => <option key={w.id} value={w.id}>{dm(w.weekStart)}–{dm(addDays(w.weekStart, 6))}{w.title ? ` · ${w.title}` : ''}</option>)}
          </select>
        </label>
        <div className="sch-row">
          <span className="sch-spacer" />
          <button className="btn primary" disabled={busy || !weekStart} onClick={() => onCreate(weekStart, title, copyFrom === '' ? null : copyFrom)}>Создать</button>
        </div>
      </div>
    </Modal>
  )
}
