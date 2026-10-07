import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ins } from './api'
import type { Row } from './api'
import { useIns } from './ctx'
import { Card, Kpi, Modal, Pill, State, Table, axis, tip } from './ui'
import { DAY_PART, FLAG, ITEM_STATUS, REVIEW, ROLE, dt, fmt, fullDate, hhmm, mins, num, pct, tone, useAsync } from './utils'

const ST: Record<string, string> = { DONE: 'good', PENDING: 'bad', SKIPPED: 'warn', PROBLEM: 'bad' }
const SEV: Record<string, string> = { HIGH: 'bad', MEDIUM: 'warn', LOW: 'mute' }

export function ShiftModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { openCount, openManager } = useIns()
  const s = useAsync(() => ins.shift(id), [id])
  const [only, setOnly] = useState(false)
  return (
    <Modal wide onClose={onClose}
      title={s.data ? <>Смена {fullDate(s.data.shift.shift_date)} · {DAY_PART[s.data.shift.day_part]}</> : 'Смена'}
      sub={s.data && <><button className="ins-link" onClick={() => { onClose(); openManager(num(s.data!.shift.user_id)) }}>{s.data.shift.full_name}</button> · {ROLE[s.data.shift.shift_role] ?? s.data.shift.shift_role} · {s.data.shift.outlet} · {hhmm(s.data.shift.started_at)}–{s.data.shift.finished_at ? hhmm(s.data.shift.finished_at) : 'идёт'}</>}>
      <State s={s}>
        {d => {
          const m = d.metrics
          const items: Row[] = only ? d.items.filter((i: Row) => i.status !== 'DONE') : d.items
          return (
            <div className="ins-stack">
              {m.shift_id && (
                <div className="ins-kpis small">
                  <Kpi label="Балл" value={fmt(m.score)} />
                  <Kpi label="Выполнено" value={pct(m.completion_pct)} tone={tone(m.completion_pct)} hint={`${m.items_done}/${m.items_total}`} />
                  <Kpi label="Вовремя" value={pct(m.on_time_pct)} tone={tone(m.on_time_pct, 80, 60)} />
                  <Kpi label="В системе" value={mins(m.active_min)} hint={`смена ${mins(m.duration_min)}`} />
                  <Kpi label="Флаги" value={fmt(m.flags_total)} hint={`${m.flags_confirmed} подтв.`} deltaGoodUp={false} />
                  <Kpi label="Фото" value={fmt(m.photos_total)} />
                </div>
              )}
              <Card title="Пункты чек-листа" pad={false}
                    right={<label className="ins-check"><input type="checkbox" checked={only} onChange={e => setOnly(e.target.checked)} /> только проблемные</label>}>
                <Table<Row> rows={items} sortKey="" cols={[
                  { key: 'section_title', title: 'Раздел', width: 150, className: () => 'ins-mute' },
                  { key: 'title', title: 'Пункт', render: r => <span title={r.comment}>{r.title}{r.comment && <em className="ins-note"> 💬 {r.comment}</em>}</span> },
                  { key: 'status', title: 'Статус', render: r => <Pill kind={ST[r.status]}>{ITEM_STATUS[r.status] ?? r.status}</Pill> },
                  { key: 'due', title: 'Срок', render: r => r.due_to ? `${r.due_from ?? ''}–${r.due_to}` : '—' },
                  { key: 'done', title: 'Сделал в', align: 'right', render: r => r.done_time ?? '—' },
                  { key: 'min', title: 'План/факт', align: 'right', render: r => `${r.planned_min ?? '—'} / ${r.actual_min ?? '—'}` },
                  { key: 'photos', title: 'Фото', align: 'right', render: r => num(r.photos) || '—' },
                  { key: 'flags', title: 'Флаги', render: r => r.flags ? String(r.flags).split(', ').map((x: string) => { const [t, sv, st] = x.split(':'); return <Pill key={x} kind={SEV[sv]} title={REVIEW[st]}>{FLAG[t] ?? t}</Pill> }) : '' },
                  { key: 'rev', title: 'Директор', render: r => r.review_decision ? <span title={`${r.reviewer_login ?? ''} ${r.review_comment ?? ''}`}><Pill kind={r.review_decision === 'APPROVED' ? 'good' : 'bad'}>{r.review_decision === 'APPROVED' ? 'одобрено' : 'отклонено'}</Pill></span> : (r.director_review ? <span className="ins-mute">нужна</span> : '') },
                ]} />
              </Card>

              <div className="ins-grid g-1-1">
                <Card title="Активность по часам" sub="минуты, когда человек был в системе">
                  {d.activityHourly.length ? (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={d.activityHourly} margin={{ left: -20 }}>
                        <CartesianGrid vertical={false} stroke="var(--ins-line)" />
                        <XAxis dataKey="hour" {...axis} />
                        <YAxis {...axis} domain={[0, 60]} />
                        <Tooltip {...tip} />
                        <Bar dataKey="minutes" name="Минут" fill="#fcb614" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <div className="ins-empty">Нет данных об активности</div>}
                  <div className="ins-sub">Всего {fmt(d.activity.active_minutes)} мин · устройств: {fmt(d.activity.devices)} · первая активность {hhmm(d.activity.first_at)}, последняя {hhmm(d.activity.last_at)}</div>
                </Card>
                <Card title="Флаги смены" pad={false}>
                  <Table<Row> rows={d.flags} sortKey="" empty="Флагов нет" cols={[
                    { key: 'at', title: 'Когда', render: r => hhmm(r.at) },
                    { key: 'type', title: 'Флаг', render: r => <Pill kind={SEV[r.severity]} title={r.details}>{FLAG[r.type] ?? r.type}</Pill> },
                    { key: 'item_title', title: 'Пункт' },
                    { key: 'review_status', title: 'Статус', render: r => <span title={r.review_comment}>{REVIEW[r.review_status]}{r.reviewed_by ? ` · ${r.reviewed_by}` : ''}</span> },
                  ]} />
                </Card>
              </div>

              {d.inventories.length > 0 && (
                <Card title="Инвентаризация в этой смене" pad={false}>
                  <Table<Row> rows={d.inventories} sortKey="" onRow={r => openCount(num(r.count_id))} cols={[
                    { key: 'count_id', title: '№' },
                    { key: 'status', title: 'Статус' },
                    { key: 'lines', title: 'Заполнено', render: r => `${r.lines_filled}/${r.lines_total}` },
                    { key: 'anomalies', title: 'Аномалии', render: r => num(r.anomalies) ? <Pill kind="warn">{r.anomalies}</Pill> : '—' },
                    { key: 'submitted_at', title: 'Отправлена', render: r => dt(r.submitted_at) },
                  ]} />
                </Card>
              )}

              <Card title="Журнал действий смены" pad={false}>
                <Table<Row> rows={d.events} sortKey="" max={12} empty="Событий нет" cols={[
                  { key: 'at', title: 'Время', width: 70, render: r => hhmm(r.at) },
                  { key: 'type', title: 'Событие', render: r => <Pill>{r.type}</Pill> },
                  { key: 'details', title: 'Детали' },
                  { key: 'device_id', title: 'Устройство', render: r => r.device_id ? String(r.device_id).slice(0, 8) : '—' },
                  { key: 'ip', title: 'IP' },
                ]} />
              </Card>
            </div>
          )
        }}
      </State>
    </Modal>
  )
}

export function CountModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { openManager, openProduct } = useIns()
  const s = useAsync(() => ins.invCount(id), [id])
  const [q, setQ] = useState('')
  const [bad, setBad] = useState(false)
  const lines = useMemo<Row[]>(() => {
    const L: Row[] = s.data?.lines ?? []
    return L.filter(l => (!bad || l.anomaly) && (!q || String(l.product).toLowerCase().includes(q.toLowerCase())))
  }, [s.data, q, bad])
  return (
    <Modal wide onClose={onClose}
      title={s.data ? <>Инвентаризация {fullDate(s.data.count.count_date)}</> : 'Инвентаризация'}
      sub={s.data && <><button className="ins-link" onClick={() => { onClose(); openManager(num(s.data!.count.user_id)) }}>{s.data.count.full_name}</button> · {s.data.count.outlet} · {s.data.count.status} · {s.data.count.minutes != null ? `заняла ${mins(s.data.count.minutes)}` : 'не отправлена'}</>}>
      <State s={s}>
        {d => (
          <div className="ins-stack">
            <div className="ins-filters inline">
              <input className="ins-input" placeholder="Найти товар…" value={q} onChange={e => setQ(e.target.value)} />
              <label className="ins-check"><input type="checkbox" checked={bad} onChange={e => setBad(e.target.checked)} /> только аномалии</label>
              <span className="ins-sub">{lines.length} из {d.lines.length} позиций</span>
            </div>
            <Table<Row> rows={lines} sortKey="" rowClass={r => (r.anomaly ? 'is-anom' : '')} cols={[
              { key: 'zone', title: 'Зона', sort: r => r.zone, className: () => 'ins-mute' },
              { key: 'product', title: 'Товар', sort: r => r.product, render: r => <button className="ins-link" onClick={() => openProduct(num(r.product_id), r.product)}>{r.product}</button> },
              { key: 'cs', title: 'Ящ.', align: 'right', render: r => fmt(r.cs, 1) },
              { key: 'slv', title: 'Рук.', align: 'right', render: r => fmt(r.slv, 1) },
              { key: 'ea', title: 'Шт.', align: 'right', render: r => fmt(r.ea, 1) },
              { key: 'total', title: 'Итого', align: 'right', sort: r => num(r.total), render: r => r.none_flag ? <span className="ins-mute">нет</span> : <b>{fmt(r.total, 1)}</b> },
              { key: 'prev_total', title: 'Прошлый раз', align: 'right', render: r => r.prev_total != null ? <span title={r.prev_date}>{fmt(r.prev_total, 1)}</span> : '—' },
              { key: 'diff', title: 'Δ', align: 'right', sort: r => Math.abs(num(r.diff)), render: r => r.diff == null ? '—' : <span>{num(r.diff) > 0 ? '+' : ''}{fmt(r.diff, 1)}{r.diff_pct != null && <small> ({r.diff_pct}%)</small>}</span> },
              { key: 'confirmed', title: '✓', align: 'center', render: r => r.confirmed ? '✓' : '' },
              { key: 'anomaly', title: '', render: r => r.anomaly ? <Pill kind="warn">аномалия</Pill> : '' },
            ]} />
          </div>
        )}
      </State>
    </Modal>
  )
}
