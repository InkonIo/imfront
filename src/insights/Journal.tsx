import { useEffect, useState } from 'react'
import { ins } from './api'
import type { Row } from './api'
import { useIns } from './ctx'
import { Card, Pill, State, Table } from './ui'
import { dt, num, useAsync } from './utils'

const PAGE = 50

export default function Journal() {
  const { f, openShift, openManager } = useIns()
  const [type, setType] = useState('')
  const [uid, setUid] = useState('')
  const [page, setPage] = useState(0)
  useEffect(() => setPage(0), [type, uid, f.from, f.to, f.outletId])
  const people = useAsync(() => ins.managers(f), [f.from, f.to, f.outletId])
  const s = useAsync(
    () => ins.events(f, { userId: uid ? Number(uid) : undefined, type: type || undefined, limit: PAGE, offset: page * PAGE }),
    [f.from, f.to, f.outletId, type, uid, page],
  )
  return (
    <Card title="Журнал действий" sub="всё, что система записала в audit_event: входы, отметки пунктов, фото, проверки" pad={false}
          right={
            <div className="ins-filters inline">
              <select className="ins-input" value={uid} onChange={e => setUid(e.target.value)}>
                <option value="">Все менеджеры</option>
                {(people.data?.people as Row[] | undefined)?.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
          }>
      <State s={s}>
        {d => (
          <>
            <div className="ins-chips pad">
              <button className={`ins-chip ${!type ? 'on' : ''}`} onClick={() => setType('')}>Все</button>
              {(d.types as Row[]).map(t => (
                <button key={t.type} className={`ins-chip ${type === t.type ? 'on' : ''}`} onClick={() => setType(type === t.type ? '' : t.type)}>
                  {t.type} <small>{t.n}</small>
                </button>
              ))}
            </div>
            <Table<Row> rows={d.events} sortKey="" empty="Событий нет" onRow={r => r.shift_id && openShift(num(r.shift_id))} cols={[
              { key: 'at', title: 'Когда', render: r => dt(r.at), width: 120 },
              { key: 'type', title: 'Событие', render: r => <Pill>{r.type}</Pill> },
              { key: 'user_login', title: 'Кто', render: r => r.user_id ? <button className="ins-link" onClick={e => { e.stopPropagation(); openManager(num(r.user_id)) }}>{r.user_login}</button> : '—' },
              { key: 'outlet', title: 'Точка' },
              { key: 'details', title: 'Детали' },
              { key: 'device_id', title: 'Устройство', render: r => (r.device_id ? String(r.device_id).slice(0, 8) : '—') },
              { key: 'ip', title: 'IP' },
            ]} />
            <div className="ins-pager">
              <button className="ins-btn" disabled={page === 0} onClick={() => setPage(page - 1)}>← Новее</button>
              <span>стр. {page + 1}</span>
              <button className="ins-btn" disabled={d.events.length < PAGE} onClick={() => setPage(page + 1)}>Старее →</button>
            </div>
          </>
        )}
      </State>
    </Card>
  )
}
