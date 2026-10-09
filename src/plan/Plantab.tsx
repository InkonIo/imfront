import { useCallback, useEffect, useMemo, useState } from 'react'
import { planApi } from './Planapi'
import type { Draft, DraftBrief, GenResult, Position, Shift } from './Planapi'
import { SlotsPanel, PeoplePanel, TrainingPanel, KlnPanel } from './Plansetup'
import { PART_LABEL, addDays, clk, dayLabel, dayOptions, errText, posClass, shortName } from './Planutil'
import './plan.css'

type Sub = 'week' | 'slots' | 'people' | 'train' | 'kln'

export default function PlanTab({ branchId }: { branchId: number | null }) {
  const [sub, setSub] = useState<Sub>('week')
  const tabs: [Sub, string][] = [['week', 'Неделя'], ['slots', 'Нормы'], ['people', 'Люди и позиции'], ['train', 'Обучение'], ['kln', 'kln']]
  return (
    <>
      <div className="sch-seg" style={{ marginBottom: 12 }}>
        {tabs.map(([k, t]) => <button key={k} className={sub === k ? 'on' : ''} onClick={() => setSub(k)}>{t}</button>)}
      </div>
      {sub === 'kln' ? <KlnPanel /> : branchId == null
        ? <div className="ext-wrap"><div className="ext-empty">Выберите филиал вверху: график собирается по одному ресторану.</div></div>
        : sub === 'week' ? <WeekView branchId={branchId} />
        : sub === 'slots' ? <SlotsPanel branchId={branchId} />
        : sub === 'people' ? <PeoplePanel branchId={branchId} />
        : <TrainingPanel branchId={branchId} />}
    </>
  )
}

/* ---------------- Неделя ---------------- */

function WeekView({ branchId }: { branchId: number }) {
  const startOptions = useMemo(() => dayOptions(1, 21), [])
  const [weekStart, setWeekStart] = useState(startOptions[0].value)
  const [positions, setPositions] = useState<Position[]>([])
  const [drafts, setDrafts] = useState<DraftBrief[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [gen, setGen] = useState<GenResult | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState<Shift | null>(null)
  const [adding, setAdding] = useState(false)

  const openDraft = useCallback(async (id: number) => {
    try { setDraft(await planApi.draft(id)); setError('') } catch (e) { setError(errText(e)) }
  }, [])

  const reloadList = useCallback(async () => {
    const l = await planApi.drafts(branchId)
    setDrafts(l)
    return l
  }, [branchId])

  useEffect(() => {
    setDraft(null); setGen(null); setNote('')
    planApi.positions().then(setPositions).catch(() => {})
    reloadList().then((l) => {
      const first = l.find((x) => x.status === 'DRAFT') ?? l[0]
      if (first) { setWeekStart(first.weekStart); void openDraft(first.id) }
    }).catch((e) => setError(errText(e)))
  }, [branchId, reloadList, openDraft])

  async function generate() {
    const exists = drafts.some((d) => d.status === 'DRAFT' && d.weekStart === weekStart)
    if (exists && !window.confirm('На эту неделю уже есть черновик. Пересобрать? Ручные правки с людьми сохранятся, остальное будет собрано заново.')) return
    setBusy(true); setError(''); setNote('')
    try {
      const r = await planApi.generate(branchId, weekStart)
      setGen(r)
      await reloadList()
      await openDraft(r.draftId)
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  async function publish() {
    if (!draft) return
    const empty = draft.shifts.filter((s) => s.employeeId == null).length
    if (empty > 0 && !window.confirm(`Не закрыто слотов: ${empty}. Опубликовать всё равно?`)) return
    setBusy(true); setError('')
    try {
      const r = await planApi.publish(draft.id, empty > 0)
      setNote(r.message)
      await reloadList()
      await openDraft(draft.id)
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  async function assign(s: Shift, employeeId: number | null) {
    if (!draft) return
    setPicker(null); setError('')
    try {
      const r = await planApi.assign(draft.id, s.id, employeeId)
      setNote(r.warnings.length ? `Поставлено, но: ${r.warnings.join('; ')}` : '')
      await openDraft(draft.id)
      void reloadList()
    } catch (e) { setError(errText(e)) }
  }

  async function remove(s: Shift) {
    if (!draft) return
    setPicker(null)
    try { await planApi.delShift(draft.id, s.id); await openDraft(draft.id); void reloadList() } catch (e) { setError(errText(e)) }
  }

  const editable = draft?.status === 'DRAFT'
  const days = draft ? Array.from({ length: 7 }, (_, i) => addDays(draft.weekStart, i)) : []
  const order = (code: string) => { const i = positions.findIndex((p) => p.code === code); return i < 0 ? 999 : i }

  const rows = useMemo(() => {
    if (!draft) return []
    const m = new Map<string, { key: string; pos: string; start: string; end: string; part: string }>()
    for (const s of draft.shifts) {
      const key = `${s.pos}|${s.start}|${s.end}`
      if (!m.has(key)) m.set(key, { key, pos: s.pos, start: s.start, end: s.end, part: s.part })
    }
    return [...m.values()].sort((a, b) => order(a.pos) - order(b.pos) || a.start.localeCompare(b.start))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, positions])

  const counts = useMemo(() => {
    const c = new Map<number, number>()
    draft?.shifts.forEach((s) => { if (s.employeeId != null) c.set(s.employeeId, (c.get(s.employeeId) ?? 0) + 1) })
    return c
  }, [draft])

  const emptyCount = draft ? draft.shifts.filter((s) => s.employeeId == null).length : 0

  return (
    <>
      <div className="pl-bar">
        <label className="pl-lab">Неделя с
          <select className="ext-input" value={weekStart} onChange={(e) => {
            setWeekStart(e.target.value)
            const d = drafts.find((x) => x.weekStart === e.target.value && x.status === 'DRAFT') ?? drafts.find((x) => x.weekStart === e.target.value)
            if (d) void openDraft(d.id); else { setDraft(null); setGen(null) }
          }}>
            {startOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            {drafts.filter((d) => !startOptions.some((o) => o.value === d.weekStart)).map((d) => <option key={d.weekStart} value={d.weekStart}>{dayLabel(d.weekStart)}</option>)}
          </select>
        </label>
        <button className="ext-btn primary" disabled={busy} onClick={() => void generate()}>{busy ? 'Собираю…' : 'Собрать черновик'}</button>
        {draft && editable && <button className="ext-btn" onClick={() => setAdding(true)}>+ Смена</button>}
        {draft && editable && <button className="ext-btn pl-pub" disabled={busy} onClick={() => void publish()}>Опубликовать</button>}
      </div>

      {error && <div className="ext-msg err">{error}</div>}
      {note && <div className="ext-msg ok">{note}</div>}
      {gen && gen.pendingRequests > 0 && <div className="ext-msg err">Ещё не рассмотрено заявок на эти даты: {gen.pendingRequests}. Они в сборке не учтены.</div>}
      {gen && gen.slotsDefined === 0 && <div className="ext-msg err">Для этого филиала не заданы нормы (вкладка «Нормы»), поэтому собирать нечего.</div>}
      {gen && gen.warnings.map((w, i) => <div key={i} className="ext-msg err">{w}</div>)}

      {draft && (
        <div className="ext-meta">
          <span>{draft.branchTitle}</span>
          <span>{draft.status === 'DRAFT' ? 'Черновик' : `Опубликован ${draft.publishedAt ?? ''}`}</span>
          <span>Закрыто: {draft.shifts.length - emptyCount} из {draft.shifts.length}</span>
          {emptyCount > 0 && <span className="pl-bad">Не закрыто: {emptyCount}</span>}
          {draft.status === 'PUBLISHED' && <span>В Таймтрекер пока не записан</span>}
        </div>
      )}

      {!draft && !busy && <div className="ext-wrap"><div className="ext-empty">На эту неделю графика ещё нет. Задайте нормы и нажмите «Собрать черновик».</div></div>}

      {draft && rows.length === 0 && <div className="ext-wrap"><div className="ext-empty">В черновике нет смен: проверьте нормы.</div></div>}

      {draft && rows.length > 0 && (
        <div className="ext-wrap pl-wrap">
          <table className="pl-grid">
            <thead>
              <tr>
                <th className="pl-rowh">Позиция</th>
                {days.map((d) => <th key={d}>{dayLabel(d)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th className="pl-rowh">
                    <span className={`pl-pos ${posClass(r.pos)}`}>{r.pos}</span>
                    <small>{clk(r.start)}–{clk(r.end)}</small>
                  </th>
                  {days.map((d) => {
                    const list = draft.shifts.filter((s) => s.day === d && s.pos === r.pos && s.start === r.start && s.end === r.end)
                    return (
                      <td key={d}>
                        {list.map((s) => (
                          <button key={s.id} disabled={!editable}
                            className={`pl-chip ${s.employeeId == null ? 'empty' : posClass(s.pos)} ${s.manual ? 'man' : ''}`}
                            title={s.note ?? (s.manual ? 'Поставлено вручную' : undefined)}
                            onClick={() => setPicker(s)}>
                            {s.employeeId == null ? 'Не закрыто' : shortName(s.employeeName ?? '')}
                            {s.note && <i> · {s.note}</i>}
                          </button>
                        ))}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {draft && counts.size > 0 && (
        <details className="pl-sum">
          <summary>Смен за неделю по людям</summary>
          <div className="pl-sumlist">
            {draft.employees.filter((e) => counts.has(e.id)).map((e) => <span key={e.id}>{shortName(e.name)}: <b>{counts.get(e.id)}</b></span>)}
          </div>
        </details>
      )}

      {draft && picker && editable && (
        <Picker draft={draft} shift={picker} counts={counts} onPick={(id) => void assign(picker, id)}
          onRemove={() => void remove(picker)} onClose={() => setPicker(null)} />
      )}
      {draft && adding && (
        <AddShift draft={draft} positions={positions} onClose={() => setAdding(false)}
          onAdded={async () => { setAdding(false); await openDraft(draft.id); void reloadList() }} />
      )}
    </>
  )
}

/* ---------------- Выбор человека в клетку ---------------- */

function Picker({ draft, shift, counts, onPick, onRemove, onClose }: {
  draft: Draft; shift: Shift; counts: Map<number, number>
  onPick: (id: number | null) => void; onRemove: () => void; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const rows = draft.employees.map((e) => {
      const can = e.positions.includes(shift.pos)
      const tags: { t: string; bad: boolean }[] = []
      for (const l of draft.limits) {
        if (l.employeeId !== e.id || l.day !== shift.day) continue
        if (l.kind === 'ABSENCE') tags.push({ t: 'отпуск/больничный', bad: true })
        else if (l.kind === 'DAY_OFF') tags.push({ t: 'выходной', bad: true })
        else if (l.kind === 'UNAVAILABLE') tags.push({ t: `не может ${l.from}–${clk(l.to)}`, bad: false })
        else tags.push({ t: `только ${l.from}–${clk(l.to)}`, bad: false })
      }
      const other = draft.shifts.find((s) => s.employeeId === e.id && s.day === shift.day && s.id !== shift.id)
      if (other) tags.push({ t: `уже на смене: ${other.pos} ${clk(other.start)}`, bad: true })
      const clean = can && tags.length === 0
      return { e, can, tags, clean, n: counts.get(e.id) ?? 0 }
    })
    const needle = q.trim().toLowerCase()
    return rows
      .filter((r) => !needle || r.e.name.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.clean) - Number(a.clean) || Number(b.can) - Number(a.can) || a.n - b.n || a.e.name.localeCompare(b.e.name))
  }, [draft, shift, counts, q])

  return (
    <div className="sm-back" onClick={onClose}>
      <div className="sm-box pl-picker" onClick={(e) => e.stopPropagation()}>
        <h3><span className={`pl-pos ${posClass(shift.pos)}`}>{shift.pos}</span> {dayLabel(shift.day)} · {clk(shift.start)}–{clk(shift.end)}</h3>
        <input className="ext-input" autoFocus placeholder="Поиск по имени" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="pl-plist">
          {list.map(({ e, can, tags, clean, n }) => (
            <button key={e.id} className={`pl-prow ${clean ? 'good' : ''} ${shift.employeeId === e.id ? 'cur' : ''}`} onClick={() => onPick(e.id)}>
              <span>{e.name}</span>
              <small>
                {can ? <em className="ok">умеет {shift.pos}</em> : <em className="no">не обучен {shift.pos}</em>}
                {tags.map((t, i) => <em key={i} className={t.bad ? 'no' : 'warn'}>{t.t}</em>)}
                <em>смен: {n}</em>
              </small>
            </button>
          ))}
          {list.length === 0 && <div className="ext-empty">Никого не найдено</div>}
        </div>
        <p className="muted-s">Красные пометки не запрещают поставить человека, но проверьте их.</p>
        <div className="pl-picker-act">
          {shift.employeeId != null && <button className="ext-btn" onClick={() => onPick(null)}>Очистить клетку</button>}
          <button className="ext-btn danger" onClick={onRemove}>Удалить смену</button>
          <button className="ext-btn" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Добавить смену вручную ---------------- */

function AddShift({ draft, positions, onClose, onAdded }: {
  draft: Draft; positions: Position[]; onClose: () => void; onAdded: () => void | Promise<void>
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(draft.weekStart, i))
  const [day, setDay] = useState(days[0])
  const [pos, setPos] = useState(positions.find((p) => p.planned)?.code ?? 'K')
  const [start, setStart] = useState('16:00')
  const [end, setEnd] = useState('00:00')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true); setErr('')
    try { await planApi.addShift(draft.id, { day, pos, start, end }); await onAdded() } catch (e) { setErr(errText(e)); setBusy(false) }
  }

  return (
    <div className="sm-back" onClick={onClose}>
      <div className="sm-box" onClick={(e) => e.stopPropagation()}>
        <h3>Добавить смену</h3>
        {err && <div className="ext-msg err">{err}</div>}
        <div className="pl-form">
          <label>День<select className="ext-input" value={day} onChange={(e) => setDay(e.target.value)}>{days.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}</select></label>
          <label>Позиция<select className="ext-input" value={pos} onChange={(e) => setPos(e.target.value)}>
            {positions.filter((p) => p.planned).map((p) => <option key={p.code} value={p.code}>{p.code} — {p.title}</option>)}
          </select></label>
          <label>С<input className="ext-input" value={start} placeholder="16:00" onChange={(e) => setStart(e.target.value)} /></label>
          <label>До<input className="ext-input" value={end} placeholder="00:00" onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
        <p className="muted-s">{PART_LABEL[start < '11:00' ? 'MORNING' : start < '15:00' ? 'MID' : start >= '21:00' ? 'NIGHT' : 'EVENING']}. Человека поставите, нажав на пустую клетку.</p>
        <div className="pl-picker-act">
          <button className="ext-btn primary" disabled={busy} onClick={() => void save()}>Добавить</button>
          <button className="ext-btn" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  )
}