import { useEffect, useState } from 'react'
import { errorText } from '../admin/ui'
import { ins } from '../insights/api'
import type { Row } from '../insights/api'
import '../inventory/inventory.css'
import { sheetApi } from './api'
import type { SheetListRow } from './api'
import ShiftSheetPage from './ShiftSheetPage'

const iso = (d: Date) => d.toLocaleDateString('en-CA')
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000))
const ru = (d: string) => d.split('-').reverse().join('.')

/** Архив чек-листов смены: выбираешь даты и точку, клик открывает тот же бланк в режиме просмотра. */
export default function SheetArchive() {
  const [from, setFrom] = useState(() => daysAgo(7))
  const [to, setTo] = useState(() => iso(new Date()))
  const [outletId, setOutletId] = useState('')
  const [outlets, setOutlets] = useState<Row[]>([])
  const [rows, setRows] = useState<SheetListRow[] | null>(null)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)

  useEffect(() => {
    ins.outlets().then(setOutlets).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    sheetApi
      .list(from, to, outletId)
      .then((r) => {
        if (cancelled) return
        setRows(r)
        setError('')
      })
      .catch((err) => {
        if (cancelled) return
        setRows([])
        setError(errorText(err))
      })
    return () => {
      cancelled = true
    }
  }, [from, to, outletId])

  if (openId !== null) {
    return (
      <div>
        <div className="page">
          <button className="btn small" onClick={() => setOpenId(null)}>
            ← К архиву
          </button>
        </div>
        <ShiftSheetPage sheetId={openId} readOnly />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="toolbar">
        <label className="inv-date">
          с <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </label>
        <label className="inv-date">
          по <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </label>
        <select value={outletId} onChange={(e) => setOutletId(e.target.value)}>
          <option value="">Все точки</option>
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="panel table-panel">
        {rows === null ? (
          <div className="table-state muted">Загрузка…</div>
        ) : rows.length === 0 ? (
          <div className="table-state muted">За этот период бланков нет</div>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Точка</th>
                  <th>Утро</th>
                  <th>Вечер</th>
                  <th>Галочек</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="inv-row" onClick={() => setOpenId(r.id)}>
                    <td className="strong">{ru(r.date)}</td>
                    <td>{r.outletName}</td>
                    <td>{r.morningName || '—'}</td>
                    <td>{r.eveningName || '—'}</td>
                    <td>{r.ticks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="muted small">Клик по строке открывает бланк этого дня. Править его в архиве нельзя.</p>
    </div>
  )
}