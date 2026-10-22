import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ins } from './api'
import { useIns } from './ctx'
import { Avatar, Card, Heatmap, Kpi, PctBar, Pill, ScoreParts, State, Table, axis, tip } from './ui'
import { DAY_PART, FLAG, REVIEW, ROLE, SERIES, fmt, num, pct, shortDate, tone, useAsync, dt, ymd } from './utils'
import type { KpiChip } from './ui'

/** Предыдущий период такой же длины, сразу перед выбранным. */
function prevRange(from: string, to: string): { from: string; to: string } {
  const a = new Date(`${from}T12:00:00`)
  const z = new Date(`${to}T12:00:00`)
  const days = Math.round((z.getTime() - a.getTime()) / 86400000) + 1
  const pz = new Date(a); pz.setDate(pz.getDate() - 1)
  const pa = new Date(pz); pa.setDate(pa.getDate() - (days - 1))
  return { from: ymd(pa), to: ymd(pz) }
}

/** Изменение к прошлому периоду: для счётчиков — в процентах, для процентных показателей — в п.п. */
function chip(cur: unknown, prev: unknown, o: { points?: boolean; goodUp?: boolean } = {}): KpiChip | null {
  if (cur == null || prev == null) return null
  const c = num(cur), p = num(prev)
  let diff: number
  if (o.points) diff = c - p
  else if (p > 0) diff = ((c - p) / p) * 100
  else return null
  const r = Math.round(diff * 10) / 10
  const dir = r > 0 ? 'up' : r < 0 ? 'down' : 'flat'
  const good = o.goodUp === false ? r <= 0 : r >= 0
  return { text: `${Math.abs(r).toLocaleString('ru-RU')}${o.points ? ' п.п.' : '%'}`, dir, good }
}

const SEV: Record<string, string> = { HIGH: 'bad', MEDIUM: 'warn', LOW: 'mute' }

export default function Overview() {
  const { f, openManager, openShift, openCount } = useIns()
  const s = useAsync(() => ins.overview(f), [f.from, f.to, f.outletId])
  const pr = prevRange(f.from, f.to)
  const prev = useAsync(() => ins.overview({ ...f, from: pr.from, to: pr.to }), [pr.from, pr.to, f.outletId])
  const pt = prev.data?.totals as Record<string, unknown> | undefined
  return (
    <State s={s} empty={d => num(d.totals?.shifts) === 0}>
      {d => {
        const t = d.totals
        const flagByType = Object.values(
          (d.flags as { type: string; n: number }[]).reduce<Record<string, { name: string; value: number }>>((a, x) => {
            a[x.type] ??= { name: FLAG[x.type] ?? x.type, value: 0 }
            a[x.type].value += num(x.n)
            return a
          }, {}),
        ).sort((a, b) => b.value - a.value)
        const items = (d.problemItems as Record<string, unknown>[]).slice(0, 10).map(x => ({
          title: String(x.title).length > 38 ? String(x.title).slice(0, 36) + '…' : String(x.title),
          Пропущено: num(x.skipped), Проблема: num(x.problem), 'Не сделано': num(x.not_done),
        }))
        return (
          <div className="ins-stack">
            <h2 className="ins-h2">Ключевые метрики за выбранный период</h2>
            <div className="ins-kpis big">
              <Kpi icon="🗓" label="Смен" value={fmt(t.shifts)} chip={chip(t.shifts, pt?.shifts)} info="Сколько смен отработано за период" hint={pt ? `vs прошлый период · ${fmt(t.managers)} менеджеров` : `${fmt(t.managers)} менеджеров`} />
              <Kpi icon="⭐" label="Средний балл" value={fmt(t.score_avg, 1)} chip={chip(t.score_avg, pt?.score_avg)} info="Средний балл за смену по правилам рейтинга" hint="vs прошлый период" />
              <Kpi icon="✅" label="Выполнено" value={pct(t.completion_pct)} tone={tone(t.completion_pct)} chip={chip(t.completion_pct, pt?.completion_pct, { points: true })} info="Доля пунктов чек-листа, которые сделаны" hint={`${fmt(t.items_done)} из ${fmt(t.items_total)}`} />
              <Kpi icon="⏱" label="Вовремя" value={pct(t.on_time_pct)} tone={tone(t.on_time_pct, 80, 60)} chip={chip(t.on_time_pct, pt?.on_time_pct, { points: true })} info="Доля пунктов, сделанных в своё время" hint="vs прошлый период" />
              <Kpi icon="🚩" label="Флаги подтв." value={fmt(t.flags_confirmed)} tone={num(t.flags_confirmed) ? 'warn' : 'good'} chip={chip(t.flags_confirmed, pt?.flags_confirmed, { goodUp: false })} info="Нарушения, которые подтвердил директор" hint={`${fmt(t.flags_open)} ждут проверки`} />
              <Kpi icon="📸" label="Фото" value={fmt(t.photos)} chip={chip(t.photos, pt?.photos)} info="Фото, приложенные к пунктам" hint={`${fmt(t.comments)} комментариев`} />
              <Kpi icon="🖥" label="В смене" value={t.avg_active_min != null ? `${fmt(t.avg_active_min)} мин` : '—'} chip={chip(t.avg_active_min, pt?.avg_active_min)} info="Сколько минут из смены человек реально работал в системе" hint={`из ${fmt(t.avg_duration_min)} мин`} />
            </div>

            <div className="ins-grid g-2-1">
              <Card title="Динамика по дням" sub="выполнение и вовремя, % · столбики — число смен">
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={d.daily} margin={{ left: -16, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} stroke="var(--ins-line)" />
                    <XAxis dataKey="date" tickFormatter={shortDate} {...axis} />
                    <YAxis yAxisId="p" domain={[0, 100]} {...axis} />
                    <YAxis yAxisId="n" orientation="right" hide />
                    <Tooltip {...tip} labelFormatter={shortDate} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="n" dataKey="shifts" name="Смен" fill="var(--ins-line)" radius={[4, 4, 0, 0]} barSize={14} />
                    <Line yAxisId="p" dataKey="completion_pct" name="Выполнено %" stroke={SERIES[0]} strokeWidth={2.5} dot={false} />
                    <Line yAxisId="p" dataKey="on_time_pct" name="Вовремя %" stroke={SERIES[1]} strokeWidth={2.5} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>
              <Card title="Флаги по типам" sub="все статусы">
                {flagByType.length ? (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={flagByType} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={2} stroke="var(--ins-card)" strokeWidth={2}>
                          {flagByType.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
                        </Pie>
                        <Tooltip {...tip} />
                      </PieChart>
                    </ResponsiveContainer>
                    <ul className="ins-legend">
                      {flagByType.slice(0, 6).map((x, i) => (
                        <li key={x.name}><span style={{ background: SERIES[i % SERIES.length] }} />{x.name}<b>{x.value}</b></li>
                      ))}
                    </ul>
                  </>
                ) : <div className="ins-empty">Флагов нет 🎉</div>}
              </Card>
            </div>

            <div className="ins-grid g-1-1">
              <Card title="Топ менеджеров" sub="по среднему баллу за смену">
                {(d.top as Record<string, unknown>[]).map((m, i) => (
                  <button key={String(m.user_id)} className="ins-person" onClick={() => openManager(num(m.user_id))}>
                    <span className="rk">{i + 1}</span><Avatar name={String(m.full_name)} />
                    <span className="nm">{String(m.full_name)}<small>{fmt(m.shifts)} смен · выполнено {pct(m.completion_pct)}</small></span>
                    <b>{fmt(m.score_avg, 1)}</b>
                  </button>
                ))}
                {(d.bottom as Record<string, unknown>[]).length > 0 && <div className="ins-divider">Нужно внимание</div>}
                {(d.bottom as Record<string, unknown>[]).map(m => (
                  <button key={String(m.user_id)} className="ins-person" onClick={() => openManager(num(m.user_id))}>
                    <Avatar name={String(m.full_name)} />
                    <span className="nm">{String(m.full_name)}<small>{fmt(m.shifts)} смен · флагов {fmt(m.flags_confirmed)}</small></span>
                    <b className="bad">{fmt(m.score_avg, 1)}</b>
                  </button>
                ))}
              </Card>
              <Card title="Что чаще всего не делают" sub="по пунктам чек-листа">
                <ResponsiveContainer width="100%" height={Math.max(220, items.length * 30)}>
                  <BarChart data={items} layout="vertical" margin={{ left: 8, right: 8 }}>
                    <CartesianGrid horizontal={false} stroke="var(--ins-line)" />
                    <XAxis type="number" {...axis} allowDecimals={false} />
                    <YAxis type="category" dataKey="title" width={170} {...axis} />
                    <Tooltip {...tip} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Не сделано" stackId="a" fill="#eb6834" />
                    <Bar dataKey="Пропущено" stackId="a" fill="#eda100" />
                    <Bar dataKey="Проблема" stackId="a" fill="#e52723" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            <div className="ins-grid g-1-1">
              <Card title="Точки" pad={false}>
                <Table rows={d.byOutlet} sortKey="score_avg" cols={[
                  { key: 'outlet', title: 'Точка', sort: r => r.outlet },
                  { key: 'shifts', title: 'Смен', align: 'right', sort: r => num(r.shifts) },
                  { key: 'score_avg', title: 'Балл', align: 'right', sort: r => num(r.score_avg), render: r => fmt(r.score_avg, 1) },
                  { key: 'completion_pct', title: 'Выполн.', sort: r => num(r.completion_pct), render: r => <PctBar v={r.completion_pct} /> },
                  { key: 'flags_confirmed', title: 'Флаги', align: 'right', sort: r => num(r.flags_confirmed) },
                ]} />
              </Card>
              <Card title="Утро / вечер и роли" pad={false}>
                <Table rows={d.byPartRole} sortKey="shifts" cols={[
                  { key: 'p', title: 'Часть', render: r => DAY_PART[r.day_part] ?? r.day_part },
                  { key: 'r', title: 'Роль', render: r => ROLE[r.shift_role] ?? r.shift_role },
                  { key: 'shifts', title: 'Смен', align: 'right', sort: r => num(r.shifts) },
                  { key: 'score_avg', title: 'Балл', align: 'right', sort: r => num(r.score_avg), render: r => fmt(r.score_avg, 1) },
                  { key: 'completion_pct', title: 'Выполн.', sort: r => num(r.completion_pct), render: r => <PctBar v={r.completion_pct} /> },
                  { key: 'avg_duration_min', title: 'Длит.', align: 'right', render: r => `${fmt(r.avg_duration_min)} м` },
                ]} />
              </Card>
            </div>

            <Card title="Когда люди реально работают в системе" sub="минуты активности по дням недели и часам (время Алматы)">
              <Heatmap cells={d.heatmap} />
            </Card>

            <div className="ins-grid g-1-1">
              <Card title="Последние флаги" pad={false}>
                <Table rows={d.recentFlags} sortKey="" max={6} cols={[
                  { key: 'at', title: 'Когда', render: r => dt(r.at) },
                  { key: 'full_name', title: 'Кто' },
                  { key: 'type', title: 'Флаг', render: r => <Pill kind={SEV[r.severity]} title={r.details}>{FLAG[r.type] ?? r.type}</Pill> },
                  { key: 'review_status', title: 'Статус', render: r => REVIEW[r.review_status] ?? r.review_status },
                ]} onRow={r => openShift(num(r.shift_id))} />
              </Card>
              <Card title="Последние инвентаризации" pad={false}>
                <Table rows={d.recentInventories} sortKey="" cols={[
                  { key: 'count_date', title: 'Дата', render: r => shortDate(r.count_date) },
                  { key: 'full_name', title: 'Кто' },
                  { key: 'outlet', title: 'Точка' },
                  { key: 'lines_filled', title: 'Строк', align: 'right', render: r => `${r.lines_filled}/${r.lines_total}` },
                  { key: 'anomalies', title: 'Аномалии', align: 'right', render: r => num(r.anomalies) ? <Pill kind="warn">{r.anomalies}</Pill> : '—' },
                ]} onRow={r => openCount(num(r.count_id))} />
              </Card>
            </div>
            <ScoreLegend />
          </div>
        )
      }}
    </State>
  )
}

function ScoreLegend() {
  return (
    <Card title="Как считается балл" sub="правила из ScoreRules; «бонусы и прочее» — остаток, например +10 за идеальную смену">
      <ScoreParts parts={{ done: 1, on_time: 1, approved: 2, skipped: -1, not_done: -2, flag_medium: -3, flag_high: -5 }} />
    </Card>
  )
}