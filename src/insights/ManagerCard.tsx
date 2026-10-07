import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ins } from './api'
import type { Row } from './api'
import { useIns } from './ctx'
import { Avatar, Card, Heatmap, Kpi, PART_COLORS, PctBar, Pill, ScoreParts, State, Table, axis, tip } from './ui'
import { ABSENCE, DAY_PART, FLAG, PART_LABEL, REVIEW, ROLE, SERIES, dt, fmt, fullDate, num, pct, shortDate, tone, useAsync } from './utils'

const SEV: Record<string, string> = { HIGH: 'bad', MEDIUM: 'warn', LOW: 'mute' }
const delta = (a: unknown, b: unknown) => (a == null || b == null ? null : num(a) - num(b))

export default function ManagerCard({ id }: { id: number }) {
  const { f, openShift, openCount, compareWith } = useIns()
  const s = useAsync(() => ins.manager(id, f), [id, f.from, f.to, f.outletId])
  const sh = useAsync(() => ins.shifts(f, id, 200), [id, f.from, f.to, f.outletId])
  const ev = useAsync(() => ins.events(f, { userId: id, limit: 40 }), [id, f.from, f.to, f.outletId])

  return (
    <State s={s}>
      {d => {
        const p = d.profile, k = d.kpi, t = d.team
        if (!k) return (
          <div className="ins-stack">
            <Head p={p} rank={null} of={d.rankOf} />
            <div className="ins-empty">У {p.full_name} нет смен за выбранный период{p.last_shift ? ` (последняя — ${fullDate(p.last_shift)})` : ''}</div>
          </div>
        )
        const parts = Object.entries(k.score_parts as Row).map(([key, v]) => ({ key, name: PART_LABEL[key] ?? key, v: num(v) })).filter(x => x.v !== 0)
        const flagTypes = Object.values((d.flags as Row[]).reduce<Record<string, { name: string; HIGH: number; MEDIUM: number; LOW: number }>>((a, x) => {
          a[x.type] ??= { name: FLAG[x.type] ?? x.type, HIGH: 0, MEDIUM: 0, LOW: 0 }
          a[x.type][x.severity as 'HIGH'] += num(x.n)
          return a
        }, {}))
        const prob = (d.problemItems as Row[]).slice(0, 8).map(x => ({
          title: String(x.title).length > 40 ? String(x.title).slice(0, 38) + '…' : String(x.title),
          'Не сделано': num(x.not_done), Пропущено: num(x.skipped), Проблема: num(x.problem),
        }))
        return (
          <div className="ins-stack">
            <Head p={p} rank={d.rank} of={d.rankOf} onCompare={() => compareWith([id])} />

            <div className="ins-kpis">
              <Kpi label="Смен" value={fmt(k.shifts)} hint={`утро ${k.morning} · вечер ${k.evening}`} />
              <Kpi label="Балл / смена" value={fmt(k.score_avg, 1)} delta={delta(k.score_avg, t.score_avg)} hint={`команда ${fmt(t.score_avg, 1)}`} />
              <Kpi label="Выполнено" value={pct(k.completion_pct)} tone={tone(k.completion_pct)} delta={delta(k.completion_pct, t.completion_pct)} hint={`команда ${pct(t.completion_pct)}`} />
              <Kpi label="Вовремя" value={pct(k.on_time_pct)} tone={tone(k.on_time_pct, 80, 60)} delta={delta(k.on_time_pct, t.on_time_pct)} hint={`команда ${pct(t.on_time_pct)}`} />
              <Kpi label="Флаги подтв." value={fmt(k.flags_confirmed)} deltaGoodUp={false} tone={num(k.flags_confirmed) ? 'warn' : 'good'} hint={`${k.flags_open} ждут · ${k.flags_dismissed} сняты`} />
              <Kpi label="В системе" value={k.avg_active_min != null ? `${fmt(k.avg_active_min)} м` : '—'} hint={`из ${fmt(k.avg_duration_min)} м смены`} />
              <Kpi label="Входы" value={fmt(k.logins)} hint={`инвентаризаций: ${k.inventories}`} />
            </div>

            <div className="ins-grid g-2-1">
              <Card title="Динамика по сменам" sub="выполнено и вовремя, %; линия — балл">
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={d.daily} margin={{ left: -16, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} stroke="var(--ins-line)" />
                    <XAxis dataKey="date" tickFormatter={shortDate} {...axis} />
                    <YAxis yAxisId="p" domain={[0, 100]} {...axis} />
                    <YAxis yAxisId="s" orientation="right" hide />
                    <Tooltip {...tip} labelFormatter={shortDate} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="p" dataKey="completion_pct" name="Выполнено %" fill={SERIES[0]} radius={[4, 4, 0, 0]} barSize={12} />
                    <Bar yAxisId="p" dataKey="on_time_pct" name="Вовремя %" fill={SERIES[2]} radius={[4, 4, 0, 0]} barSize={12} />
                    <Line yAxisId="s" dataKey="score_avg" name="Балл" stroke="#fcb614" strokeWidth={3} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>
              <Card title="За что баллы" sub={`итого ${fmt(k.score_total)}`}>
                <ResponsiveContainer width="100%" height={Math.max(200, parts.length * 30)}>
                  <BarChart data={parts} layout="vertical" margin={{ left: 0, right: 16 }}>
                    <CartesianGrid horizontal={false} stroke="var(--ins-line)" />
                    <XAxis type="number" {...axis} />
                    <YAxis type="category" dataKey="name" width={150} {...axis} />
                    <ReferenceLine x={0} stroke="var(--ins-mute)" />
                    <Tooltip {...tip} />
                    <Bar dataKey="v" name="Баллы" radius={4}>
                      {parts.map(x => <Cell key={x.key} fill={PART_COLORS[x.key]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <ScoreParts parts={k.score_parts} compact />
              </Card>
            </div>

            <div className="ins-grid g-1-1">
              <Card title="Нарушения по типам" sub="красный — HIGH, жёлтый — MEDIUM, серый — LOW">
                {flagTypes.length ? (
                  <ResponsiveContainer width="100%" height={Math.max(160, flagTypes.length * 36)}>
                    <BarChart data={flagTypes} layout="vertical" margin={{ left: 0 }}>
                      <CartesianGrid horizontal={false} stroke="var(--ins-line)" />
                      <XAxis type="number" allowDecimals={false} {...axis} />
                      <YAxis type="category" dataKey="name" width={130} {...axis} />
                      <Tooltip {...tip} />
                      <Bar dataKey="HIGH" name="HIGH" stackId="a" fill="#e52723" />
                      <Bar dataKey="MEDIUM" name="MEDIUM" stackId="a" fill="#eda100" />
                      <Bar dataKey="LOW" name="LOW" stackId="a" fill="#a8a79f" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="ins-empty">Нарушений нет 🎉</div>}
              </Card>
              <Card title="Что не делает чаще всего">
                {prob.length ? (
                  <ResponsiveContainer width="100%" height={Math.max(160, prob.length * 32)}>
                    <BarChart data={prob} layout="vertical">
                      <CartesianGrid horizontal={false} stroke="var(--ins-line)" />
                      <XAxis type="number" allowDecimals={false} {...axis} />
                      <YAxis type="category" dataKey="title" width={180} {...axis} />
                      <Tooltip {...tip} />
                      <Bar dataKey="Не сделано" stackId="a" fill="#eb6834" />
                      <Bar dataKey="Пропущено" stackId="a" fill="#eda100" />
                      <Bar dataKey="Проблема" stackId="a" fill="#e52723" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="ins-empty">Всё выполнялось 👍</div>}
              </Card>
            </div>

            <div className="ins-grid g-1-1">
              <Card title="Где и в какую смену" pad={false}>
                <Table<Row> rows={d.byPartRole} sortKey="shifts" cols={[
                  { key: 'p', title: 'Часть', render: r => DAY_PART[r.day_part] },
                  { key: 'r', title: 'Роль', render: r => ROLE[r.shift_role] ?? r.shift_role },
                  { key: 'shifts', title: 'Смен', align: 'right', sort: r => num(r.shifts) },
                  { key: 'score_avg', title: 'Балл', align: 'right', render: r => fmt(r.score_avg, 1), sort: r => num(r.score_avg) },
                  { key: 'c', title: 'Выполн.', render: r => <PctBar v={r.completion_pct} />, sort: r => num(r.completion_pct) },
                ]} />
                <Table<Row> rows={d.byOutlet} sortKey="shifts" cols={[
                  { key: 'outlet', title: 'Точка' },
                  { key: 'shifts', title: 'Смен', align: 'right', sort: r => num(r.shifts) },
                  { key: 'score_avg', title: 'Балл', align: 'right', render: r => fmt(r.score_avg, 1) },
                  { key: 'c', title: 'Выполн.', render: r => <PctBar v={r.completion_pct} /> },
                ]} />
              </Card>
              <Card title="Когда работает в системе" sub="минуты активности, время Алматы">
                <Heatmap cells={d.heatmap} />
                <div className="ins-facts">
                  <span>Последний вход: <b>{dt(p.last_login)}</b></span>
                  {(d.attendance as Row[])[0] && <span>Вышел по графику: <b>{(d.attendance as Row[])[0].worked}/{(d.attendance as Row[])[0].planned}</b></span>}
                  {(d.absences as Row[]).map(a => <span key={a.kind}>{ABSENCE[a.kind] ?? a.kind}: <b>{a.days} дн.</b></span>)}
                </div>
              </Card>
            </div>

            <Card title="История смен" sub="клик — подробности по пунктам" pad={false}>
              <State s={sh}>
                {x => (
                  <Table<Row> rows={x.shifts} sortKey="" max={15} onRow={r => openShift(num(r.shift_id))} cols={[
                    { key: 'shift_date', title: 'Дата', render: r => fullDate(r.shift_date) },
                    { key: 'day_part', title: 'Часть', render: r => DAY_PART[r.day_part] },
                    { key: 'shift_role', title: 'Роль', render: r => ROLE[r.shift_role] ?? r.shift_role },
                    { key: 'outlet', title: 'Точка' },
                    { key: 'time', title: 'Время', render: r => `${(r.started_at ?? '').slice(11, 16)}–${r.finished_at ? r.finished_at.slice(11, 16) : '…'}` },
                    { key: 'score', title: 'Балл', align: 'right', render: r => r.score != null ? <b>{r.score}</b> : '—' },
                    { key: 'c', title: 'Выполнено', render: r => r.completion_pct != null ? <PctBar v={r.completion_pct} /> : '—' },
                    { key: 'bad', title: 'Не сделал', align: 'right', render: r => { const n = num(r.items_skipped) + num(r.items_not_done) + num(r.items_problem); return n ? <span className="ins-neg">{n}</span> : '—' } },
                    { key: 'fl', title: 'Флаги', align: 'right', render: r => num(r.flags_total) ? <Pill kind={num(r.flags_confirmed) ? 'bad' : 'warn'}>{r.flags_total}</Pill> : '—' },
                    { key: 'inv', title: 'Инв.', align: 'right', render: r => num(r.inventories) ? '📋' : '' },
                  ]} />
                )}
              </State>
            </Card>

            <div className="ins-grid g-1-1">
              <Card title="Инвентаризации" pad={false}>
                <Table<Row> rows={d.inventories} sortKey="" empty="Не заполнял" onRow={r => openCount(num(r.count_id))} cols={[
                  { key: 'count_date', title: 'Дата', render: r => shortDate(r.count_date) },
                  { key: 'outlet', title: 'Точка' },
                  { key: 'lines', title: 'Строк', align: 'right', render: r => `${r.lines_filled}/${r.lines_total}` },
                  { key: 'minutes', title: 'Время', align: 'right', render: r => r.minutes != null ? `${r.minutes} м` : '—' },
                  { key: 'anomalies', title: 'Аномалии', align: 'right', render: r => num(r.anomalies) ? <Pill kind="warn">{r.anomalies}</Pill> : '—' },
                ]} />
              </Card>
              <Card title="Последние флаги" pad={false}>
                <Table<Row> rows={d.flagsList} sortKey="" empty="Флагов нет" onRow={r => openShift(num(r.shift_id))} cols={[
                  { key: 'at', title: 'Когда', render: r => dt(r.at) },
                  { key: 'type', title: 'Флаг', render: r => <Pill kind={SEV[r.severity]} title={r.details}>{FLAG[r.type] ?? r.type}</Pill> },
                  { key: 'item_title', title: 'Пункт' },
                  { key: 'review_status', title: 'Статус', render: r => REVIEW[r.review_status] },
                ]} max={8} />
              </Card>
            </div>

            <Card title="Журнал действий" sub="входы, отметки, фото — всё что пишется в audit_event" pad={false}>
              <State s={ev}>
                {x => (
                  <Table<Row> rows={x.events} sortKey="" max={12} empty="Нет событий" cols={[
                    { key: 'at', title: 'Когда', render: r => dt(r.at) },
                    { key: 'type', title: 'Событие', render: r => <Pill>{r.type}</Pill> },
                    { key: 'outlet', title: 'Точка' },
                    { key: 'details', title: 'Детали' },
                    { key: 'ip', title: 'IP' },
                  ]} />
                )}
              </State>
            </Card>
          </div>
        )
      }}
    </State>
  )
}

function Head({ p, rank, of, onCompare }: { p: Row; rank: number | null; of: number; onCompare?: () => void }) {
  return (
    <div className="ins-head">
      <Avatar name={p.full_name} size={56} />
      <div className="who">
        <h2>{p.full_name}{!p.active && <Pill>неактивен</Pill>}</h2>
        <div className="ins-sub">{p.login} · {(p.outlets as Row[]).map(o => o.name).join(', ') || 'точки не назначены'} · последний вход {dt(p.last_login)}</div>
      </div>
      {rank && <div className="rankbadge"><b>#{rank}</b><span>из {of}</span></div>}
      {onCompare && <button className="ins-btn" onClick={onCompare}>Сравнить с другими</button>}
    </div>
  )
}
