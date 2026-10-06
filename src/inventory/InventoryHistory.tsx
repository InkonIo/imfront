import { useEffect, useState } from 'react'
import { StatusPill, errorText } from '../admin/ui'
import { inventoryApi } from './api'
import InventoryPage from './InventoryPage'
import type { InvSummary } from './types'
import './inventory.css'

const iso = (d: Date) => d.toLocaleDateString('en-CA')
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000))

export default function InventoryHistory() {
  const [from, setFrom] = useState(() => daysAgo(7))
  const [to, setTo] = useState(() => iso(new Date()))
  const [rows, setRows] = useState<InvSummary[] | null>(null)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    inventoryApi
      .list(from, to)
      .then((r) => {
        if (cancelled) return
        setRows(r)
        setError('')
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err))
      })
    return () => {
      cancelled = true
    }
  }, [from, to, openId])

  if (openId !== null) return <InventoryPage countId={openId} onBack={() => setOpenId(null)} />

  return (
    <div className="page">
      <div className="toolbar">
        <label className="inv-date">
          с <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </label>
        <label className="inv-date">
          по <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </label>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="panel table-panel">
        {rows === null ? (
          <div className="table-state muted">Загрузка…</div>
        ) : rows.length === 0 ? (
          <div className="table-state muted">За этот период инвентаризаций нет</div>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Лист</th>
                  <th>Точка</th>
                  <th>Считал</th>
                  <th>Заполнено</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="inv-row" onClick={() => setOpenId(r.id)}>
                    <td className="strong">{r.date.split('-').reverse().join('.')}</td>
                    <td>{r.listTitle}</td>
                    <td>{r.outletName}</td>
                    <td>{r.userName}</td>
                    <td>
                      {r.filled}/{r.total}
                      {r.recounted > 0 && <span className="pill warn inv-pill">⚠ {r.recounted}</span>}
                    </td>
                    <td>
                      <StatusPill active={r.status === 'SUBMITTED'} on="Сдано" off="Черновик" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="muted small">⚠ — сколько позиций сильно отличались от прошлого раза и были пересчитаны.</p>
    </div>
  )
}