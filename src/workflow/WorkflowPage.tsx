import { useCallback, useEffect, useMemo, useState } from 'react'
import { workflowApi } from './Api'
import { FREQ_LABEL, FREQ_NOUN, ITEMS, SECTIONS } from './Workflow'
import type { Freq, WfItem } from './Workflow'
import './workflow.css'

const TABS: Freq[] = ['day', 'week', 'month', 'quarter', 'half', 'year']
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

interface Period { key: string; label: string; sub: string }

function periods(now: Date): Record<Freq, Period> {
  const y = now.getFullYear()
  const m = now.getMonth()
  const mon = mondayOf(now)
  const sun = new Date(mon); sun.setDate(sun.getDate() + 6)
  const q = Math.floor(m / 3) + 1
  const h = m < 6 ? 1 : 2
  return {
    day: { key: `d:${iso(now)}`, label: now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }), sub: 'Что делаю каждый день' },
    week: { key: `w:${iso(mon)}`, label: `${mon.getDate()} ${MONTHS_GEN[mon.getMonth()]} – ${sun.getDate()} ${MONTHS_GEN[sun.getMonth()]}`, sub: 'Что делаю каждую неделю' },
    month: { key: `m:${y}-${pad(m + 1)}`, label: `${MONTHS[m]} ${y}`, sub: 'Что делаю раз в месяц и что приходится на этот месяц' },
    quarter: { key: `q:${y}-${q}`, label: `${q} квартал ${y}`, sub: 'Раз в три месяца' },
    half: { key: `h:${y}-${h}`, label: `${h} полугодие ${y}`, sub: 'Раз в полгода' },
    year: { key: `y:${y}`, label: `${y} год`, sub: 'Раз в год' },
  }
}

/** Что показывать на вкладке. Задания «по месяцам» живут во вкладке «Месяц», отмечаются раз в месяц. */
function visible(freq: Freq, month: number): { item: WfItem; text: string; tag: string | null }[] {
  const out: { item: WfItem; text: string; tag: string | null }[] = []
  for (const item of ITEMS) {
    if (item.byMonth) {
      if (freq !== 'month') continue
      const v = item.byMonth[month]
      if (!v) continue
      out.push({ item, text: item.short && item.short !== v ? `${item.short}: ${v}` : v, tag: FREQ_NOUN[item.freq] })
    } else if (item.freq === freq) {
      out.push({ item, text: item.text, tag: null })
    }
  }
  return out
}

export default function WorkflowPage() {
  const now = useMemo(() => new Date(), [])
  const per = useMemo(() => periods(now), [now])
  const month = now.getMonth() + 1
  const [tab, setTab] = useState<Freq>('day')
  const [done, setDone] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [cal, setCal] = useState(false)

  const keyFor = useCallback((item: WfItem) => (item.byMonth ? per.month.key : per[item.freq].key), [per])

  useEffect(() => {
    workflowApi.done(Object.values(per).map((p) => p.key))
      .then((rows) => setDone(new Set(rows.map((r) => `${r.itemId}|${r.periodKey}`))))
      .catch((e) => setError(errText(e)))
      .finally(() => setLoaded(true))
  }, [per])

  const lists = useMemo(() => {
    const m = {} as Record<Freq, { item: WfItem; text: string; tag: string | null }[]>
    for (const f of TABS) m[f] = visible(f, month)
    return m
  }, [month])

  const isDone = (item: WfItem) => done.has(`${item.id}|${keyFor(item)}`)
  const stat = (f: Freq) => {
    const l = lists[f]
    return { done: l.filter((x) => isDone(x.item)).length, total: l.length }
  }

  async function toggle(item: WfItem) {
    const k = `${item.id}|${keyFor(item)}`
    const next = !done.has(k)
    setError('')
    setDone((prev) => { const s = new Set(prev); if (next) s.add(k); else s.delete(k); return s })
    try {
      await workflowApi.toggle(item.id, keyFor(item), next)
    } catch (e) {
      setDone((prev) => { const s = new Set(prev); if (next) s.delete(k); else s.add(k); return s })
      setError(errText(e))
    }
  }

  const list = lists[tab]
  const st = stat(tab)
  const pct = st.total ? Math.round((st.done / st.total) * 100) : 0

  return (
    <div className="wf">
      <p className="wf-lead">
        Ваши регулярные задачи по Workflow директора на 2026 год. Отмечайте сделанное: отметка действует на текущий период
        (день, неделю, месяц и т. д.) и сама обнуляется, когда начинается новый. Отметки видны только вам.
      </p>

      {error && <div className="wf-err">{error}</div>}

      <div className="wf-tabs" role="tablist">
        {TABS.map((f) => {
          const s = stat(f)
          return (
            <button key={f} role="tab" aria-selected={f === tab} className={f === tab ? 'on' : ''} onClick={() => setTab(f)}>
              <b>{FREQ_LABEL[f]}</b>
              <span className={s.total > 0 && s.done === s.total ? 'full' : ''}>{s.done}/{s.total}</span>
            </button>
          )
        })}
      </div>

      <div className="wf-head">
        <div>
          <h2>{per[tab].label}</h2>
          <p>{per[tab].sub}</p>
        </div>
        <div className="wf-prog" aria-label={`Выполнено ${pct}%`}>
          <div className="wf-bar"><span style={{ width: `${pct}%` }} /></div>
          <small>{st.done} из {st.total} · {pct}%</small>
        </div>
      </div>

      {!loaded && <div className="wf-muted">Загрузка…</div>}

      {loaded && list.length === 0 && (
        <div className="wf-empty">В этом периоде отдельных заданий нет.</div>
      )}

      <div className="wf-grid">
        {SECTIONS.map((sec) => {
          const rows = list.filter((x) => x.item.section === sec.id)
          if (rows.length === 0) return null
          const d = rows.filter((x) => isDone(x.item)).length
          return (
            <section key={sec.id} className="wf-card">
              <h3><span>{sec.icon}</span>{sec.title}<em>{d}/{rows.length}</em></h3>
              <ul>
                {rows.map(({ item, text, tag }) => (
                  <li key={item.id} className={isDone(item) ? 'done' : ''}>
                    <label>
                      <input type="checkbox" checked={isDone(item)} onChange={() => void toggle(item)} />
                      <span className="wf-txt">
                        {text}
                        {tag && <i className="wf-tag">{tag}</i>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      <div className="wf-cal">
        <button className="wf-cal-btn" onClick={() => setCal((v) => !v)}>
          {cal ? '▾' : '▸'} Календарь года: что приходится на какой месяц
        </button>
        {cal && (
          <div className="wf-months">
            {MONTHS.map((name, i) => {
              const items = ITEMS.filter((x) => x.byMonth && x.byMonth[i + 1])
              return (
                <div key={name} className={i + 1 === month ? 'wf-mo now' : 'wf-mo'}>
                  <b>{name}</b>
                  {items.length === 0 && <span className="wf-none">—</span>}
                  {items.map((x) => (
                    <span key={x.id} className="wf-chip" title={x.text}>
                      {x.short}: {x.byMonth?.[i + 1]}
                    </span>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}