import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ins } from './api'
import type { Row } from './api'
import { useIns } from './ctx'
import { Card, Kpi, Modal, Pill, State, Table, axis, tip } from './ui'
import { fmt, fullDate, num, shortDate, useAsync } from './utils'

export default function Inventory() {
  const { f, openCount, openManager, openProduct } = useIns()
  const c = useAsync(() => ins.invCounts(f, undefined, 200), [f.from, f.to, f.outletId])
  const p = useAsync(() => ins.invProducts(f), [f.from, f.to, f.outletId])
  return (
    <div className="ins-stack">
      <State s={c} empty={d => !d.counts.length}>
        {d => {
          const rows: Row[] = d.counts
          const done = rows.filter(r => r.submitted_at)
          const anomalies = rows.reduce((a, r) => a + num(r.anomalies), 0)
          const avgMin = done.length ? Math.round(done.reduce((a, r) => a + num(r.minutes), 0) / done.length) : null
          return (
            <>
              <div className="ins-kpis small">
                <Kpi label="Инвентаризаций" value={fmt(rows.length)} hint={`${done.length} отправлено`} />
                <Kpi label="Заполнено строк" value={fmt(rows.reduce((a, r) => a + num(r.lines_filled), 0))} hint={`из ${fmt(rows.reduce((a, r) => a + num(r.lines_total), 0))}`} />
                <Kpi label="Аномалий" value={fmt(anomalies)} tone={anomalies ? 'warn' : 'good'} hint="резкие скачки к прошлому разу" />
                <Kpi label="Среднее время" value={avgMin != null ? `${avgMin} мин` : '—'} />
              </div>
              <Card title="Кто и когда считал" sub="клик — построчно по каждому товару" pad={false}>
                <Table<Row> rows={rows} sortKey="count_date" onRow={r => openCount(num(r.count_id))} cols={[
                  { key: 'count_date', title: 'Дата', sort: r => r.count_date + String(r.count_id).padStart(9, '0'), render: r => fullDate(r.count_date) },
                  { key: 'outlet', title: 'Точка', sort: r => r.outlet },
                  { key: 'full_name', title: 'Кто считал', sort: r => r.full_name, render: r => <button className="ins-link" onClick={e => { e.stopPropagation(); openManager(num(r.user_id)) }}>{r.full_name}</button> },
                  { key: 'status', title: 'Статус' },
                  { key: 'lines', title: 'Заполнено', align: 'right', sort: r => num(r.lines_filled) / Math.max(1, num(r.lines_total)), render: r => `${r.lines_filled}/${r.lines_total}` },
                  { key: 'lines_confirmed', title: 'Подтв.', align: 'right', sort: r => num(r.lines_confirmed) },
                  { key: 'total_units', title: 'Σ единиц', align: 'right', sort: r => num(r.total_units), render: r => fmt(r.total_units) },
                  { key: 'minutes', title: 'Время', align: 'right', sort: r => num(r.minutes), render: r => (r.minutes != null ? `${r.minutes} м` : '—') },
                  { key: 'anomalies', title: 'Аномалии', align: 'right', sort: r => num(r.anomalies), render: r => (num(r.anomalies) ? <Pill kind="warn">{r.anomalies}</Pill> : '—') },
                ]} />
              </Card>
            </>
          )
        }}
      </State>
      <State s={p} empty={d => !d.products.length}>
        {d => (
          <Card title="Товары" sub="клик — кто и сколько насчитал по дням" pad={false}>
            <Table<Row> rows={d.products} sortKey="anomalies" max={25} onRow={r => openProduct(num(r.product_id), r.name)} cols={[
              { key: 'name', title: 'Товар', sort: r => r.name },
              { key: 'records', title: 'Замеров', align: 'right', sort: r => num(r.records) },
              { key: 'last_total', title: 'Последний', align: 'right', render: r => <span title={r.last_date}>{fmt(r.last_total, 1)} {r.unit}</span> },
              { key: 'avg_total', title: 'Среднее', align: 'right', sort: r => num(r.avg_total), render: r => fmt(r.avg_total, 1) },
              { key: 'min_total', title: 'Мин', align: 'right', render: r => fmt(r.min_total, 1) },
              { key: 'max_total', title: 'Макс', align: 'right', render: r => fmt(r.max_total, 1) },
              { key: 'stddev', title: 'Разброс σ', align: 'right', sort: r => num(r.stddev), render: r => fmt(r.stddev, 1) },
              { key: 'counters', title: 'Считали', align: 'right', render: r => `${r.counters} чел.` },
              { key: 'anomalies', title: 'Аномалии', align: 'right', sort: r => num(r.anomalies), render: r => (num(r.anomalies) ? <Pill kind="warn">{r.anomalies}</Pill> : '—') },
            ]} />
          </Card>
        )}
      </State>
    </div>
  )
}

export function ProductModal({ id, name, onClose }: { id: number; name: string; onClose: () => void }) {
  const { f, openManager, openCount } = useIns()
  const s = useAsync(() => ins.invProduct(id, f), [id, f.from, f.to, f.outletId])
  return (
    <Modal wide title={name} sub="история замеров за выбранный период" onClose={onClose}>
      <State s={s} empty={d => !d.history.length}>
        {d => {
          const h: Row[] = [...d.history].reverse().map(r => ({ ...r, total: r.none_flag ? 0 : r.total }))
          return (
            <div className="ins-stack">
              <Card title="Остаток по дням" sub="красные точки — аномальные скачки">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={h} margin={{ left: -16, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} stroke="var(--ins-line)" />
                    <XAxis dataKey="count_date" tickFormatter={shortDate} {...axis} />
                    <YAxis {...axis} />
                    <Tooltip {...tip} labelFormatter={l => fullDate(String(l))} />
                    <Line dataKey="total" name="Итого" stroke="#fcb614" strokeWidth={3} dot={{ r: 3 }} />
                    {h.filter(r => r.anomaly).map(r => <ReferenceDot key={r.count_id} x={r.count_date} y={num(r.total)} r={6} fill="#e52723" stroke="#fff" />)}
                  </LineChart>
                </ResponsiveContainer>
              </Card>
              <Card pad={false}>
                <Table<Row> rows={[...h].reverse()} sortKey="" onRow={r => { onClose(); openCount(num(r.count_id)) }} cols={[
                  { key: 'count_date', title: 'Дата', render: r => fullDate(r.count_date) },
                  { key: 'outlet', title: 'Точка' },
                  { key: 'full_name', title: 'Кто', render: r => <button className="ins-link" onClick={e => { e.stopPropagation(); onClose(); openManager(num(r.user_id)) }}>{r.full_name}</button> },
                  { key: 'cs', title: 'Ящ.', align: 'right', render: r => fmt(r.cs, 1) },
                  { key: 'slv', title: 'Рук.', align: 'right', render: r => fmt(r.slv, 1) },
                  { key: 'ea', title: 'Шт.', align: 'right', render: r => fmt(r.ea, 1) },
                  { key: 'total', title: 'Итого', align: 'right', render: r => <b>{fmt(r.total, 1)}</b> },
                  { key: 'diff', title: 'Δ к прошлому', align: 'right', render: r => r.diff == null ? '—' : <span>{num(r.diff) > 0 ? '+' : ''}{fmt(r.diff, 1)}</span> },
                  { key: 'anomaly', title: '', render: r => (r.anomaly ? <Pill kind="warn">аномалия</Pill> : '') },
                ]} />
              </Card>
            </div>
          )
        }}
      </State>
    </Modal>
  )
}
