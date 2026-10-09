import { useCallback, useEffect, useState } from 'react'
import { extApi } from './api'
import type { ExtList } from './api'
import ExtSchedule from './ExtSchedule'
import ExtAnalytics from './ExtAnalytics'
import './ext.css'

const DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

function workDays(raw: string | null): string {
  if (!raw) return '—'
  try {
    const a = JSON.parse(raw) as number[]
    return [1, 2, 3, 4, 5, 6, 0].filter((d) => a.includes(d)).map((d) => DAYS[d]).join(' ')
  } catch {
    return '—'
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export default function ExtEmployeesPage() {
  const [data, setData] = useState<ExtList | null>(null)
  const [q, setQ] = useState('')
  const [branch, setBranch] = useState<number | null>(null)
  const [fired, setFired] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [tab, setTab] = useState<'staff' | 'schedule' | 'analytics'>('staff')

  const load = useCallback(async () => {
    try {
      setData(await extApi.list(q, branch, fired))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    }
  }, [q, branch, fired])

  useEffect(() => {
    const t = setTimeout(() => void load(), 200)
    return () => clearTimeout(t)
  }, [load])

  async function sync() {
    setBusy(true)
    setNote('')
    setError('')
    try {
      const r = await extApi.sync()
      setNote(`Готово: обновлено ${r.saved}, всего сотрудников ${r.total}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const rows = data?.employees ?? []
  const synced = data?.syncedAt ? new Date(data.syncedAt).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' }) : null

  return (
    <div className="ext">
      <div className="ext-tabs">
        <button className={tab === 'staff' ? 'ext-tab on' : 'ext-tab'} onClick={() => setTab('staff')}>Сотрудники</button>
        <button className={tab === 'schedule' ? 'ext-tab on' : 'ext-tab'} onClick={() => setTab('schedule')}>График</button>
        <button className={tab === 'analytics' ? 'ext-tab on' : 'ext-tab'} onClick={() => setTab('analytics')}>Аналитика</button>
      </div>
      {tab === 'schedule' && <ExtSchedule branchId={branch} />}
      {tab === 'analytics' && <ExtAnalytics branchId={branch} />}
      {tab === 'staff' && (<>
      <div className="ext-top">
        <input className="ext-input" type="search" placeholder="Поиск по имени или телефону" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="ext-input" value={branch ?? ''} onChange={(e) => setBranch(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Все филиалы</option>
          {data?.branches.map((b) => (
            <option key={b.id} value={b.id}>{b.title} ({b.active})</option>
          ))}
        </select>
        <label className="ext-check">
          <input type="checkbox" checked={fired} onChange={(e) => setFired(e.target.checked)} /> с уволенными
        </label>
        <button className="ext-btn primary" onClick={() => void sync()} disabled={busy}>
          {busy ? 'Синхронизируем…' : '⟳ Синхронизировать с Таймтрекером'}
        </button>
      </div>

      <div className="ext-meta">
        <span>{rows.length} чел.</span>
        <span>{synced ? `Обновлено: ${synced}` : 'Ещё не синхронизировали'}</span>
      </div>

      {error && <div className="ext-msg err">{error}</div>}
      {note && <div className="ext-msg ok">{note}</div>}

      <div className="ext-wrap">
        <table className="ext-table">
          <thead>
            <tr><th>Сотрудник</th><th>Должность</th><th>Филиал</th><th>Телефон</th><th>График</th><th>Принят</th></tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className={e.isFired ? 'fired' : ''}>
                <td>
                  <strong>{e.fullName}</strong>
                  {e.isFired && <span className="ext-tag">уволен {fmtDate(e.firedDate)}</span>}
                  {e.isRegistered === false && !e.isFired && <span className="ext-tag warn">не в приложении</span>}
                </td>
                <td>{e.position ?? '—'}</td>
                <td>{e.branch ?? '—'}</td>
                <td>{e.phone ?? '—'}</td>
                <td>{workDays(e.workDays)}</td>
                <td>{fmtDate(e.hiredDate)}</td>
              </tr>
            ))}
            {data && rows.length === 0 && (
              <tr><td colSpan={6} className="ext-empty">Пусто. Нажми «Синхронизировать».</td></tr>
            )}
          </tbody>
        </table>
      </div>
      </>)}
    </div>
  )
}
