import { useCallback, useEffect, useRef, useState } from 'react'
import { api, tokenStore } from '../api'
import { Modal } from '../admin/ui'
import { useAuth } from '../auth'
import type { DayPart, Outlet } from '../types'
import { scheduleApi } from '../schedule/api'
import SchedulePage from '../schedule/SchedulePage'
import { ABSENCE_LABEL, POSITION_LABEL, hhmm, limitBlocks, limitText } from '../schedule/types'
import type { Board as AutoBoard, Slot } from '../schedule/types'
import { managerScheduleApi } from './api'
import { exportManagerSchedule } from './exportManagerSchedule'
import { SHIFT_PRESETS, addDays, currentMonday, dm, dowLabel, restWarning } from './types'
import type { ManagerBoard, ManagerEntry, ManagerWeek } from './types'
import './manager-schedule.css'
import './ms-board.css'
import ShiftTimePicker from './ShiftTimePicker'

const WEEK_DAYS = 7
const MAX_SHIFTS = 5
const BASE = (import.meta.env.VITE_API_URL ?? '')
const API = `${BASE}/api/manager-schedule`

const JOB: Record<string, string> = {
  DIRECTOR: 'Директор', DEPUTY: 'Зам. менеджера', MANAGER: 'Менеджер', TRAINEE: 'Свит-менеджер (учится)',
}
const POS_CODE: Record<string, string> = { INSIDE: 'INS', PRODUCTION_MANAGER: 'K', SERVICE_MANAGER: 'C' }

type Part = 'morning' | 'midday' | 'evening' | 'night'
type View = 'time' | 'auto' | 'people' | 'absences'
const VIEWS: { id: View; icon: string; label: string }[] = [
  { id: 'time', icon: '🗓', label: 'Расписание' },
  { id: 'auto', icon: '✨', label: 'Автосборка по позициям' },
  { id: 'people', icon: '👥', label: 'Люди и лимиты' },
  { id: 'absences', icon: '🏖', label: 'Отсутствия' },
]
const PART_DP: Record<Part, DayPart | null> = { morning: 'MORNING', midday: 'MIDDLE', evening: 'EVENING', night: null }

const toMin = (t: string) => parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(3, 5) || '0', 10)

function partOf(start: string | null, end: string | null): Part | null {
  if (!start) return null
  const h = parseInt(start.slice(0, 2), 10)
  const endH = end ? parseInt(end.slice(0, 2), 10) : 0
  if (h < 5) return 'night'
  if (h >= 15 || endH >= 23 || (endH >= 0 && endH <= 3)) return 'evening'
  if (h < 10) return 'morning'
  return 'midday'
}

function hours(start: string | null, end: string | null): number {
  if (!start || !end) return 0
  return (((toMin(end) - toMin(start)) % 1440) + 1440) % 1440 / 60
}

function cellClass(e: ManagerEntry | undefined): string {
  if (!e) return 'empty'
  if (e.dayOff) return e.comment?.includes('**') ? 'off-req' : 'off'
  return partOf(e.shiftStart, e.shiftEnd) ?? 'empty'
}

/** Время смены из автосборки: утро и вечер стандартные, промеж как в штатке. */
function slotTimes(s: Slot): [string, string] {
  if (s.dayPart === 'MORNING') return ['08:00', '16:30']
  if (s.dayPart === 'EVENING') return ['16:00', '00:30']
  return [hhmm(s.startTime) || '12:00', hhmm(s.endTime) || '20:30']
}

/** Смены из автосборки, которых ещё нет в расписании. */
function pullList(board: ManagerBoard, info: AutoBoard | null): Slot[] {
  if (!info) return []
  return info.slots.filter(
    (s) => s.userId && !board.entries.some((e) => e.userId === s.userId && e.date === s.date && (e.shiftStart || e.dayOff)),
  )
}

type Warn = { key: string; kind: 'cover' | 'long' | 'rest' | 'req' | 'abs' | 'slot'; text: string; userId?: number; date?: string; n?: number }
const KIND_META: Record<Warn['kind'], string> = {
  slot: 'Позиции не закрыты', cover: 'Никого на смене', req: 'Просили не ставить', abs: 'Отпуск / больничный', long: 'Перегруз', rest: 'Мало отдыха',
}
type Req = { userId: number; name: string; days: { date: string; note: string }[] }

function buildWarnings(board: ManagerBoard, info: AutoBoard | null, dates: string[]): { warns: Warn[]; requests: Req[] } {
  const { entries, staff } = board
  const at = (u: number, d: string) => entries.find((e) => e.userId === u && e.date === d)
  const maxOf = (u: number) => info?.staff.find((s) => s.userId === u)?.maxShiftsWeek ?? MAX_SHIFTS
  const absOf = (u: number, d: string) => info?.absences.find((a) => a.userId === u && a.from <= d && a.to >= d)
  const warns: Warn[] = []

  const worked = entries.filter((e) => !e.dayOff && e.shiftStart)
  if (worked.length > 0) {
    for (const d of dates) {
      const parts = worked.filter((e) => e.date === d).map((e) => partOf(e.shiftStart, e.shiftEnd))
      if (!parts.includes('morning')) warns.push({ key: `m${d}`, kind: 'cover', text: `${dowLabel(d)} ${dm(d)} · никого на утро` })
      if (!parts.includes('evening')) warns.push({ key: `e${d}`, kind: 'cover', text: `${dowLabel(d)} ${dm(d)} · никого на вечер` })
    }
  }
  const byDay = new Map<string, string[]>()
  for (const w of info?.warnings ?? []) {
    const m = w.match(/(\d{2}\.\d{2}) · (.+?): некого поставить/)
    if (m) byDay.set(m[1], [...(byDay.get(m[1]) ?? []), m[2].replace(' · ', ' ')])
  }
  for (const d of dates) {
    const l = byDay.get(dm(d))
    if (l) warns.push({ key: `s${d}`, kind: 'slot', n: l.length, date: d, text: `${dowLabel(d)} ${dm(d)} · ${l.join(', ')}` })
  }
  for (const s of staff) {
    let run = 0, runStart = dates[0], total = 0, maxRun = 0, maxStart = dates[0]
    const max = maxOf(s.userId)
    for (const d of dates) {
      const e = at(s.userId, d)
      if (e && !e.dayOff && e.shiftStart) {
        if (run === 0) runStart = d
        run++; total++
        if (run > maxRun) { maxRun = run; maxStart = runStart }
        const ab = absOf(s.userId, d)
        if (ab) warns.push({ key: `a${s.userId}${d}`, kind: 'abs', userId: s.userId, date: d, text: `${s.fullName} · ${dowLabel(d)} ${dm(d)} · ${ABSENCE_LABEL[ab.kind]}, а смена стоит` })
        const dp = PART_DP[partOf(e.shiftStart, e.shiftEnd) ?? 'night']
        const lim = dp ? info?.limits.find((l) => l.userId === s.userId && limitBlocks(l, d, dp)) : undefined
        if (lim) warns.push({ key: `q${s.userId}${d}`, kind: 'req', userId: s.userId, date: d, text: `${s.fullName} · ${dowLabel(d)} ${dm(d)} · 🙅 просил не ставить: ${limitText(lim)}` })
      } else run = 0
    }
    if (maxRun >= MAX_SHIFTS && maxRun > max) warns.push({ key: `l${s.userId}`, kind: 'long', userId: s.userId, date: maxStart, text: `${s.fullName} · ${maxRun} смен подряд с ${dm(maxStart)}` })
    else if (total > max) warns.push({ key: `t${s.userId}`, kind: 'long', userId: s.userId, date: dates[0], text: `${s.fullName} · ${total} смен за неделю, а лимит ${max}` })
    else if (maxRun >= MAX_SHIFTS) warns.push({ key: `l${s.userId}`, kind: 'long', userId: s.userId, date: maxStart, text: `${s.fullName} · ${maxRun} смен подряд с ${dm(maxStart)}` })
    for (let i = 1; i < dates.length; i++) {
      const p = at(s.userId, dates[i - 1]), c = at(s.userId, dates[i])
      if (p && c && !p.dayOff && !c.dayOff && p.shiftEnd && c.shiftStart && restWarning(p.shiftEnd, c.shiftStart))
        warns.push({ key: `r${s.userId}${dates[i]}`, kind: 'rest', userId: s.userId, date: dates[i], text: `${s.fullName} · ${dowLabel(dates[i])} ${dm(dates[i])} · отдых меньше 8 ч (вчера до ${p.shiftEnd})` })
    }
  }

  // «Просил выходной»: из OFF** в клетках и из пожеланий сотрудника («Мой график»)
  const requests: Req[] = []
  for (const s of staff) {
    const days = new Map<string, string>()
    for (const d of dates) {
      const e = at(s.userId, d)
      if (e?.dayOff && e.comment?.includes('**')) days.set(d, e.comment.replace('**', '').trim())
      const lim = info?.limits.find((l) => l.userId === s.userId && (limitBlocks(l, d, 'MORNING') || limitBlocks(l, d, 'EVENING') || limitBlocks(l, d, 'MIDDLE')))
      if (lim && !days.has(d)) days.set(d, lim.note ?? '')
    }
    if (days.size) requests.push({ userId: s.userId, name: s.fullName, days: [...days].map(([date, note]) => ({ date, note })) })
  }
  return { warns, requests }
}

const pickSlot = (info: AutoBoard | null, userId: number, date: string) => info?.slots.find(s => s.userId === userId && s.date === date)

/** Причины ⚠ для клетки: замечания, просьбы «не ставить», отпуск. */
function pickNotes(board: ManagerBoard, info: AutoBoard | null, userId: number, date: string): string[] {
  const dates = Array.from({ length: WEEK_DAYS }, (_, i) => addDays(board.week.weekStart, i))
  const out = buildWarnings(board, info, dates).warns.filter(w => w.userId === userId && w.date === date).map(w => w.text)
  for (const l of info?.limits ?? []) {
    if (l.userId === userId && (limitBlocks(l, date, 'MORNING') || limitBlocks(l, date, 'EVENING') || limitBlocks(l, date, 'MIDDLE')))
      out.push(`🙅 просил не ставить: ${limitText(l)}`)
  }
  const ab = info?.absences.find(a => a.userId === userId && a.from <= date && a.to >= date)
  if (ab) out.push(ABSENCE_LABEL[ab.kind])
  return [...new Set(out)]
}

export default function ManagerSchedulePage() {
  const { user } = useAuth()
  const isAdmin = user?.accountRole === 'SUPER_ADMIN'
  const [outlets, setOutlets] = useState<Outlet[]>(isAdmin ? [] : (user?.outlets ?? []))
  const [outletId, setOutletId] = useState<number | null>(isAdmin ? null : (user?.outlets[0]?.id ?? null))
  const [weeks, setWeeks] = useState<ManagerWeek[]>([])
  const [activeWeekId, setActiveWeekId] = useState<number | null>(null)
  const [board, setBoard] = useState<ManagerBoard | null>(null)
  const [info, setInfo] = useState<AutoBoard | null>(null)
  const [infoKey, setInfoKey] = useState(0)
  const [view, setView] = useState<View>('time')
  const [busy, setBusy] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [picker, setPicker] = useState<{ userId: number; date: string } | null>(null)
  const [showNewWeek, setShowNewWeek] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportMenu, setExportMenu] = useState(false)

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

  const reloadBoard = useCallback(() => {
    if (!activeWeekId) return
    managerScheduleApi.board(activeWeekId).then(setBoard).catch(() => setError('Ошибка загрузки'))
  }, [activeWeekId])

  useEffect(() => {
    if (!activeWeekId) return
    setBoard(null)
    reloadBoard()
  }, [activeWeekId, reloadBoard])

  const weekStart = weeks.find(w => w.id === activeWeekId)?.weekStart ?? null

  /** Выгрузка в Excel: только эта неделя или все недели (по листу на неделю, как в вашем файле). */
  async function exportExcel(all: boolean) {
    setError('')
    setExporting(true)
    try {
      const ids = all ? [...weeks].sort((x, y) => x.weekStart.localeCompare(y.weekStart)).map(w => w.id) : activeWeekId ? [activeWeekId] : []
      const boards = await Promise.all(ids.map(id => (id === activeWeekId && board ? Promise.resolve(board) : managerScheduleApi.board(id))))
      const name = outlets.find(o => o.id === outletId)?.name ?? 'Менеджеры'
      await exportManagerSchedule(boards, `Расписание менеджеров ${name}${all ? '' : ` ${weekStart ? dm(weekStart) : ''}`}.xlsx`)
    } catch {
      setError('Не удалось сформировать Excel')
    } finally {
      setExporting(false)
    }
  }

  // позиции, лимиты «не могу», отпуска: из автосборки, за ту же неделю
  useEffect(() => {
    if (outletId === null || !weekStart) return
    let off = false
    scheduleApi.board(outletId, weekStart, addDays(weekStart, 6))
      .then(b => { if (!off) setInfo(b) })
      .catch(() => { if (!off) setInfo(null) })
    return () => { off = true }
  }, [outletId, weekStart, infoKey])

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

  /** Перенести смены из автосборки в расписание: утро 08:00–16:30, вечер 16:00–00:30, промеж как в штатке; в комментарий кладём позицию. */
  async function pull() {
    if (!board || !outletId) return
    const todo = pullList(board, info)
    if (!todo.length) return
    if (!confirm(`Перенести ${todo.length} смен из автосборки в расписание?\nВремя: утро 08:00–16:30, вечер 16:00–00:30, промеж как в штатке. Позиция попадёт в комментарий (INS, K, C). Уже заполненные клетки не трогаем.`)) return
    setPulling(true); setError(''); setMsg('')
    try {
      for (const s of todo) {
        const [a, b] = slotTimes(s)
        await managerScheduleApi.saveEntry({
          weekId: board.week.id, outletId, userId: s.userId as number, date: s.date,
          shiftStart: a, shiftEnd: b, dayOff: false, comment: POS_CODE[s.role] ?? null,
        })
      }
      reloadBoard()
      setMsg(`Перенесено смен: ${todo.length}. Время можно поправить в любой клетке.`)
    } catch { setError('Не получилось перенести часть смен') }
    finally { setPulling(false) }
  }

  function reloadAfterImport() {
    if (!outletId) return
    managerScheduleApi.weeks(outletId).then(w => {
      setWeeks(w)
      if (w.length > 0) setActiveWeekId(w[0].id)
    }).catch(() => {})
    setShowImport(false)
  }

  if (outletId === null) return <div className="muted">Нет точек</div>

  return (
    <div className="page ms mb">
      <div className="mb-bar">
        <div className="mb-bar-top">
          {outlets.length > 1 ? (
            <div className="mb-pill">
              <span>📍</span>
              <select value={outletId ?? ''} onChange={e => setOutletId(Number(e.target.value))}>
                {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          ) : <span />}
          <div className="mb-actions">
            <button className="mb-btn" onClick={() => setShowImport(true)}>📥 Загрузить из Excel</button>
            <div className="mb-menu">
              <button className="mb-btn" disabled={exporting || weeks.length === 0} onClick={() => setExportMenu(o => !o)}>
                {exporting ? 'Готовим файл…' : '⬇ Выгрузить в Excel ▾'}
              </button>
              {exportMenu && (
                <>
                  <div className="mb-menu-back" onClick={() => setExportMenu(false)} />
                  <div className="mb-menu-list">
                    <button disabled={!activeWeekId} onClick={() => { setExportMenu(false); void exportExcel(false) }}>
                      <b>Эта неделя</b><small>один лист</small>
                    </button>
                    <button onClick={() => { setExportMenu(false); void exportExcel(true) }}>
                      <b>Все недели</b><small>по листу на неделю</small>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="mb-weeks">
          {weeks.map(w => {
            const range = `${dm(w.weekStart)}–${dm(addDays(w.weekStart, 6))}`
            // подпись недели показываем, только если это не те же даты
            const title = w.title && !/^\d{2}\.\d{2}\s*[-–]\s*\d{2}\.\d{2}$/.test(w.title.trim()) ? w.title : ''
            return (
              <button key={w.id} className={w.id === activeWeekId ? 'mb-week on' : 'mb-week'} onClick={() => setActiveWeekId(w.id)}>
                {range}{title ? <i> · {title}</i> : null}
              </button>
            )
          })}
          <button className="mb-week new" onClick={() => setShowNewWeek(true)}>＋ Новая неделя</button>
        </div>
      </div>

      <div className="mb-views" role="tablist">
        {VIEWS.map(v => (
          <button key={v.id} role="tab" aria-selected={view === v.id} className={view === v.id ? 'mb-view on' : 'mb-view'} onClick={() => setView(v.id)}>
            <span>{v.icon}</span>{v.label}
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}
      {msg && <div className="mb-ok">{msg}</div>}

      {view === 'time' && (board ? (
        <Board board={board} info={info} busy={busy} pulling={pulling} onPull={() => void pull()} onAuto={() => setView('auto')} onCell={(userId, date) => setPicker({ userId, date })} />
      ) : !error ? <div className="muted">Загрузка…</div> : null)}

      {view !== 'time' && (weekStart ? (
        <SchedulePage key={view} outletId={outletId} weekStart={weekStart}
          view={view === 'auto' ? 'grid' : view === 'people' ? 'staff' : 'absences'}
          onChanged={() => setInfoKey(k => k + 1)} />
      ) : <div className="muted">Сначала создайте неделю.</div>)}

      {picker && board && (
        <CellPicker board={board} userId={picker.userId} date={picker.date} outletId={outletId!}
          notes={pickNotes(board, info, picker.userId, picker.date)}
          position={pickSlot(info, picker.userId, picker.date) ? POSITION_LABEL[pickSlot(info, picker.userId, picker.date)!.role] : null}
          posCode={POS_CODE[pickSlot(info, picker.userId, picker.date)?.role ?? ''] ?? ''}
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

function Board({ board, info, busy, pulling, onPull, onAuto, onCell }: {
  board: ManagerBoard; info: AutoBoard | null; busy: boolean; pulling: boolean
  onPull: () => void; onAuto: () => void; onCell: (userId: number, date: string) => void
}) {
  const { week, entries, staff } = board
  const dates = Array.from({ length: WEEK_DAYS }, (_, i) => addDays(week.weekStart, i))
  const [openKind, setOpenKind] = useState<string | null>(null)
  const entryAt = (userId: number, date: string) => entries.find(e => e.userId === userId && e.date === date)
  const slotAt = (userId: number, date: string) => info?.slots.find(s => s.userId === userId && s.date === date)
  const absAt = (userId: number, date: string) => info?.absences.find(a => a.userId === userId && a.from <= date && a.to >= date)
  const maxOf = (userId: number) => info?.staff.find(s => s.userId === userId)?.maxShiftsWeek ?? MAX_SHIFTS
  const limAt = (userId: number, date: string, part: DayPart | null) =>
    info?.limits.find(l => l.userId === userId && (part ? limitBlocks(l, date, part) : limitBlocks(l, date, 'MORNING') && limitBlocks(l, date, 'EVENING')))
  const { warns, requests } = buildWarnings(board, info, dates)
  const canIns = (u: number) => info?.staff.find(x => x.userId === u)?.canInside === true
  const groupedStaff = [
    { id: 'dir', title: 'Директор', items: staff.filter(x => x.jobTitle === 'DIRECTOR') },
    { id: 'dep', title: 'Замы', items: staff.filter(x => x.jobTitle === 'DEPUTY') },
    { id: 'ins', title: 'Менеджеры · могут быть инсайдом', items: staff.filter(x => x.jobTitle === 'MANAGER' && canIns(x.userId)) },
    { id: 'mgr', title: 'Менеджеры', items: staff.filter(x => x.jobTitle === 'MANAGER' && !canIns(x.userId)) },
    { id: 'sw', title: 'Свит-менеджеры', items: staff.filter(x => x.jobTitle === 'TRAINEE') },
    { id: 'oth', title: 'Другие', items: staff.filter(x => !['DIRECTOR', 'DEPUTY', 'MANAGER', 'TRAINEE'].includes(x.jobTitle)) },
  ].filter(g => g.items.length > 0)
  const kinds = (Object.keys(KIND_META) as Warn['kind'][]).map(k => ({ k, items: warns.filter(w => w.kind === k) })).filter(g => g.items.length)
  const cnt = (items: Warn[]) => items.reduce((a, w) => a + (w.n ?? 1), 0)
  const att = kinds.reduce((a, g) => a + cnt(g.items), 0)
  const toPull = pullList(board, info).length
  const reqTotal = requests.reduce((a, r) => a + r.days.length, 0)
  const gapDay = new Set(warns.filter(w => (w.kind === 'cover' || w.kind === 'slot') && w.date).map(w => w.date))
  const slotGap = new Map(warns.filter(w => w.kind === 'slot').map(w => [w.date, w]))
  const cellWarns = (userId: number, date: string) => warns.filter(w => w.userId === userId && w.date === date)

  const perDay = dates.map(d => {
    const parts = entries.filter(e => e.date === d && !e.dayOff && e.shiftStart).map(e => partOf(e.shiftStart, e.shiftEnd))
    return { m: parts.filter(p => p === 'morning').length, md: parts.filter(p => p === 'midday').length, e: parts.filter(p => p === 'evening').length }
  })
  const shiftsTotal = entries.filter(e => !e.dayOff && e.shiftStart).length
  const offTotal = entries.filter(e => e.dayOff).length
  const shown = kinds.find(g => g.k === openKind)

  return (
    <div className={busy ? 'mb-wrap loading' : 'mb-wrap'}>
      <div className="mb-strip">
        <span className="mb-stat"><b>{shiftsTotal}</b> смен</span>
        <span className="mb-stat"><b>{offTotal}</b> выходных</span>
        <span className="mb-sep" />
        {att === 0 ? <span className="mb-good">✓ Замечаний нет</span> : kinds.map(g => (
          <button key={g.k} className={`mb-gchip ${g.k}${openKind === g.k ? ' on' : ''}`} onClick={() => setOpenKind(openKind === g.k ? null : g.k)}>
            {KIND_META[g.k]} <b>{cnt(g.items)}</b>
          </button>
        ))}
        {reqTotal > 0 && (
          <button className={`mb-gchip asks${openKind === 'asks' ? ' on' : ''}`} onClick={() => setOpenKind(openKind === 'asks' ? null : 'asks')}>
            🙅 Просьбы <b>{reqTotal}</b>
          </button>
        )}
        <span className="mb-grow" />
        {toPull > 0 && (
          <button className="mb-btn primary sm" disabled={pulling} onClick={onPull} title="Перенести смены из автосборки в расписание">
            {pulling ? 'Переношу…' : `⬇ Взять из автосборки (${toPull})`}
          </button>
        )}
      </div>

      {openKind === 'asks' && (
        <div className="mb-gbody">
          {requests.map(r => (
            <div key={r.userId} className="mb-req-row">
              <b>{r.name}</b>
              {r.days.map(d => (
                <button key={d.date} className="mb-chip" onClick={() => onCell(r.userId, d.date)}>
                  {dowLabel(d.date)} {dm(d.date)}{d.note ? ` · ${d.note}` : ''}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {shown && (
        <div className="mb-gbody">
          {shown.items.map(w => (
            <button key={w.key} className={`mb-warn ${w.kind}`}
              onClick={() => (w.userId && w.date ? onCell(w.userId, w.date) : w.kind === 'slot' ? onAuto() : undefined)}>{w.text}</button>
          ))}
        </div>
      )}

      <div className="mb-tablewrap">
        <table className="mb-grid">
          <thead>
            <tr>
              <th className="mb-name-h">Менеджер</th>
              {dates.map(d => (
                <th key={d} className={['Сб', 'Вс'].includes(dowLabel(d)) ? 'weekend' : ''}>
                  <span className="mb-dow">{dowLabel(d)}</span>
                  <span className="mb-dm">{dm(d)}{gapDay.has(d) && <i className="mb-dot" title="Есть незакрытые смены или позиции" />}</span>
                </th>
              ))}
              <th className="mb-sum-h">Итого</th>
            </tr>
          </thead>
          <tbody>
            {groupedStaff.flatMap(g => [
              <tr key={`g-${g.id}`} className="mb-group"><td colSpan={WEEK_DAYS + 2}>{g.title}<i>{g.items.length}</i></td></tr>,
              ...g.items.map(s => {
              const mine = dates.map(d => entryAt(s.userId, d))
              const shifts = mine.filter(e => e && !e.dayOff && e.shiftStart)
              const hrs = shifts.reduce((a, e) => a + hours(e!.shiftStart, e!.shiftEnd), 0)
              const offs = mine.filter(e => e?.dayOff).length
              const max = maxOf(s.userId)
              const mineWarns = warns.filter(w => w.userId === s.userId)
              return (
                <tr key={s.userId}>
                  <td className="mb-name">
                    <div className="mb-fullname">{s.fullName}{mineWarns.length > 0 && <span className="mb-wbadge" title={mineWarns.map(w => w.text).join('\n')}>⚠ {mineWarns.length}</span>}</div>
                    <div className="mb-job">{JOB[s.jobTitle] ?? s.jobTitle}</div>
                  </td>
                  {dates.map((date, i) => {
                    const entry = mine[i]
                    let run = 0
                    for (let k = i; k >= 0; k--) { const e = mine[k]; if (!e || e.dayOff || !e.shiftStart) break; run++ }
                    const hasShift = !!(entry && !entry.dayOff && entry.shiftStart)
                    const part = hasShift ? partOf(entry!.shiftStart, entry!.shiftEnd) : null
                    const dp = part ? PART_DP[part] : null
                    const absn = absAt(s.userId, date)
                    const slot = slotAt(s.userId, date)
                    const shiftLim = dp ? limAt(s.userId, date, dp) : undefined
                    const dayReq = !entry ? limAt(s.userId, date, null) : undefined
                    const offReq = !!(entry?.dayOff && entry.comment?.includes('**'))
                    const cw = cellWarns(s.userId, date)
                    let cls = cellClass(entry)
                    if (!entry && absn) cls = 'abs'
                    else if (!entry && dayReq) cls = 'ask'
                    else if (!entry && slot) cls = 'ghost'
                    if (hasShift && absn) cls += ' bad'
                    else if (shiftLim) cls += ' lim'
                    else if (cw.some(w => w.kind === 'rest')) cls += ' rest'
                    if (run >= MAX_SHIFTS || (hasShift && shifts.length > max && run >= max)) cls += ' warn'
                    const cm = entry?.comment?.replace('**', '').trim() ?? ''
                    const showCm = cm && !(slot && cm === POS_CODE[slot.role])
                    return (
                      <td key={date} className={`mb-cell ${cls}`} onClick={() => onCell(s.userId, date)}
                        title={[...cw.map(w => w.text), cm].filter(Boolean).join('\n') || undefined}>
                        {cw.length > 0 && <i className="mb-flag">⚠</i>}
                        {entry?.dayOff ? (
                          <span className="mb-off">{offReq ? 'Просил вых.' : 'Выходной'}</span>
                        ) : entry ? (
                          <>
                            {entry.shiftStart && <span className="mb-time">{entry.shiftStart}–{entry.shiftEnd}</span>}
                            {slot && <span className="mb-pos">{POSITION_LABEL[slot.role]}</span>}
                            {showCm && <span className="mb-cm">{cm}</span>}
                          </>
                        ) : absn ? (
                          <span className="mb-abs">{ABSENCE_LABEL[absn.kind]}</span>
                        ) : dayReq ? (
                          <span className="mb-ask" title={limitText(dayReq)}>🙅 просит вых.</span>
                        ) : slot ? (
                          <span className="mb-ghost">{slot.dayPart === 'MORNING' ? 'Утро' : slot.dayPart === 'EVENING' ? 'Вечер' : 'Промеж'} · {POSITION_LABEL[slot.role]}</span>
                        ) : <span className="mb-plus">+</span>}
                      </td>
                    )
                  })}
                  <td className="mb-sum">
                    <span className={shifts.length > max ? 'mb-badge bad' : 'mb-badge'}>{shifts.length}/{max}</span>
                    <span className="mb-h">{Math.round(hrs)} ч · {offs} вых</span>
                  </td>
                </tr>
              )
            })])}
          </tbody>
          <tfoot>
            <tr>
              <td className="mb-name"><div className="mb-fullname">На смене</div><div className="mb-job">утро · день · вечер</div></td>
              {perDay.map((p, i) => (
                <td key={i} className="mb-foot">
                  <span className={p.m ? 'c m' : 'c z'}>{p.m}</span>
                  <span className={p.md ? 'c d' : 'c z'}>{p.md}</span>
                  <span className={p.e ? 'c e' : 'c z'}>{p.e}</span>
                </td>
              ))}
              <td />
            </tr>
            {slotGap.size > 0 && (
              <tr>
                <td className="mb-name"><div className="mb-fullname">Не закрыто</div><div className="mb-job">позиции автосборки</div></td>
                {dates.map(d => {
                  const g = slotGap.get(d)
                  return (
                    <td key={d} className="mb-foot">
                      {g ? <button className="mb-gap" title={g.text} onClick={onAuto}>⚠ {g.n}</button> : <span className="c ok">✓</span>}
                    </td>
                  )
                })}
                <td />
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      <div className="mb-legend">
        <span><i className="morning" />Утро</span><span><i className="midday" />День / промеж</span>
        <span><i className="evening" />Вечер</span><span><i className="night" />Ночь</span>
        <span><i className="off" />Выходной</span><span><i className="off-req" />Просил выходной</span>
        <span><i className="ghost" />Только позиция</span>
        <span className="mb-tip">⚠ в углу клетки: наведите, чтобы увидеть причину.</span>
      </div>
    </div>
  )
}

function CellPicker({ board, userId, date, notes, position, posCode, onClose, onSave }: {
  board: ManagerBoard; userId: number; date: string; outletId: number
  notes: string[]; position: string | null; posCode: string
  onClose: () => void; onSave: (e: Omit<ManagerEntry, 'id' | 'userName' | 'jobTitle'>) => void
}) {
  const existing = board.entries.find(e => e.userId === userId && e.date === date)
  const person = board.staff.find(s => s.userId === userId)
  const [shiftStart, setShiftStart] = useState(existing?.shiftStart ?? '')
  const [shiftEnd, setShiftEnd] = useState(existing?.shiftEnd ?? '')
  const [dayOff, setDayOff] = useState(existing?.dayOff ?? false)
  const [offReq, setOffReq] = useState(!!(existing?.comment?.includes('**')))
  const [comment, setComment] = useState((existing?.comment ?? '').replace('**','').trim() || (position ? posCode : ''))
  const prev = board.entries.find(e => e.userId === userId && e.date === addDays(date, -1))
  const warnRest = restWarning(prev?.shiftEnd ?? null, shiftStart || null)

  function save() {
    const finalComment = dayOff && offReq ? ('**' + (comment ? ' ' + comment.trim() : '')) : comment.trim() || null
    onSave({ userId, date, shiftStart: dayOff ? null : shiftStart || null, shiftEnd: dayOff ? null : shiftEnd || null, dayOff, comment: finalComment })
  }

  return (
    <Modal title={`${person?.fullName} · ${dowLabel(date)} ${dm(date)}`} onClose={onClose}>
      <div className="ms-picker">
        {notes.length > 0 && <div className="mb-notes">{notes.map(n => <div key={n}>⚠ {n}</div>)}</div>}
        {position && <div className="mb-posline">Позиция в автосборке: <b>{position}</b></div>}
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
          <ShiftTimePicker start={shiftStart} end={shiftEnd} onChange={(s, e) => { setShiftStart(s); setShiftEnd(e) }} />
          {warnRest && <div className="sch-warn">⚠ Вчера закончил в {prev?.shiftEnd} — отдых менее 8 ч</div>}
        </>)}
        <textarea className="ms-comment-input" placeholder="Задачи на день…" value={comment} rows={4} onChange={e => setComment(e.target.value)} />
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