import { useEffect, useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import { api } from '../api'
import { Modal, errorText } from '../admin/ui'
import { useAuth } from '../auth'
import type { DayPart, Outlet, ShiftRole } from '../types'
import { scheduleApi } from './api'
import { ABSENCE_LABEL, JOB_LABEL, POSITION_LABEL, POSITIONS } from './types'
import type { AbsenceKind, Board, JobTitle, Slot, SlotRef, Staff } from './types'
import { exportSchedule } from './xlsx'
import './schedule.css'

const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const PARTS: DayPart[] = ['MORNING', 'EVENING']
const PERIODS = [
  { days: 7, label: '7 дней' },
  { days: 14, label: '14 дней' },
  { days: 30, label: 'Месяц' },
]
const PRESETS: { label: string; m: ShiftRole[]; e: ShiftRole[] }[] = [
  { label: '☀️ Лето: 3 + 3', m: [...POSITIONS], e: [...POSITIONS] },
  { label: '🍂 Сейчас: 2 + 2', m: ['INSIDE', 'SERVICE_MANAGER'], e: ['INSIDE', 'SERVICE_MANAGER'] },
]

const iso = (d: Date) => d.toLocaleDateString('en-CA')
const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T12:00:00`)
  d.setDate(d.getDate() + n)
  return iso(d)
}
const dm = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}`
const dow = (s: string) => DOW[new Date(`${s}T12:00:00`).getDay()]
const sameRef = (a: SlotRef, b: SlotRef) => a.date === b.date && a.dayPart === b.dayPart && a.role === b.role

type Tab = 'grid' | 'staff' | 'absences'

export default function SchedulePage() {
  const { user } = useAuth()
  const isAdmin = user?.accountRole === 'SUPER_ADMIN'
  const [outlets, setOutlets] = useState<Outlet[]>(isAdmin ? [] : (user?.outlets ?? []))
  const [outletId, setOutletId] = useState<number | null>(isAdmin ? null : (user?.outlets[0]?.id ?? null))
  const [tab, setTab] = useState<Tab>('grid')
  const [from, setFrom] = useState(() => iso(new Date()))
  const [days, setDays] = useState(7)
  const [board, setBoard] = useState<Board | null>(null)
  const [plan, setPlan] = useState<{ m: ShiftRole[]; e: ShiftRole[] } | null>(null)
  const [keepFilled, setKeepFilled] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [picker, setPicker] = useState<SlotRef | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const to = addDays(from, days - 1)

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    api
      .adminOutlets()
      .then((o) => {
        if (cancelled) return
        setOutlets(o)
        setOutletId((cur) => cur ?? o[0]?.id ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isAdmin])

  useEffect(() => {
    if (outletId === null) return
    let cancelled = false
    scheduleApi
      .board(outletId, from, to)
      .then((b) => {
        if (cancelled) return
        setBoard(b)
        setPlan((p) => p ?? { m: b.morning, e: b.evening })
        setError('')
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err))
      })
    return () => {
      cancelled = true
    }
  }, [outletId, from, to, reloadKey])

  const reload = () => setReloadKey((k) => k + 1)

  async function run(action: () => Promise<{ warnings?: string[] } | unknown>, ok?: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await action()
      const warns = (res as { warnings?: string[] } | undefined)?.warnings ?? []
      if (warns.length) setNotice('⚠ ' + warns.join(' · '))
      else if (ok) setNotice(ok)
      reload()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const dates = useMemo(() => Array.from({ length: days }, (_, i) => addDays(from, i)), [from, days])

  if (outletId === null) return <div className="muted">Нет точек для графика</div>
  if (!board || !plan) return error ? <div className="error">{error}</div> : <div className="muted">Загрузка…</div>

  const b = board
  const cols = (part: DayPart) => {
    const planned = part === 'MORNING' ? plan.m : plan.e
    const used = b.slots.filter((s) => s.dayPart === part && s.userId).map((s) => s.role)
    return POSITIONS.filter((r) => planned.includes(r) || used.includes(r))
  }
  const slotAt = (ref: SlotRef) => b.slots.find((s) => sameRef(s, ref))
  const absentNames = (d: string) =>
    b.absences.filter((a) => a.from <= d && a.to >= d).map((a) => `${a.userName} ${ABSENCE_LABEL[a.kind].split(' ')[0]}`)
  const drafts = b.slots.filter((s) => s.userId && !s.published).length

  function togglePlan(part: 'm' | 'e', role: ShiftRole) {
    setPlan((p) => {
      if (!p) return p
      const list = p[part].includes(role) ? p[part].filter((r) => r !== role) : [...p[part], role]
      return { ...p, [part]: POSITIONS.filter((r) => list.includes(r)) }
    })
  }

  function generate() {
    if (!plan || !plan.m.length || !plan.e.length) return setError('Выбери хотя бы одну роль на утро и на вечер')
    if (!keepFilled && !confirm('Перезаписать неопубликованные клетки этого периода?')) return
    void run(
      () => scheduleApi.generate({ outletId: b.outletId, from, days, morning: plan.m, evening: plan.e, keepFilled }),
      '✨ График сгенерирован. Проверь и нажми «Опубликовать»',
    )
  }

  function publish() {
    if (!confirm(`Опубликовать график ${dm(from)}–${dm(to)}? Сотрудники получат уведомление.`)) return
    void run(() => scheduleApi.publish(b.outletId, from, to), '📢 Опубликовано, сотрудники получили уведомление')
  }

  function onDrop(e: DragEvent, target: SlotRef) {
    e.preventDefault()
    const raw = e.dataTransfer.getData('text/plain')
    if (!raw) return
    const source = JSON.parse(raw) as SlotRef
    if (sameRef(source, target)) return
    void run(() => scheduleApi.swap(b.outletId, source, target))
  }

  return (
    <div className="page sch">
      <div className="toolbar">
        {isAdmin && (
          <select className="select" value={outletId} onChange={(e) => setOutletId(Number(e.target.value))}>
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>
                📍 {o.name}
              </option>
            ))}
          </select>
        )}
        <div className="filter-tabs">
          {(
            [
              ['grid', '🗓 График'],
              ['staff', '👥 Сотрудники'],
              ['absences', '🏖 Отсутствия'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} className={tab === id ? 'tab active' : 'tab'} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <div className="sch-notice">{notice}</div>}

      {tab === 'grid' && (
        <>
          <div className="panel sch-controls">
            <div className="sch-row">
              <label className="sch-inline">
                С
                <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
              </label>
              <div className="filter-tabs">
                {PERIODS.map((p) => (
                  <button key={p.days} className={days === p.days ? 'tab active' : 'tab'} onClick={() => setDays(p.days)}>
                    {p.label}
                  </button>
                ))}
              </div>
              <span className="muted small">
                {dm(from)}–{dm(to)}
              </span>
            </div>

            <div className="sch-row">
              {PRESETS.map((p) => (
                <button key={p.label} className="btn small" onClick={() => setPlan({ m: p.m, e: p.e })}>
                  {p.label}
                </button>
              ))}
            </div>

            <div className="sch-plan">
              {(['m', 'e'] as const).map((part) => (
                <div key={part} className="sch-plan-part">
                  <b>{part === 'm' ? '🌅 Утро' : '🌙 Вечер'}:</b>
                  {POSITIONS.map((r) => (
                    <label key={r} className="check">
                      <input type="checkbox" checked={plan[part].includes(r)} onChange={() => togglePlan(part, r)} />
                      {POSITION_LABEL[r]}
                    </label>
                  ))}
                </div>
              ))}
            </div>

            <div className="sch-row">
              <label className="check">
                <input type="checkbox" checked={keepFilled} onChange={(e) => setKeepFilled(e.target.checked)} />
                Не трогать уже заполненное
              </label>
              <span className="sch-spacer" />
              <button className="btn primary" disabled={busy} onClick={generate}>
                ✨ Сгенерировать
              </button>
              <button className="btn" disabled={busy || drafts === 0} onClick={publish}>
                📢 Опубликовать{drafts ? ` (${drafts})` : ''}
              </button>
              <button className="btn ghost" onClick={() => void exportSchedule(b, cols('MORNING'), cols('EVENING'))}>
                ⬇ Excel
              </button>
            </div>
          </div>

          {b.warnings.length > 0 && (
            <details className="sch-warnings">
              <summary>⚠ Пустых клеток: {b.warnings.length}</summary>
              <ul>
                {b.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="panel table-panel">
            <div className="table-scroll">
              <table className="sch-grid">
                <thead>
                  <tr>
                    <th rowSpan={2}>Дата</th>
                    {PARTS.map((part) => (
                      <th key={part} colSpan={Math.max(1, cols(part).length)} className={`sch-part ${part.toLowerCase()}`}>
                        {part === 'MORNING' ? '🌅 Утро' : '🌙 Вечер'}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {PARTS.flatMap((part) =>
                      cols(part).map((r) => (
                        <th key={`${part}${r}`} className="sch-role">
                          {POSITION_LABEL[r]}
                        </th>
                      )),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {dates.map((d) => {
                    const away = absentNames(d)
                    const weekend = ['Сб', 'Вс'].includes(dow(d))
                    return (
                      <tr key={d}>
                        <td className={weekend ? 'sch-date weekend' : 'sch-date'}>
                          <b>{dow(d)}</b> {dm(d)}
                          {away.length > 0 && <div className="sch-away">{away.join(', ')}</div>}
                        </td>
                        {PARTS.flatMap((part) =>
                          cols(part).map((role) => {
                            const ref = { date: d, dayPart: part, role }
                            const s = slotAt(ref)
                            const planned = (part === 'MORNING' ? plan.m : plan.e).includes(role)
                            return (
                              <td
                                key={`${part}${role}`}
                                className={s?.userId ? 'sch-cell' : planned ? 'sch-cell empty' : 'sch-cell off'}
                                onClick={() => setPicker(ref)}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => onDrop(e, ref)}
                              >
                                {s?.userId ? (
                                  <span
                                    className={s.published ? 'sch-chip' : 'sch-chip draft'}
                                    draggable
                                    onDragStart={(e) => e.dataTransfer.setData('text/plain', JSON.stringify(ref))}
                                    title={s.published ? 'Опубликовано' : 'Черновик: ещё не опубликовано'}
                                  >
                                    {s.userName}
                                  </span>
                                ) : planned ? (
                                  <span className="sch-hole">⚠ пусто</span>
                                ) : (
                                  <span className="muted">—</span>
                                )}
                              </td>
                            )
                          }),
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="muted small">
            Клик по клетке открывает выбор человека. На компьютере имя можно перетащить в другую клетку (обмен). Пунктирная рамка
            означает черновик: его видят только директор и суперадмин, пока не нажата «Опубликовать».
          </p>

          <StatsTable board={b} />
        </>
      )}

      {tab === 'staff' && <StaffTab board={b} onSaved={reload} />}
      {tab === 'absences' && <AbsencesTab board={b} onSaved={reload} />}

      {picker && (
        <Picker
          board={b}
          target={picker}
          current={slotAt(picker)}
          onClose={() => setPicker(null)}
          onPick={(userId) => {
            const target = picker
            setPicker(null)
            void run(() => scheduleApi.setSlot({ outletId: b.outletId, ...target, userId }))
          }}
        />
      )}
    </div>
  )
}

// ================= выбор человека в клетку =================

function Picker({
  board,
  target,
  current,
  onClose,
  onPick,
}: {
  board: Board
  target: SlotRef
  current: Slot | undefined
  onClose: () => void
  onPick: (userId: number | null) => void
}) {
  const prevDay = addDays(target.date, -1)
  const nextDay = addDays(target.date, 1)

  const rows = board.staff.map((s) => {
    const absence = board.absences.find((a) => a.userId === s.userId && a.from <= target.date && a.to >= target.date)
    const sameDay = board.slots.find(
      (x) => x.userId === s.userId && x.date === target.date && !sameRef(x, target),
    )
    let block = ''
    if (absence) block = ABSENCE_LABEL[absence.kind]
    else if (target.role === 'INSIDE' && !s.canInside) block = 'не ставится инсайдом'
    else if (sameDay) block = `уже: ${sameDay.dayPart === 'MORNING' ? 'утро' : 'вечер'} · ${POSITION_LABEL[sameDay.role]}`

    const warns: string[] = []
    if (target.dayPart === 'MORNING' && board.slots.some((x) => x.userId === s.userId && x.date === prevDay && x.dayPart === 'EVENING'))
      warns.push('вчера был вечер')
    if (target.dayPart === 'EVENING' && board.slots.some((x) => x.userId === s.userId && x.date === nextDay && x.dayPart === 'MORNING'))
      warns.push('завтра утро')
    if (s.jobTitle === 'DIRECTOR') warns.push('директор')
    const stat = board.stats.find((x) => x.userId === s.userId)
    return { s, block, warns, shifts: stat?.shifts ?? 0 }
  })
  rows.sort((a, b) => Number(!!a.block) - Number(!!b.block) || a.warns.length - b.warns.length || a.shifts - b.shifts)

  return (
    <Modal
      title={`${dow(target.date)} ${dm(target.date)} · ${target.dayPart === 'MORNING' ? 'Утро' : 'Вечер'} · ${POSITION_LABEL[target.role]}`}
      onClose={onClose}
    >
      <div className="sch-picker">
        {current?.userId && (
          <button className="btn ghost small" onClick={() => onPick(null)}>
            ✕ Убрать {current.userName}
          </button>
        )}
        {rows.map(({ s, block, warns, shifts }) => (
          <button
            key={s.userId}
            className={block ? 'sch-person blocked' : 'sch-person'}
            disabled={!!block}
            onClick={() => onPick(s.userId)}
          >
            <span className="sch-person-name">
              {s.fullName}
              {current?.userId === s.userId && ' ✓'}
            </span>
            <span className="muted small">
              {JOB_LABEL[s.jobTitle]} · смен: {shifts}
            </span>
            {block && <span className="sch-tag bad">{block}</span>}
            {!block && warns.map((w) => <span key={w} className="sch-tag warn">⚠ {w}</span>)}
          </button>
        ))}
      </div>
    </Modal>
  )
}

// ================= сводка =================

function StatsTable({ board }: { board: Board }) {
  return (
    <div className="panel table-panel">
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Сотрудник</th>
              <th>Должность</th>
              <th>Смен</th>
              <th>🌅 Утро</th>
              <th>🌙 Вечер</th>
              <th>Инсайдом</th>
              <th>Отсутствия</th>
            </tr>
          </thead>
          <tbody>
            {board.staff.map((s) => {
              const st = board.stats.find((x) => x.userId === s.userId)
              const away = board.absences.filter((a) => a.userId === s.userId)
              return (
                <tr key={s.userId} className={s.schedulable ? '' : 'dimmed'}>
                  <td className="strong">{s.fullName}</td>
                  <td className="muted">{JOB_LABEL[s.jobTitle]}</td>
                  <td>{st?.shifts ?? 0}</td>
                  <td>{st?.mornings ?? 0}</td>
                  <td>{st?.evenings ?? 0}</td>
                  <td>{s.canInside ? (st?.insides ?? 0) : '—'}</td>
                  <td className="small">
                    {away.map((a) => `${ABSENCE_LABEL[a.kind]} ${dm(a.from)}–${dm(a.to)}`).join(', ') || '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ================= сотрудники =================

function StaffTab({ board, onSaved }: { board: Board; onSaved: () => void }) {
  const [error, setError] = useState('')

  async function save(s: Staff, patch: Partial<Staff>) {
    const next = { ...s, ...patch }
    setError('')
    try {
      await scheduleApi.updateStaff(s.userId, {
        jobTitle: next.jobTitle,
        canInside: next.jobTitle === 'TRAINEE' ? false : next.canInside,
        schedulable: next.schedulable,
        maxShiftsWeek: next.maxShiftsWeek,
      })
      onSaved()
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <div className="page">
      {error && <div className="error">{error}</div>}
      <div className="panel table-panel">
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Сотрудник</th>
                <th>Должность</th>
                <th>Может инсайдом</th>
                <th>В автографике</th>
                <th>Макс. смен в неделю</th>
              </tr>
            </thead>
            <tbody>
              {board.staff.map((s) => (
                <tr key={s.userId}>
                  <td>
                    <div className="strong">{s.fullName}</div>
                    <div className="muted small">@{s.login}</div>
                  </td>
                  <td>
                    <select
                      className="select"
                      value={s.jobTitle}
                      onChange={(e) => void save(s, { jobTitle: e.target.value as JobTitle })}
                    >
                      {(Object.keys(JOB_LABEL) as JobTitle[]).map((j) => (
                        <option key={j} value={j}>
                          {JOB_LABEL[j]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={s.canInside}
                        disabled={s.jobTitle === 'TRAINEE'}
                        onChange={(e) => void save(s, { canInside: e.target.checked })}
                      />
                      {s.canInside ? 'да' : 'нет'}
                    </label>
                  </td>
                  <td>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={s.schedulable}
                        onChange={(e) => void save(s, { schedulable: e.target.checked })}
                      />
                      {s.schedulable ? 'да' : s.jobTitle === 'DIRECTOR' ? 'только вручную' : 'нет'}
                    </label>
                  </td>
                  <td>
                    <select
                      className="select"
                      value={s.maxShiftsWeek}
                      onChange={(e) => void save(s, { maxShiftsWeek: Number(e.target.value) })}
                    >
                      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted small">
        Свит-менеджер никогда не ставится инсайдом и только вместе с кем-то ещё. Директор с галочкой «В автографике» ставится в
        последнюю очередь, если больше некого.
      </p>
    </div>
  )
}

// ================= отсутствия =================

function AbsencesTab({ board, onSaved }: { board: Board; onSaved: () => void }) {
  const [userId, setUserId] = useState<number | ''>(board.staff[0]?.userId ?? '')
  const [kind, setKind] = useState<AbsenceKind>('VACATION')
  const [from, setFrom] = useState(board.from)
  const [to, setTo] = useState(board.from)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function add() {
    if (userId === '') return
    setBusy(true)
    setError('')
    try {
      await scheduleApi.addAbsence({ userId, kind, from, to, note: note.trim() || null })
      setNote('')
      onSaved()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: number) {
    if (!confirm('Удалить отсутствие?')) return
    try {
      await scheduleApi.deleteAbsence(id)
      onSaved()
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <div className="page">
      <div className="panel sch-absence-form">
        <h2>Добавить отсутствие</h2>
        <div className="sch-row">
          <select className="select" value={userId} onChange={(e) => setUserId(Number(e.target.value))}>
            {board.staff.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.fullName}
              </option>
            ))}
          </select>
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as AbsenceKind)}>
            {(Object.keys(ABSENCE_LABEL) as AbsenceKind[]).map((k) => (
              <option key={k} value={k}>
                {ABSENCE_LABEL[k]}
              </option>
            ))}
          </select>
          <label className="sch-inline">
            с <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="sch-inline">
            по <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Комментарий (необязательно)" />
        {error && <div className="error">{error}</div>}
        <button className="btn primary" disabled={busy || userId === '' || !from || !to} onClick={add}>
          ＋ Добавить
        </button>
        <p className="muted small">
          В эти дни человек не попадёт в автографик и его нельзя будет поставить вручную. Если он уже стоит в графике, переставь
          его.
        </p>
      </div>

      <div className="panel table-panel">
        {board.absences.length === 0 ? (
          <div className="table-state muted">
            За {dm(board.from)}–{dm(board.to)} отсутствий нет
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Сотрудник</th>
                <th>Причина</th>
                <th>Даты</th>
                <th>Комментарий</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {board.absences.map((a) => (
                <tr key={a.id}>
                  <td className="strong">{a.userName}</td>
                  <td>{ABSENCE_LABEL[a.kind]}</td>
                  <td>
                    {dm(a.from)}–{dm(a.to)}
                  </td>
                  <td className="muted">{a.note ?? '—'}</td>
                  <td className="row-actions">
                    <button className="icon-btn danger" onClick={() => void remove(a.id)}>
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}