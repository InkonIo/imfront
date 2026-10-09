import { useCallback, useEffect, useMemo, useState } from 'react'
import { extApi } from '../ext/api'
import type { ExtBranch } from '../ext/api'
import ExtSchedule from '../ext/ExtSchedule'
import { schedApi } from './api'
import type { AccountRow, CreatedRow, OwnerInfo, SchedRequest } from './api'
import PlanTab from '../plan/Plantab'
import '../ext/ext.css'
import './sched.css'

type Tab = 'requests' | 'schedule' | 'plan' | 'access'

const fmt = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y.slice(2)}` }
const range = (r: { dateFrom: string; dateTo: string }) => (r.dateFrom === r.dateTo ? fmt(r.dateFrom) : `${fmt(r.dateFrom)} – ${fmt(r.dateTo)}`)
const days = (r: { dateFrom: string; dateTo: string }) => Math.round((Date.parse(r.dateTo) - Date.parse(r.dateFrom)) / 86400000) + 1
const clk = (t: string | null) => (t === '23:59' ? '00:00' : t)
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Ошибка')

export default function SchedulerPage({ isAdmin, onChanged }: { isAdmin: boolean; onChanged?: () => void }) {
  const [tab, setTab] = useState<Tab>('requests')
  const [branches, setBranches] = useState<ExtBranch[]>([])
  const [branch, setBranch] = useState<number | null>(null)

  useEffect(() => {
    extApi.list('', null, false).then((r) => setBranches(r.branches)).catch(() => {})
  }, [])

  return (
    <div className="ext sched">
      <div className="ext-tabs">
        <button className={tab === 'requests' ? 'ext-tab on' : 'ext-tab'} onClick={() => setTab('requests')}>Заявки</button>
        <button className={tab === 'schedule' ? 'ext-tab on' : 'ext-tab'} onClick={() => setTab('schedule')}>График</button>
        <button className={tab === 'plan' ? 'ext-tab on' : 'ext-tab'} onClick={() => setTab('plan')}>Авто-график</button>
        <button className={tab === 'access' ? 'ext-tab on' : 'ext-tab'} onClick={() => setTab('access')}>Доступ сотрудников</button>
      </div>
      <div className="ext-top" style={{ marginBottom: 10 }}>
        <select className="ext-input" style={{ maxWidth: 260 }} value={branch ?? ''} onChange={(e) => setBranch(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Все филиалы</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
        </select>
      </div>
      {tab === 'requests' && <RequestsTab branchId={branch} onChanged={onChanged} />}
      {tab === 'schedule' && <ExtSchedule branchId={branch} withRequests />}
      {tab === 'plan' && <PlanTab branchId={branch} />}
      {tab === 'access' && <AccessTab branchId={branch} isAdmin={isAdmin} />}
    </div>
  )
}

/* ---------------- Заявки ---------------- */

function RequestsTab({ branchId, onChanged }: { branchId: number | null; onChanged?: () => void }) {
  const [mode, setMode] = useState<'PENDING' | 'ALL'>('PENDING')
  const [items, setItems] = useState<SchedRequest[] | null>(null)
  const [error, setError] = useState('')
  const [rejecting, setRejecting] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      setItems(await schedApi.requests(mode, undefined, branchId))
      setError('')
    } catch (e) { setError(errText(e)) }
  }, [mode, branchId])
  useEffect(() => { void load() }, [load])

  async function decide(r: SchedRequest, approve: boolean) {
    setBusy(r.id)
    try {
      await schedApi.decide(r.id, approve, approve ? note : note)
      setRejecting(null)
      setNote('')
      await load()
      onChanged?.()
    } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }

  return (
    <>
      <div className="sch-seg" style={{ marginBottom: 10 }}>
        <button className={mode === 'PENDING' ? 'on' : ''} onClick={() => setMode('PENDING')}>Ждут решения</button>
        <button className={mode === 'ALL' ? 'on' : ''} onClick={() => setMode('ALL')}>Все за месяц</button>
      </div>
      {error && <div className="ext-msg err">{error}</div>}
      {items && items.length === 0 && <div className="ext-wrap"><div className="ext-empty">{mode === 'PENDING' ? 'Новых заявок нет 🎉' : 'Заявок нет'}</div></div>}
      <div className="rq-list">
        {items?.map((r) => (
          <div key={r.id} className={`rq-card st-${r.status}`}>
            <div className="rq-head">
              <div>
                <strong>{r.fullName}</strong>
                <small>{[r.position, r.branch].filter(Boolean).join(' · ')}</small>
              </div>
              <span className={`rq-badge ${r.status}`}>{STATUS[r.status]}</span>
            </div>
            <div className="rq-what">
              <b>{r.kind === 'DAY_OFF' ? 'Выходной' : r.kind === 'AVAILABLE' ? 'Может только' : 'Недоступен'}</b>
              <span>{range(r)}{days(r) > 1 ? ` (${days(r)} дн.)` : ''}</span>
              {r.kind !== 'DAY_OFF' && <span>{r.kind === 'AVAILABLE' ? 'с' : 'не может с'} {r.timeFrom} до {clk(r.timeTo)}</span>}
            </div>
            {r.comment && <div className="rq-comment">«{r.comment}»</div>}
            <div className="rq-hint">
              {r.myShifts > 0 ? <span className="warn">В эти даты у него смен в плане: {r.myShifts}</span> : <span>Смен в плане на эти даты нет</span>}
              {r.minOthers != null && (
                <span className={r.minOthers <= 1 ? 'bad' : ''}>
                  Коллег в филиале в самый «тонкий» день: {r.minOthers}
                </span>
              )}
            </div>
            {r.status !== 'PENDING' && (
              <div className="rq-dec">{r.decidedBy ? `Решила: ${r.decidedBy}. ` : ''}{r.decisionNote ?? ''}</div>
            )}
            {r.status === 'PENDING' && (rejecting === r.id ? (
              <div className="rq-reject">
                <input className="ext-input" autoFocus placeholder="Причина отказа (сотрудник её увидит)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
                <button className="ext-btn" onClick={() => { setRejecting(null); setNote('') }}>Отмена</button>
                <button className="ext-btn danger" disabled={busy === r.id || !note.trim()} onClick={() => void decide(r, false)}>Отказать</button>
              </div>
            ) : (
              <div className="rq-actions">
                <button className="ext-btn primary" disabled={busy === r.id} onClick={() => void decide(r, true)}>Одобрить</button>
                <button className="ext-btn" onClick={() => { setRejecting(r.id); setNote('') }}>Отказать…</button>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="rq-foot">Одобренная заявка отмечается точкой на графике. Сам график в Таймтрекере она пока не меняет.</p>
    </>
  )
}

const STATUS: Record<string, string> = { PENDING: 'Ждёт', APPROVED: 'Одобрено', REJECTED: 'Отказано', CANCELLED: 'Отменена' }

/* ---------------- Доступ ---------------- */

function AccessTab({ branchId, isAdmin }: { branchId: number | null; isAdmin: boolean }) {
  const [rows, setRows] = useState<AccountRow[] | null>(null)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [created, setCreated] = useState<CreatedRow[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setRows(await schedApi.accounts(q, branchId)); setError('') } catch (e) { setError(errText(e)) }
  }, [q, branchId])
  useEffect(() => {
    const t = setTimeout(() => void load(), 200)
    return () => clearTimeout(t)
  }, [load])

  const without = useMemo(() => (rows ?? []).filter((r) => !r.userId), [rows])
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  async function create(ids: number[]) {
    setBusy(true)
    try { setCreated(await schedApi.createAccounts(ids)); setSel(new Set()); await load() } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  async function reset(r: AccountRow) {
    if (!window.confirm(`Сбросить пароль: ${r.fullName}? Старый перестанет работать.`)) return
    try {
      const x = await schedApi.reset(r.employeeId)
      setCreated([{ employeeId: r.employeeId, fullName: r.fullName, status: 'created', login: x.login, password: x.password }])
    } catch (e) { setError(errText(e)) }
  }
  async function toggleActive(r: AccountRow) {
    try { await schedApi.setActive(r.employeeId, !r.active); await load() } catch (e) { setError(errText(e)) }
  }

  return (
    <>
      {isAdmin && <OwnerCard />}
      <div className="ext-top" style={{ marginBottom: 10 }}>
        <input className="ext-input" type="search" placeholder="Поиск по имени или телефону" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="ext-btn primary" disabled={busy || sel.size === 0} onClick={() => void create([...sel])}>
          Создать аккаунты{sel.size ? ` (${sel.size})` : ''}
        </button>
        <button className="ext-btn" disabled={busy || without.length === 0} onClick={() => setSel(new Set(without.map((r) => r.employeeId)))}>
          Выбрать всех без аккаунта ({without.length})
        </button>
      </div>
      {error && <div className="ext-msg err">{error}</div>}
      <p className="rq-foot" style={{ marginTop: 0 }}>Логин сотрудника — его номер телефона из Таймтрекера (7XXXXXXXXXX). Пароль генерируется и показывается один раз; при первом входе сотрудник обязан его сменить.</p>
      <div className="ext-wrap">
        <table className="ext-table">
          <thead><tr><th style={{ width: 36 }} /><th>Сотрудник</th><th>Филиал</th><th>Телефон</th><th>Аккаунт</th><th /></tr></thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.employeeId}>
                <td>{!r.userId && <input type="checkbox" checked={sel.has(r.employeeId)} onChange={() => toggle(r.employeeId)} />}</td>
                <td><strong>{r.fullName}</strong><div className="muted-s">{r.position ?? ''}</div></td>
                <td>{r.branch ?? '—'}</td>
                <td>{r.phone ?? '—'}</td>
                <td>
                  {!r.userId && <span className="ext-tag">нет</span>}
                  {r.userId && <><code>{r.login}</code> {r.active ? <span className="ext-tag">активен</span> : <span className="ext-tag warn">отключён</span>}{r.mustChange && <span className="ext-tag warn">пароль не менял</span>}</>}
                </td>
                <td className="acc-act">
                  {!r.userId && <button className="ext-btn sm" disabled={busy} onClick={() => void create([r.employeeId])}>Создать</button>}
                  {r.userId && <>
                    <button className="ext-btn sm" onClick={() => void reset(r)}>Сбросить пароль</button>
                    <button className="ext-btn sm" onClick={() => void toggleActive(r)}>{r.active ? 'Отключить' : 'Включить'}</button>
                  </>}
                </td>
              </tr>
            ))}
            {rows && rows.length === 0 && <tr><td colSpan={6} className="ext-empty">Никого нет. Сначала синхронизируйте сотрудников из Таймтрекера.</td></tr>}
          </tbody>
        </table>
      </div>
      {created && <CredsModal rows={created} onClose={() => setCreated(null)} />}
    </>
  )
}

function CredsModal({ rows, onClose }: { rows: CreatedRow[]; onClose: () => void }) {
  const ok = rows.filter((r) => r.status === 'created')
  const skipped = rows.filter((r) => r.status === 'skipped')
  const text = ok.map((r) => `${r.fullName}\nЛогин: ${r.login}\nПароль: ${r.password}`).join('\n\n')
  const [copied, setCopied] = useState(false)
  return (
    <div className="sm-back" onClick={onClose}>
      <div className="sm-box" onClick={(e) => e.stopPropagation()}>
        <h3>Данные для входа</h3>
        {ok.length > 0 && <p className="ext-msg err" style={{ background: 'rgba(252,182,20,.2)', color: 'inherit' }}>Пароли показываются один раз. Скопируйте и передайте сотрудникам — потом их не увидеть, только сбросить.</p>}
        {ok.map((r) => (
          <div key={r.employeeId} className="cred"><b>{r.fullName}</b><span>логин <code>{r.login}</code></span><span>пароль <code>{r.password}</code></span></div>
        ))}
        {skipped.length > 0 && (
          <details open><summary>Пропущено: {skipped.length}</summary>
            {skipped.map((r) => <div key={r.employeeId} className="muted-s">{r.fullName ?? r.employeeId}: {r.reason}</div>)}
          </details>
        )}
        <div className="rq-actions" style={{ marginTop: 12 }}>
          {ok.length > 0 && <button className="ext-btn primary" onClick={() => { void navigator.clipboard?.writeText(text); setCopied(true) }}>{copied ? 'Скопировано ✓' : 'Скопировать всё'}</button>}
          <button className="ext-btn" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Ответственная (только супер-админ) ---------------- */

function OwnerCard() {
  const [info, setInfo] = useState<OwnerInfo | null>(null)
  const [owner, setOwner] = useState<string>('')
  const [lead, setLead] = useState(2)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    schedApi.owner().then((i) => { setInfo(i); setOwner(i.ownerUserId ? String(i.ownerUserId) : ''); setLead(i.leadDays) }).catch((e) => setMsg(errText(e)))
  }, [])
  async function save() {
    try {
      const i = await schedApi.setOwner(owner ? Number(owner) : null, lead)
      setInfo(i)
      setMsg('Сохранено')
    } catch (e) { setMsg(errText(e)) }
  }
  return (
    <div className="owner-card">
      <div>
        <strong>Ответственная за расписание</strong>
        <small>Только она (и супер-админ) видит заявки сотрудников, график и выдаёт им доступ.</small>
      </div>
      <select className="ext-input" style={{ maxWidth: 260 }} value={owner} onChange={(e) => setOwner(e.target.value)}>
        <option value="">— никто —</option>
        {info?.candidates.map((c) => <option key={c.id} value={c.id}>{c.fullName} ({c.role === 'DIRECTOR' ? 'директор' : 'менеджер'})</option>)}
      </select>
      <label className="ext-check">заявки за <input className="ext-input" type="number" min={0} max={30} value={lead} onChange={(e) => setLead(Number(e.target.value))} style={{ width: 64, flex: 'none', minHeight: 36 }} /> дн.</label>
      <button className="ext-btn primary" onClick={() => void save()}>Сохранить</button>
      {msg && <span className="muted-s">{msg}</span>}
    </div>
  )
}