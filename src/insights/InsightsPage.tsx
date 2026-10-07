import { useMemo, useState } from 'react'
import './insights.css'
import { ins } from './api'
import type { Filters } from './api'
import { Ctx } from './ctx'
import { Tabs } from './ui'
import { daysAgo, useAsync, ymd } from './utils'
import Overview from './Overview'
import Managers from './Managers'
import ManagerCard from './ManagerCard'
import Compare from './Compare'
import Inventory, { ProductModal } from './Inventory'
import Journal from './Journal'
import { CountModal, ShiftModal } from './ShiftModal'

type Tab = 'overview' | 'managers' | 'card' | 'compare' | 'inventory' | 'journal'
const PRESETS: [string, number][] = [['7 дней', 6], ['14 дней', 13], ['30 дней', 29], ['90 дней', 89]]

/** Аналитика для директора и супер-админа. Подключается одной строкой: <InsightsPage /> */
export default function InsightsPage() {
  const [tab, setTab] = useState<Tab>('overview')
  const [from, setFrom] = useState(daysAgo(29))
  const [to, setTo] = useState(ymd(new Date()))
  const [outletId, setOutletId] = useState('')
  const [mid, setMid] = useState<number | null>(null)
  const [cmp, setCmp] = useState<number[]>([])
  const [shift, setShift] = useState<number | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const [prod, setProd] = useState<{ id: number; name: string } | null>(null)

  const outlets = useAsync(() => ins.outlets(), [])
  const f: Filters = useMemo(() => ({ from, to, outletId }), [from, to, outletId])
  const ctx = useMemo(() => ({
    f,
    outlets: outlets.data ?? [],
    openManager: (id: number) => { setShift(null); setCount(null); setProd(null); setMid(id); setTab('card') },
    openShift: setShift,
    openCount: setCount,
    openProduct: (id: number, name: string) => setProd({ id, name }),
    compareWith: (ids: number[]) => { setCmp(ids); setTab('compare') },
  }), [f, outlets.data])

  const preset = PRESETS.find(([, n]) => from === daysAgo(n) && to === ymd(new Date()))?.[0]

  return (
    <Ctx.Provider value={ctx}>
      <div className="ins">
        <header className="ins-top">
          <div>
            <h1>Аналитика</h1>
            <div className="ins-sub">Все цифры берутся из базы: смены, чек-листы, флаги, проверки, инвентаризации, график</div>
          </div>
          <div className="ins-filters">
            <div className="ins-seg">
              {PRESETS.map(([l, n]) => (
                <button key={l} className={preset === l ? 'on' : ''} onClick={() => { setFrom(daysAgo(n)); setTo(ymd(new Date())) }}>{l}</button>
              ))}
            </div>
            <input type="date" className="ins-input" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} />
            <span className="ins-mute">—</span>
            <input type="date" className="ins-input" value={to} min={from} max={ymd(new Date())} onChange={e => e.target.value && setTo(e.target.value)} />
            <select className="ins-input" value={outletId} onChange={e => setOutletId(e.target.value)}>
              <option value="">Все точки</option>
              {(outlets.data ?? []).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        </header>

        <Tabs<Tab> value={tab} onChange={setTab} tabs={[
          ['overview', 'Обзор'], ['managers', 'Менеджеры'], ['card', 'Карточка'],
          ['compare', 'Сравнение'], ['inventory', 'Инвентаризация'], ['journal', 'Журнал'],
        ]} />

        <div className="ins-body">
          {tab === 'overview' && <Overview />}
          {tab === 'managers' && <Managers />}
          {tab === 'card' && (mid ? <ManagerCard id={mid} /> : <div className="ins-empty">Выберите менеджера во вкладке «Менеджеры»</div>)}
          {tab === 'compare' && <Compare ids={cmp} setIds={setCmp} />}
          {tab === 'inventory' && <Inventory />}
          {tab === 'journal' && <Journal />}
        </div>

        {shift != null && <ShiftModal id={shift} onClose={() => setShift(null)} />}
        {count != null && <CountModal id={count} onClose={() => setCount(null)} />}
        {prod && <ProductModal id={prod.id} name={prod.name} onClose={() => setProd(null)} />}
      </div>
    </Ctx.Provider>
  )
}
