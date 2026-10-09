import { useCallback, useEffect, useMemo, useState } from 'react'
import { planApi } from './planApi'
import type { KlnBranch, KlnReport, KlnUser, Part, PlanBranch, PlanEmp, Position, SlotRow, Training } from './planApi'
import { PART_LABEL, clk, dayLabel, dayOptions, errText, posClass, shortName } from './planUtil'

const PARTS: Part[] = ['MORNING', 'MID', 'EVENING', 'NIGHT']

/* ---------------- Нормы: сколько человек какой позиции ---------------- */

export function SlotsPanel({ branchId }: { branchId: number }) {
  const [rows, setRows] = useState<SlotRow[] | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setRows(await planApi.slots(branchId)); setError('') } catch (e) { setError(errText(e)) }
  }, [branchId])
  useEffect(() => { setMsg(''); void load(); planApi.positions().then(setPositions).catch(() => {}) }, [load])

  const planned = positions.filter((p) => p.planned)
  const upd = (i: number, patch: Partial<SlotRow>) => setRows((r) => r && r.map((x, k) => (k === i ? { ...x, ...patch } : x)))

  async function save() {
    if (!rows) return
    setBusy(true); setMsg(''); setError('')
    try { setRows(await planApi.saveSlots(branchId, rows)); setMsg('Нормы сохранены') } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  async function preset() {
    setBusy(true); setMsg(''); setError('')
    try { setRows(await planApi.preset(branchId)); setMsg('Добавлен типовой конец дня: K, DLK с 16:00, C, MR') } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  return (
    <>
      <p className="muted-s">Сколько человек какой позиции нужно в каждую часть дня. Сборка графика ставит людей именно по этому списку. Если конец раньше начала, смена идёт через полночь.</p>
      {error && <div className="ext-msg err">{error}</div>}
      {msg && <div className="ext-msg ok">{msg}</div>}
      <div className="ext-wrap">
        <table className="ext-table pl-norm">
          <thead><tr><th>Позиция</th><th>Часть дня</th><th>Человек</th><th>С</th><th>До</th><th /></tr></thead>
          <tbody>
            {rows?.map((r, i) => (
              <tr key={i}>
                <td><select className="ext-input" value={r.pos} onChange={(e) => upd(i, { pos: e.target.value })}>
                  {planned.map((p) => <option key={p.code} value={p.code}>{p.code} — {p.title}</option>)}
                  {!planned.some((p) => p.code === r.pos) && <option value={r.pos}>{r.pos}</option>}
                </select></td>
                <td><select className="ext-input" value={r.part} onChange={(e) => upd(i, { part: e.target.value as Part })}>
                  {PARTS.map((p) => <option key={p} value={p}>{PART_LABEL[p]}</option>)}
                </select></td>
                <td><input className="ext-input pl-num" type="number" min={0} max={20} value={r.need} onChange={(e) => upd(i, { need: Number(e.target.value) })} /></td>
                <td><input className="ext-input pl-time" value={r.start} placeholder="16:00" onChange={(e) => upd(i, { start: e.target.value })} /></td>
                <td><input className="ext-input pl-time" value={clk(r.end)} placeholder="00:00" onChange={(e) => upd(i, { end: e.target.value })} /></td>
                <td><button className="ext-btn sm" onClick={() => setRows((x) => x && x.filter((_, k) => k !== i))}>Убрать</button></td>
              </tr>
            ))}
            {rows && rows.length === 0 && <tr><td colSpan={6} className="ext-empty">Норм нет. Добавьте строку или возьмите типовой конец дня.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pl-bar" style={{ marginTop: 10 }}>
        <button className="ext-btn" onClick={() => setRows((r) => [...(r ?? []), { pos: planned[0]?.code ?? 'K', part: 'EVENING', need: 1, start: '16:00', end: '00:00' }])}>+ Строка</button>
        <button className="ext-btn" disabled={busy} onClick={() => void preset()}>Типовой конец дня</button>
        <button className="ext-btn primary" disabled={busy || !rows} onClick={() => void save()}>Сохранить</button>
      </div>
    </>
  )
}

/* ---------------- Люди и позиции ---------------- */

export function PeoplePanel({ branchId }: { branchId: number }) {
  const [emps, setEmps] = useState<PlanEmp[] | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [q, setQ] = useState('')
  const [noPos, setNoPos] = useState(false)
  const [error, setError] = useState('')
  const [linking, setLinking] = useState<PlanEmp | null>(null)

  const load = useCallback(async () => {
    try { setEmps(await planApi.employees(branchId)); setError('') } catch (e) { setError(errText(e)) }
  }, [branchId])
  async function unlink(e: PlanEmp) {
    try { await planApi.klnUnlink(e.id); await load() } catch (x) { setError(errText(x)) }
  }
  useEffect(() => { void load(); planApi.positions().then(setPositions).catch(() => {}) }, [load])

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return (emps ?? []).filter((e) => (!n || e.name.toLowerCase().includes(n)) && (!noPos || e.positions.length === 0))
  }, [emps, q, noPos])

  async function add(e: PlanEmp, code: string) {
    if (!code) return
    try { await planApi.addPos(e.id, code); await load() } catch (x) { setError(errText(x)) }
  }
  async function del(e: PlanEmp, code: string) {
    try { await planApi.delPos(e.id, code); await load() } catch (x) { setError(errText(x)) }
  }

  return (
    <>
      <p className="muted-s">Серые метки приходят из kln и меняются там. Жёлтые добавлены здесь вручную, их можно снять крестиком (например, когда человека обучили манирум).</p>
      <div className="ext-top" style={{ marginBottom: 10 }}>
        <input className="ext-input" type="search" placeholder="Поиск по имени" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="ext-check"><input type="checkbox" checked={noPos} onChange={(e) => setNoPos(e.target.checked)} /> Только без позиций</label>
      </div>
      {error && <div className="ext-msg err">{error}</div>}
      <div className="ext-wrap">
        <table className="ext-table">
          <thead><tr><th>Сотрудник</th><th>Позиции</th><th>Добавить</th></tr></thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.id}>
                <td>
                  {e.name}
                  {e.isManager && <span className="ext-tag">менеджер: не в автосборке</span>}
                  {e.isInstructor && <span className="ext-tag warn">инструктор</span>}
                  {!e.inKln && <span className="ext-tag">не связан с kln</span>}
                  {!e.inKln && !e.isManager && <button className="ext-btn sm pl-link" onClick={() => setLinking(e)}>Привязать к kln</button>}
                  {e.manualLink && <><span className="ext-tag">привязан вручную</span><button className="ext-btn sm pl-link" onClick={() => void unlink(e)}>Отвязать</button></>}
                </td>
                <td>
                  <div className="pl-chips">
                    {e.positions.map((p) => (
                      <span key={p.code} className={`pl-tag ${p.source === 'MANUAL' ? 'man' : ''} ${posClass(p.code)}`}>
                        {p.code}{p.source === 'MANUAL' && <button aria-label={`Снять ${p.code}`} onClick={() => void del(e, p.code)}>×</button>}
                      </span>
                    ))}
                    {e.positions.length === 0 && <span className="muted-s">нет</span>}
                  </div>
                </td>
                <td>
                  <select className="ext-input pl-add" value="" onChange={(ev) => void add(e, ev.target.value)}>
                    <option value="">+ позиция</option>
                    {positions.filter((p) => p.planned && !e.positions.some((x) => x.code === p.code)).map((p) => <option key={p.code} value={p.code}>{p.code} — {p.title}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {emps && shown.length === 0 && <tr><td colSpan={3} className="ext-empty">Никого нет</td></tr>}
          </tbody>
        </table>
      </div>
      {linking && <LinkModal emp={linking} onClose={() => setLinking(null)} onDone={async () => { setLinking(null); await load() }} />}
    </>
  )
}

/** Выбор человека в kln для сотрудника, у которого телефон в Таймтрекере и kln не совпал. */
function LinkModal({ emp, onClose, onDone }: { emp: PlanEmp; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [q, setQ] = useState(emp.name.split(' ')[0])
  const [list, setList] = useState<KlnUser[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) { setList([]); return }
    const t = setTimeout(() => { planApi.klnUsers(q).then((r) => { setList(r); setError('') }).catch((e) => setError(errText(e))) }, 250)
    return () => clearTimeout(t)
  }, [q])

  async function pick(u: KlnUser) {
    if (u.linkedTo != null && u.linkedTo !== emp.id && !window.confirm('Этот человек из kln уже связан с другим сотрудником. Перепривязать к выбранному?')) return
    setBusy(true)
    try { await planApi.klnLink(emp.id, u.id); await onDone() } catch (e) { setError(errText(e)); setBusy(false) }
  }

  return (
    <div className="sm-back" onClick={onClose}>
      <div className="sm-box pl-picker" onClick={(e) => e.stopPropagation()}>
        <h3>Привязать к kln: {shortName(emp.name)}</h3>
        <p className="muted-s">Найдите этого человека в kln. Проверьте ресторан и последние цифры телефона, чтобы не перепутать тёзок.</p>
        <input className="ext-input" autoFocus placeholder="Имя или фамилия в kln" value={q} onChange={(e) => setQ(e.target.value)} />
        {error && <div className="ext-msg err" style={{ marginTop: 8 }}>{error}</div>}
        <div className="pl-plist">
          {list.map((u) => (
            <button key={u.id} className="pl-prow" disabled={busy} onClick={() => void pick(u)}>
              <span>{u.name}</span>
              <small>
                <em>{u.branch}</em>
                <em>тел. …{u.phoneTail}</em>
                {u.positions && <em>{u.positions}</em>}
                {!u.active && <em className="no">не активен</em>}
                {u.linkedTo != null && <em className="warn">уже связан</em>}
              </small>
            </button>
          ))}
          {q.trim().length >= 2 && list.length === 0 && !error && <div className="ext-empty">Никого не найдено</div>}
        </div>
        <div className="pl-picker-act"><button className="ext-btn" onClick={onClose}>Закрыть</button></div>
      </div>
    </div>
  )
}

/* ---------------- Обучение ---------------- */

export function TrainingPanel({ branchId }: { branchId: number }) {
  const days = useMemo(() => dayOptions(0, 45), [])
  const [list, setList] = useState<Training[]>([])
  const [emps, setEmps] = useState<PlanEmp[]>([])
  const [instr, setInstr] = useState<number | ''>('')
  const [trainee, setTrainee] = useState('')
  const [from, setFrom] = useState(days[1].value)
  const [to, setTo] = useState(days[1].value)
  const [start, setStart] = useState('08:00')
  const [end, setEnd] = useState('16:00')
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [t, e] = await Promise.all([planApi.trainings(branchId), planApi.employees(branchId)])
      setList(t); setEmps(e); setError('')
    } catch (x) { setError(errText(x)) }
  }, [branchId])
  useEffect(() => { void load() }, [load])

  const sorted = [...emps].sort((a, b) => Number(b.isInstructor) - Number(a.isInstructor) || a.name.localeCompare(b.name))

  async function add() {
    if (instr === '') { setError('Выберите инструктора'); return }
    setBusy(true); setError('')
    try {
      const name = trainee.trim()
      const found = emps.find((e) => e.name.toLowerCase() === name.toLowerCase())
      await planApi.addTraining(branchId, { instructorId: instr, traineeId: found ? found.id : null, traineeName: found ? '' : name, from, to: to < from ? from : to, start, end, comment })
      setComment(''); setTrainee(''); await load()
    } catch (x) { setError(errText(x)) } finally { setBusy(false) }
  }
  async function del(id: number) {
    try { await planApi.delTraining(branchId, id); await load() } catch (x) { setError(errText(x)) }
  }

  return (
    <>
      <p className="muted-s">На эти дни инструктор встаёт на TR. Стажёра можно вписать текстом: он может ещё не быть в kln и Таймтрекере. Если имя совпало с сотрудником из списка, стажёр встанет на TRN в те же часы.</p>
      {error && <div className="ext-msg err">{error}</div>}
      <div className="pl-form pl-card">
        <label>Инструктор<select className="ext-input" value={instr} onChange={(e) => setInstr(e.target.value ? Number(e.target.value) : '')}>
          <option value="">— выберите —</option>
          {sorted.map((e) => <option key={e.id} value={e.id}>{e.name}{e.isInstructor ? ' ★' : ''}</option>)}
        </select></label>
        <label>Стажёр
          <input className="ext-input" list="trainee-list" value={trainee} maxLength={120} placeholder="Имя, можно нового сотрудника" onChange={(e) => setTrainee(e.target.value)} />
          <datalist id="trainee-list">{emps.filter((e) => e.id !== instr).map((e) => <option key={e.id} value={e.name} />)}</datalist>
        </label>
        <label>С<select className="ext-input" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value) }}>
          {days.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></label>
        <label>По<select className="ext-input" value={to} onChange={(e) => setTo(e.target.value)}>
          {days.filter((d) => d.value >= from).map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></label>
        <label>Начало<input className="ext-input" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label>Конец<input className="ext-input" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        <label className="wide">Комментарий<input className="ext-input" maxLength={300} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например: обучение кассе" /></label>
        <button className="ext-btn primary" disabled={busy} onClick={() => void add()}>Добавить</button>
      </div>
      <div className="ext-wrap" style={{ marginTop: 12 }}>
        <table className="ext-table">
          <thead><tr><th>Инструктор</th><th>Стажёр</th><th>Даты</th><th>Часы</th><th>Комментарий</th><th /></tr></thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id}>
                <td>{shortName(t.instructor)}</td>
                <td>{t.trainee ? shortName(t.trainee) : <span className="muted-s">—</span>}</td>
                <td>{t.from === t.to ? dayLabel(t.from) : `${dayLabel(t.from)} – ${dayLabel(t.to)}`}</td>
                <td>{t.start}–{clk(t.end)}</td>
                <td>{t.comment}</td>
                <td><button className="ext-btn sm" onClick={() => void del(t.id)}>Удалить</button></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="ext-empty">Обучений нет</td></tr>}
          </tbody>
        </table>
      </div>
      
    </>
  )
}

/* ---------------- kln ---------------- */

export function KlnPanel() {
  const [branches, setBranches] = useState<KlnBranch[]>([])
  const [tt, setTt] = useState<PlanBranch[]>([])
  const [report, setReport] = useState<KlnReport | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [k, t] = await Promise.all([planApi.klnBranches(), planApi.branches()])
      setBranches(k); setTt(t); setError('')
    } catch (e) { setError(errText(e)) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function sync() {
    setBusy(true); setError(''); setReport(null)
    try { setReport(await planApi.klnSync()); await load() } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  async function map(id: number, v: string) {
    try { await planApi.klnMap(id, v ? Number(v) : null); setReport(await planApi.klnRematch()); await load() } catch (e) { setError(errText(e)) }
  }

  return (
    <>
      <p className="muted-s">Из kln берём, на каких позициях может работать каждый человек. Сотрудников сопоставляем с Таймтрекером по телефону. Синхронизация занимает до минуты.</p>
      {error && <div className="ext-msg err">{error}</div>}
      <div className="pl-bar">
        <button className="ext-btn primary" disabled={busy} onClick={() => void sync()}>{busy ? 'Синхронизирую…' : 'Синхронизировать с kln'}</button>
      </div>
      {report && (
        <div className="ext-msg ok">
          Рестораны: {report.branches ?? '—'}, сотрудники kln: {report.users ?? '—'}, связано с Таймтрекером: {report.matched}, позиций проставлено: {report.positions}.
          {report.unknownPositions.length > 0 && <div>Новые коды позиций в kln, которых у нас нет: {report.unknownPositions.join(', ')}</div>}
          {report.unmatchedInMappedBranches.length > 0 && <div>Не нашлись в Таймтрекере по телефону: {report.unmatchedInMappedBranches.join(', ')}</div>}
        </div>
      )}
      <div className="ext-wrap" style={{ marginTop: 10 }}>
        <table className="ext-table">
          <thead><tr><th>Ресторан в kln</th><th>Сотрудников</th><th>Филиал в Таймтрекере</th></tr></thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id}>
                <td>{b.title}</td>
                <td>{b.users}</td>
                <td>
                  <select className="ext-input" value={b.ttBranchId ?? ''} onChange={(e) => void map(b.id, e.target.value)}>
                    <option value="">{b.suggestTtBranchId ? 'не привязан (есть подсказка)' : 'не привязан'}</option>
                    {tt.map((t) => <option key={t.id} value={t.id}>{t.title}{t.id === b.suggestTtBranchId ? ' ← похоже' : ''}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {branches.length === 0 && <tr><td colSpan={3} className="ext-empty">Пока пусто: нажмите «Синхронизировать с kln»</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ---------------- Лимиты ---------------- */

export function LimitsPanel() {
  const [maxC, setMaxC] = useState(6)
  const [rest, setRest] = useState(10)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    planApi.settings().then((s) => { setMaxC(s.maxConsecutive); setRest(s.minRestHours) }).catch((e) => setError(errText(e)))
  }, [])

  async function save() {
    setMsg(''); setError('')
    try { const s = await planApi.saveSettings({ maxConsecutive: maxC, minRestHours: rest }); setMaxC(s.maxConsecutive); setRest(s.minRestHours); setMsg('Сохранено') } catch (e) { setError(errText(e)) }
  }

  return (
    <>
      {error && <div className="ext-msg err">{error}</div>}
      {msg && <div className="ext-msg ok">{msg}</div>}
      <div className="pl-form pl-card">
        <label>Рабочих дней подряд не больше<input className="ext-input" type="number" min={1} max={14} value={maxC} onChange={(e) => setMaxC(Number(e.target.value))} /></label>
        <label>Отдых между сменами, часов<input className="ext-input" type="number" min={0} max={24} value={rest} onChange={(e) => setRest(Number(e.target.value))} /></label>
        <button className="ext-btn primary" onClick={() => void save()}>Сохранить</button>
      </div>
      <p className="muted-s">Нормы часов в неделю нет. Эти два ограничения действуют при сборке графика для всех филиалов.</p>
    </>
  )
}