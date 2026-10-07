import { useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ins } from './api'
import type { Row } from './api'
import { useIns } from './ctx'
import { Avatar, Card, State, axis, tip } from './ui'
import { SERIES, fmt, has, num, pct, shortDate, useAsync } from './utils'

type MetricDef = { key: string; label: string; f?: (r: Row) => unknown; fmt?: (v: unknown) => string; higherBetter: boolean }
const METRICS: MetricDef[] = [
  { key: 'shifts', label: 'Смен', higherBetter: true },
  { key: 'score_avg', label: 'Балл за смену', fmt: v => fmt(v, 1), higherBetter: true },
  { key: 'score_total', label: 'Σ баллов', higherBetter: true },
  { key: 'completion_pct', label: 'Выполнено', fmt: pct, higherBetter: true },
  { key: 'on_time_pct', label: 'Вовремя', fmt: pct, higherBetter: true },
  { key: 'bad', label: 'Не сделано / пропуск / проблема', f: r => num(r.items_skipped) + num(r.items_not_done) + num(r.items_problem), higherBetter: false },
  { key: 'flags_confirmed', label: 'Подтверждённых флагов', higherBetter: false },
  { key: 'late', label: 'Опозданий', higherBetter: false },
  { key: 'too_fast', label: '«Слишком быстро»', higherBetter: false },
  { key: 'photos', label: 'Фото', higherBetter: true },
  { key: 'items_approved', label: 'Одобрено директором', higherBetter: true },
  { key: 'items_rejected', label: 'Отклонено директором', higherBetter: false },
  { key: 'avg_active_min', label: 'В системе за смену, мин', higherBetter: true },
  { key: 'logins', label: 'Входов', higherBetter: true },
  { key: 'inventories', label: 'Инвентаризаций', higherBetter: true },
]
const val = (m: MetricDef, r: Row) => (m.f ? m.f(r) : r[m.key])

export default function Compare({ ids, setIds }: { ids: number[]; setIds: (x: number[]) => void }) {
  const { f, openManager } = useIns()
  const people = useAsync(() => ins.managers(f), [f.from, f.to, f.outletId])
  const s = useAsync(() => (ids.length >= 2 ? ins.compare(ids, f) : Promise.resolve(null)), [ids.join(','), f.from, f.to, f.outletId])
  const [wm, setWm] = useState<'score_avg' | 'completion_pct' | 'on_time_pct'>('completion_pct')
  const color = (id: number) => SERIES[ids.indexOf(id) % SERIES.length]

  return (
    <div className="ins-stack">
      <Card title="Кого сравниваем" sub="выберите от 2 до 6 менеджеров; цвет человека фиксирован на всех графиках">
        <div className="ins-chips">
          {(people.data?.people as Row[] | undefined)?.map(p => {
            const id = num(p.id), on = ids.includes(id)
            return (
              <button key={id} className={`ins-chip ${on ? 'on' : ''}`} style={on ? { borderColor: color(id), boxShadow: `inset 0 0 0 1px ${color(id)}` } : undefined}
                      onClick={() => setIds(on ? ids.filter(i => i !== id) : ids.length < 6 ? [...ids, id] : ids)}>
                {on && <i style={{ background: color(id) }} />}{p.full_name}
              </button>
            )
          })}
        </div>
      </Card>

      {ids.length < 2 ? <div className="ins-empty">Выберите хотя бы двух менеджеров</div> : (
        <State s={s}>
          {d => {
            if (!d) return null
            const rows: Row[] = d.managers
            if (rows.length < 2) return <div className="ins-empty">У выбранных менеджеров нет смен за этот период</div>
            const max = (k: string | ((r: Row) => number)) => Math.max(1, ...rows.map(r => (typeof k === 'string' ? num(r[k]) : k(r))))
            const maxScore = max('score_avg'), maxPh = max(r => num(r.photos) / Math.max(1, num(r.shifts)))
            const radar = [
              { axis: 'Выполнено', ...Object.fromEntries(rows.map(r => [r.user_id, num(r.completion_pct)])) },
              { axis: 'Вовремя', ...Object.fromEntries(rows.map(r => [r.user_id, num(r.on_time_pct)])) },
              { axis: 'Балл', ...Object.fromEntries(rows.map(r => [r.user_id, Math.max(0, (num(r.score_avg) / maxScore) * 100)])) },
              { axis: 'Без нарушений', ...Object.fromEntries(rows.map(r => [r.user_id, Math.max(0, 100 - (100 * num(r.flags_confirmed)) / Math.max(1, num(r.shifts)))])) },
              { axis: 'Фото', ...Object.fromEntries(rows.map(r => [r.user_id, (num(r.photos) / Math.max(1, num(r.shifts)) / maxPh) * 100])) },
              { axis: 'Активность', ...Object.fromEntries(rows.map(r => [r.user_id, num(r.avg_duration_min) ? Math.min(100, (100 * num(r.avg_active_min)) / num(r.avg_duration_min)) : 0])) },
            ]
            const weeks = [...new Set((d.weekly as Row[]).map(w => w.week))].sort()
            const weekly = weeks.map(w => {
              const o: Row = { week: w }
              for (const x of d.weekly as Row[]) if (x.week === w) o[x.user_id] = has(x[wm]) ? num(x[wm]) : null
              return o
            })
            return (
              <div className="ins-stack">
                <div className="ins-grid g-1-1">
                  <Card title="Профиль" sub="6 осей, 100% — лучший показатель; «Балл» и «Фото» — относительно лучшего из выбранных">
                    <ResponsiveContainer width="100%" height={320}>
                      <RadarChart data={radar} outerRadius="75%">
                        <PolarGrid stroke="var(--ins-line)" />
                        <PolarAngleAxis dataKey="axis" tick={{ fill: 'var(--ins-mute)', fontSize: 12 }} />
                        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                        {rows.map(r => (
                          <Radar key={r.user_id} name={r.full_name} dataKey={String(r.user_id)} stroke={color(num(r.user_id))} fill={color(num(r.user_id))} fillOpacity={0.14} strokeWidth={2} />
                        ))}
                        <Tooltip {...tip} formatter={(v: number) => `${Math.round(v)}%`} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </Card>
                  <Card title="Динамика по неделям"
                        right={<select className="ins-input" value={wm} onChange={e => setWm(e.target.value as typeof wm)}>
                          <option value="completion_pct">Выполнено %</option><option value="on_time_pct">Вовремя %</option><option value="score_avg">Балл за смену</option>
                        </select>}>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={weekly} margin={{ left: -16, right: 8, top: 8 }}>
                        <CartesianGrid vertical={false} stroke="var(--ins-line)" />
                        <XAxis dataKey="week" tickFormatter={shortDate} {...axis} />
                        <YAxis {...axis} />
                        <Tooltip {...tip} labelFormatter={l => `неделя с ${shortDate(String(l))}`} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                        {rows.map(r => (
                          <Line key={r.user_id} name={r.full_name} dataKey={String(r.user_id)} stroke={color(num(r.user_id))} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </Card>
                </div>

                <Card title="Цифры рядом" sub="зелёная заливка — лучший результат в строке, красная — худший" pad={false}>
                  <div className="ins-tw">
                    <table className="ins-t cmp">
                      <thead>
                        <tr><th>Показатель</th>{rows.map(r => (
                          <th key={r.user_id} style={{ textAlign: 'center' }}>
                            <button className="ins-who col" onClick={() => openManager(num(r.user_id))}>
                              <Avatar name={r.full_name} size={30} /><span style={{ color: color(num(r.user_id)) }}>●</span> {r.full_name}
                            </button>
                          </th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {METRICS.map(m => {
                          const vs = rows.map(r => num(val(m, r)))
                          const best = m.higherBetter ? Math.max(...vs) : Math.min(...vs)
                          const worst = m.higherBetter ? Math.min(...vs) : Math.max(...vs)
                          return (
                            <tr key={m.key}>
                              <td>{m.label}</td>
                              {rows.map((r, i) => {
                                const v = val(m, r)
                                const cls = best === worst ? '' : vs[i] === best ? 'best' : vs[i] === worst ? 'worst' : ''
                                return <td key={r.user_id} className={`c ${cls}`}>{has(v) ? (m.fmt ? m.fmt(v) : fmt(v)) : '—'}</td>
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card title="Кто что сделал, а кто нет" sub="пункты чек-листа, где результаты людей расходятся сильнее всего: % не выполнено/пропущено (только пункты, встретившиеся ≥2 раз)" pad={false}>
                  {(d.itemSpread as Row[]).length ? (
                    <div className="ins-tw">
                      <table className="ins-t cmp">
                        <thead>
                          <tr><th>Пункт</th>{rows.map(r => <th key={r.user_id} style={{ textAlign: 'center', color: color(num(r.user_id)) }}>{r.full_name}</th>)}<th style={{ textAlign: 'center' }}>Разброс</th></tr>
                        </thead>
                        <tbody>
                          {(d.itemSpread as Row[]).map(it => (
                            <tr key={it.title}>
                              <td>{it.title}</td>
                              {rows.map(r => {
                                const c = it.perUser[String(r.user_id)]
                                if (!c || c.total < 1) return <td key={r.user_id} className="c ins-mute">—</td>
                                const b = num(c.bad_pct)
                                return <td key={r.user_id} className="c" style={{ background: b ? `rgba(229,39,35,${Math.min(0.5, b / 200)})` : 'rgba(27,175,122,.12)' }} title={`${c.done} из ${c.total} сделано`}>{b}% <small>({c.bad}/{c.total})</small></td>
                              })}
                              <td className="c"><b>{it.spread} п.п.</b></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <div className="ins-empty">Существенных расхождений нет</div>}
                </Card>
              </div>
            )
          }}
        </State>
      )}
    </div>
  )
}
