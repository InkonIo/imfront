import { useState } from 'react'
import AuditPage from './AuditPage'
import ShiftsReport from './ShiftsReport'

type Tab = 'shifts' | 'log'

export default function AuditHub() {
  const [tab, setTab] = useState<Tab>('shifts')
  const [logShift, setLogShift] = useState<number | null>(null)

  return (
    <div className="page">
      <div className="filter-tabs">
        <button className={tab === 'shifts' ? 'tab active' : 'tab'} onClick={() => setTab('shifts')}>
          🗓️ Смены
        </button>
        <button
          className={tab === 'log' ? 'tab active' : 'tab'}
          onClick={() => {
            setLogShift(null)
            setTab('log')
          }}
        >
          📜 Журнал
        </button>
      </div>

      {tab === 'shifts' ? (
        <ShiftsReport
          onOpenLog={(id) => {
            setLogShift(id)
            setTab('log')
          }}
        />
      ) : (
        <AuditPage key={logShift ?? 'all'} initialShiftId={logShift} />
      )}
    </div>
  )
}