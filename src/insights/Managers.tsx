import { useState } from 'react'
import { ins } from './api'
import type { Row } from './api'
import { useIns } from './ctx'
import { Avatar, Card, PctBar, Pill, ScoreParts, State, Table } from './ui'
import { ABSENCE, fmt, num, useAsync } from './utils'

export default function Managers() {
  const { f, openManager, compareWith } = useIns()
  const s = useAsync(() => ins.managers(f), [f.from, f.to, f.outletId])
  const a = useAsync(() => ins.attendance(f), [f.from, f.to, f.outletId])
  const [sel, setSel] = useState<number[]>([])
  const toggle = (id: number) => setSel(x => (x.includes(id) ? x.filter(i => i !== id) : x.length < 6 ? [...x, id] : x))

  return (
    <div className="ins-stack">
      <State s={s} empty={d => !d.managers.length}>
        {d => (
          <Card
            title="Менеджеры"
            sub="клик по строке — карточка; галочки — выбрать для сравнения (2–6)"
            right={<button className="ins-btn primary" disabled={sel.length < 2} onClick={() => compareWith(sel)}>Сравнить{sel.length ? ` (${sel.length})` : ''}</button>}
            pad={false}
          >
            <Table<Row>
              rows={d.managers}
              sortKey="score_avg"
              onRow={r => openManager(num(r.user_id))}
              cols={[
                { key: 'sel', title: '', width: 36, render: r => (
                  <input type="checkbox" checked={sel.includes(num(r.user_id))}
                         onClick={e => e.stopPropagation()} onChange={() => toggle(num(r.user_id))} />
                ) },
                { key: 'rank', title: '#', width: 40, sort: r => -num(r.rank), render: r => <span className="ins-rank">{r.rank}</span> },
                { key: 'full_name', title: 'Менеджер', sort: r => r.full_name, render: r => (
                  <span className="ins-who"><Avatar name={r.full_name} size={28} />{r.full_name}{!r.active && <Pill>неактивен</Pill>}</span>
                ) },
                { key: 'shifts', title: 'Смен', align: 'right', sort: r => num(r.shifts), render: r => <span title={`утро ${r.morning} · вечер ${r.evening}`}>{r.shifts}</span> },
                { key: 'score_avg', title: 'Балл / смена', align: 'right', sort: r => num(r.score_avg), render: r => <b>{fmt(r.score_avg, 1)}</b> },
                { key: 'score_total', title: 'Σ баллов', align: 'right', sort: r => num(r.score_total) },
                { key: 'parts', title: 'За что баллы', width: 190, render: r => <ScoreParts parts={r.score_parts} compact /> },
                { key: 'completion_pct', title: 'Выполнено', sort: r => num(r.completion_pct), render: r => <PctBar v={r.completion_pct} /> },
                { key: 'on_time_pct', title: 'Вовремя', sort: r => num(r.on_time_pct), render: r => <PctBar v={r.on_time_pct} good={80} warn={60} /> },
                { key: 'bad', title: 'Не сделал', align: 'right', sort: r => num(r.items_skipped) + num(r.items_not_done) + num(r.items_problem),
                  render: r => { const n = num(r.items_skipped) + num(r.items_not_done) + num(r.items_problem); return n ? <span className="ins-neg">{n}</span> : '—' } },
                { key: 'flags_confirmed', title: 'Флаги', align: 'right', sort: r => num(r.flags_confirmed),
                  render: r => num(r.flags_confirmed) ? <Pill kind="bad">{r.flags_confirmed}</Pill> : '—' },
                { key: 'photos', title: 'Фото', align: 'right', sort: r => num(r.photos) },
                { key: 'logins', title: 'Входы', align: 'right', sort: r => num(r.logins) },
                { key: 'inventories', title: 'Инвент.', align: 'right', sort: r => num(r.inventories), render: r => num(r.inventories) ? `${r.inventories} (${r.inventory_lines} стр.)` : '—' },
              ]}
            />
          </Card>
        )}
      </State>

      <State s={a} empty={d => !d.people.length && !d.absences.length}>
        {d => (
          <div className="ins-grid g-2-1">
            <Card title="Выходы по графику" sub="план — опубликованные смены; факт — открытая смена на той же точке и в ту же часть дня" pad={false}>
              <Table<Row> rows={d.people} sortKey="missed" onRow={r => openManager(num(r.user_id))} cols={[
                { key: 'full_name', title: 'Менеджер', sort: r => r.full_name },
                { key: 'planned', title: 'План', align: 'right', sort: r => num(r.planned) },
                { key: 'worked', title: 'Вышел', align: 'right', sort: r => num(r.worked) },
                { key: 'missed', title: 'Не вышел', align: 'right', sort: r => num(r.missed), render: r => num(r.missed) ? <Pill kind="bad">{r.missed}</Pill> : <Pill kind="good">0</Pill> },
                { key: 'middle', title: 'Промеж', align: 'right', render: r => `${r.middle_worked}/${r.middle_planned}` },
                { key: 'unplanned', title: 'Вне графика', align: 'right', sort: r => num(r.unplanned), render: r => num(r.unplanned) ? <Pill kind="warn">{r.unplanned}</Pill> : '—' },
              ]} />
            </Card>
            <Card title="Больничные и отпуска" sub="дней в периоде" pad={false}>
              <Table<Row> rows={d.absences} sortKey="days" cols={[
                { key: 'full_name', title: 'Менеджер' },
                { key: 'kind', title: 'Тип', render: r => ABSENCE[r.kind] ?? r.kind },
                { key: 'days', title: 'Дней', align: 'right', sort: r => num(r.days) },
              ]} empty="Отсутствий нет" />
            </Card>
          </div>
        )}
      </State>
    </div>
  )
}
