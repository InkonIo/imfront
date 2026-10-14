import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { errorText } from '../admin/ui'
import { sheetApi } from './api'
import type { PriorityTpl, Sheet, SheetAuto } from './api'
import { AFTER, DANGER_ZONES, DURING, DURING_TOP, EXPIRY, GOALS, HOURLY, HOURS, PREP, SPECIAL } from './schema'
import type { SheetItem } from './schema'
import './sheet.css'
import './sheet-extra.css'

type Part = 'm' | 'e'

// goal = строка «Цели на текущий день», куда попадает доля канала (у прилавка такой строки нет)
const CHANNELS: { key: string; title: string; col: RegExp; goal?: string }[] = [
  { key: 'pct.counter', title: 'Прилавок', col: /^прилавок/i },
  { key: 'pct.kiosk', title: 'Киоски', col: /^киоск/i, goal: 'kiosk' },
  { key: 'pct.delivery', title: 'Delivery', col: /^deliv/i, goal: 'dlv' },
  { key: 'pct.mobile', title: 'Мобилка', col: /^моб/i, goal: 'mobile' },
  { key: 'pct.postamat', title: 'Постамат', col: /^постам/i, goal: 'postomat' },
]

const toNum = (s: string) => {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'))
  return s.trim() !== '' && Number.isFinite(n) ? n : null
}
const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace('.', ','))

export default function ShiftSheetPage({ sheetId, readOnly = false }: { sheetId?: number; readOnly?: boolean }) {
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const pending = useRef<Record<string, string | null>>({})
  const timer = useRef(0)
  const idRef = useRef<number | null>(null)
  const [auto, setAuto] = useState<SheetAuto | null>(null)
  const filled = useRef(false)
  const applyRef = useRef<(overwrite: boolean) => void>(() => {})
  const [tpls, setTpls] = useState<PriorityTpl[]>([])
  const [uploading, setUploading] = useState(false)
  const [note, setNote] = useState('')
  const [overSlot, setOverSlot] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(sheetId ? sheetApi.get(sheetId) : sheetApi.current())
      .then((s) => {
        if (cancelled) return
        idRef.current = s.id
        setSheet(s)
        setValues(s.values)
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err))
      })
    return () => {
      cancelled = true
    }
  }, [sheetId])

  // данные из отчёта iiko для автозаполнения (только когда бланк можно править)
  useEffect(() => {
    if (!sheet || !sheet.editable || readOnly) return
    let cancelled = false
    sheetApi
      .auto(sheet.id)
      .then((a) => {
        if (!cancelled) setAuto(a)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [sheet, readOnly])

  useEffect(() => {
    if (!sheet || !sheet.editable || readOnly) return
    sheetApi.priorities(sheet.outletId).then(setTpls).catch(() => {})
  }, [sheet, readOnly])

  // первый раз подставляем только в пустые поля
  useEffect(() => {
    if (!sheet || !auto || filled.current) return
    filled.current = true
    applyRef.current(false)
  }, [sheet, auto])

  const flush = useCallback(async () => {
    const id = idRef.current
    const batch = pending.current
    if (!id || Object.keys(batch).length === 0) return
    pending.current = {}
    setStatus('saving')
    try {
      await sheetApi.save(id, batch)
      setStatus('saved')
    } catch (err) {
      pending.current = { ...batch, ...pending.current }
      setStatus('error')
      setError(errorText(err))
    }
  }, [])

  useEffect(
    () => () => {
      clearTimeout(timer.current)
      void flush()
    },
    [flush],
  )

  if (!sheet) {
    return error ? <div className="error">{error}</div> : <div className="muted">Загрузка…</div>
  }

  const editable = sheet.editable && !readOnly
  const v = (k: string) => values[k] ?? ''
  // утро правит утренний менеджер, вечер — вечерний; общие поля (цели, приоритеты) — оба
  const myParts = values._parts ?? 'me'
  const PART_KEY = /^(?:(?:chk|exp)\.[^.]+\.(m|e)|(?:hr|status)\.(m|e)\..+)$/
  const canKey = (k: string) => {
    if (!editable) return false
    const m = PART_KEY.exec(k)
    return !m || myParts.includes(m[1] ?? m[2])
  }
  // показываем только свою часть дня: утренний менеджер видит колонку «Утро», вечерний — «Вечер»
  // (без своей смены на этой точке — обе колонки, только для чтения)
  const showM = myParts === '' || myParts.includes('m')
  const showE = myParts === '' || myParts.includes('e')
  const nCols = 1 + (showM ? 1 : 0) + (showE ? 1 : 0)
  const date = sheet.date.split('-').reverse().join('.')

  function set(key: string, value: string) {
    if (!canKey(key)) return
    setValues((prev) => ({ ...prev, [key]: value }))
    pending.current[key] = value === '' ? null : value
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush(), 600)
  }

  const nf = (n: number) => n.toLocaleString('ru-RU')
  // план по часам: общий GC и Sales, а по каналам GC × доля канала
  function applyPlan(data: SheetAuto, pcts: Record<string, number>, overwrite: boolean, onlyChannels = false) {
    const plan = data.planHours ?? []
    if (!plan.length) return
    const gcCol = HOURLY.find((c) => c.pair && /^общее/i.test(c.label))
    const slCol = HOURLY.find((c) => c.pair && /^ежечасно/i.test(c.label))
    ;(['m', 'e'] as Part[]).forEach((part) => {
      HOURS[part].forEach((label, i) => {
        const row = plan.find((x) => x.hour === parseInt(label, 10))
        if (!row) return
        const put = (key: string, val: string, force: boolean) => {
          if (force || !v(key)) set(key, val)
        }
        if (!onlyChannels) {
          if (gcCol) put(`hr.${part}.${i}.${gcCol.id}.p`, nf(row.gc), overwrite)
          if (slCol) put(`hr.${part}.${i}.${slCol.id}.p`, nf(row.sales), overwrite)
        }
        for (const ch of CHANNELS) {
          const col = HOURLY.find((c) => c.pair && ch.col.test(c.label))
          if (col) put(`hr.${part}.${i}.${col.id}.p`, nf(Math.round((row.gc * (pcts[ch.key] ?? 0)) / 100)), overwrite || onlyChannels)
        }
      })
    })
  }

  // менеджер поменял долю канала: пересчитываем плановые значения каналов по всем часам
  function setPct(key: string, value: string) {
    set(key, value)
    const ch = CHANNELS.find((c) => c.key === key)
    if (ch?.goal) set(`goal.${ch.goal}.goal`, value.trim() ? `${value.trim()}%` : '')
    if (!auto) return
    const pcts: Record<string, number> = {}
    for (const c of CHANNELS) pcts[c.key] = toNum(c.key === key ? value : v(c.key)) ?? 0
    applyPlan(auto, pcts, true, true)
  }

  function applyAuto(overwrite: boolean, data: SheetAuto | null = auto) {
    if (!data) return
    const rows: [string, 'sales' | 'gc' | 'avgCheck'][] = [
      ['sales', 'sales'],
      ['gc', 'gc'],
      ['av.check', 'avgCheck'],
    ]
    for (const [label, f] of rows) {
      const g = GOALS.find((x) => x.label.trim().toLowerCase() === label)
      if (!g) continue
      const pk = `goal.${g.id}.prev`
      const gk = `goal.${g.id}.goal`
      if (data.prev && (overwrite || !v(pk))) set(pk, nf(data.prev[f]))
      if (data.goal && (overwrite || !v(gk))) set(gk, nf(data.goal[f]))
    }

    // доли каналов: если пусто, берём из прошлого бланка точки (или стандартные)
    const pctNow: Record<string, number> = {}
    for (const c of CHANNELS) {
      if ((overwrite || !v(c.key)) && data.pcts?.[c.key]) set(c.key, data.pcts[c.key])
      const val = v(c.key) || data.pcts?.[c.key] || ''
      pctNow[c.key] = toNum(val) ?? 0
      if (c.goal && val && (overwrite || !v(`goal.${c.goal}.goal`))) set(`goal.${c.goal}.goal`, `${val}%`)
    }
    applyPlan(data, pctNow, overwrite)

    // почасовые таблицы: GC (факт), Sales (факт), средний чек по накоплению
    const hours = data.hours ?? []
    if (hours.length) {
      const gcCol = HOURLY.find((c) => c.pair && /^общее/i.test(c.label))
      const slCol = HOURLY.find((c) => c.pair && /^ежечасно/i.test(c.label))
      const avCol = HOURLY.find((c) => !c.pair && /накоплению/i.test(c.label))
      ;(['m', 'e'] as Part[]).forEach((part) => {
        HOURS[part].forEach((label, i) => {
          const hour = parseInt(label, 10)
          const row = hours.find((x) => x.hour === hour)
          if (!row) return
          const put = (key: string, val: string) => {
            if (overwrite || !v(key)) set(key, val)
          }
          if (gcCol) put(`hr.${part}.${i}.${gcCol.id}.f`, nf(row.guests))
          if (slCol) put(`hr.${part}.${i}.${slCol.id}.f`, nf(row.sales))
          if (avCol) {
            const upto = hours.filter((x) => x.hour >= 10 && x.hour <= hour)
            const g = upto.reduce((a, x) => a + x.guests, 0)
            const s = upto.reduce((a, x) => a + x.sales, 0)
            if (g > 0) put(`hr.${part}.${i}.${avCol.id}.v`, nf(Math.round(s / g)))
          }
        })
      })
    }
  }
  applyRef.current = applyAuto

  async function uploadReport(f: File | undefined) {
    if (!f || !sheet) return
    setUploading(true)
    setNote('')
    setError('')
    try {
      const buf = new Uint8Array(await f.arrayBuffer())
      let bin = ''
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      const r = await sheetApi.importSales(sheet.id, f.name, btoa(bin))
      const fresh = await sheetApi.auto(sheet.id)
      setAuto(fresh)
      applyAuto(true, fresh)
      const ru = (s: string) => s.split('-').reverse().join('.')
      setNote(`Отчёт загружен: ${ru(r.from)} – ${ru(r.to)}, гостей ${r.guests.toLocaleString('ru-RU')}. Цифры подставлены, их можно поправить.`)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setUploading(false)
    }
  }

  // ---------- приоритеты дня: шаблоны перетаскиваются в слоты 1–3 ----------
  const dropTo = (n: number, text: string) => set(`prio.${n}`, text)
  const pickTpl = (text: string) => {
    const free = [1, 2, 3].find((n) => !v(`prio.${n}`))
    if (free) dropTo(free, text)
  }
  const cats = Array.from(new Set(tpls.map((x) => x.category ?? 'Другое')))

  const autoNote = () => {
    if (!editable || !auto) return null
    if (!auto.mapped) {
      return <div className="muted small sh-noprint">Точка не привязана к ресторану из тайм-трекера, поэтому цифры из отчёта iiko не подставляются.</div>
    }
    const d = (s: string) => s.split('-').reverse().slice(0, 2).join('.')
    return (
      <div className="muted small sh-noprint">
        {auto.prev ? `Результат за ${d(auto.prevDate)} из отчёта iiko. ` : `За ${d(auto.prevDate)} нет данных: загрузи Excel в «Расписание → Аналитика». `}
        {auto.goal && auto.basis ? `Цели: среднее за ${auto.basis.map(d).join(', ')} + ${auto.pct}%. ` : 'Для целей не хватает прошлых недель в отчёте. '}
        <button className="btn small" onClick={() => applyAuto(true)}>
          Подставить заново
        </button>
      </div>
    )
  }

  // ---------- куски разметки: обычные функции, НЕ компоненты (иначе слетает фокус) ----------

  const field = (k: string, className = 'sh-in', placeholder?: string) => (
    <input
      className={className}
      value={v(k)}
      placeholder={placeholder}
      disabled={!canKey(k)}
      onChange={(e) => set(k, e.target.value)}
    />
  )

  const area = (k: string, rows = 3) => (
    <textarea className="sh-area" rows={rows} value={v(k)} disabled={!canKey(k)} onChange={(e) => set(k, e.target.value)} />
  )

  const check = (k: string) => (k.endsWith('.m') && !showM) || (k.endsWith('.e') && !showE) ? null : (
    <td className="sh-cb">
      <input type="checkbox" checked={v(k) === '1'} disabled={!canKey(k)} onChange={() => set(k, v(k) === '1' ? '' : '1')} />
    </td>
  )

  const checkRow = (item: SheetItem) => (
    <tr key={item.id}>
      {check(`chk.${item.id}.m`)}
      {check(`chk.${item.id}.e`)}
      <td className={item.hot ? 'sh-txt hot' : 'sh-txt'}>{item.text}</td>
    </tr>
  )

  const bar = (key: string, text?: string, strong = false) => (
    <tr key={key}>
      <td colSpan={nCols} className={strong ? 'sh-bar strong' : 'sh-bar'}>
        {text}
      </td>
    </tr>
  )

  const hourlyTotal = (part: Part, col: (typeof HOURLY)[number], sub: 'p' | 'f' | 'v') => {
    const nums = HOURS[part]
      .map((_, i) => toNum(v(`hr.${part}.${i}.${col.id}.${sub}`)))
      .filter((n): n is number => n !== null)
    if (!nums.length) return ''
    return fmtNum(col.total === 'last' ? nums[nums.length - 1] : nums.reduce((a, b) => a + b, 0))
  }

  const hourlyTable = (part: Part) => (
    <div className="sh-scroll">
      <table className="sh-grid sh-hourly">
        <thead>
          <tr>
            <th rowSpan={2}>Время</th>
            <th colSpan={12}>GC (с планирования)</th>
            <th colSpan={2}>Sales</th>
            <th>Av. Check</th>
            <th>GCPCH</th>
            <th>Кол-во анкет в Voice и 2Гис</th>
          </tr>
          <tr>
            {HOURLY.map((c) => (
              <th key={c.id} colSpan={c.pair ? 2 : 1} className="sh-sub">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HOURS[part].map((h, i) => {
            const cells: ReactNode[] = []
            HOURLY.forEach((c) => {
              if (c.pair) {
                cells.push(
                  <td key={`${c.id}p`} className="sh-num plan">
                    {field(`hr.${part}.${i}.${c.id}.p`, 'sh-in num', 'план')}
                  </td>,
                  <td key={`${c.id}f`} className="sh-num">
                    {field(`hr.${part}.${i}.${c.id}.f`, 'sh-in num', 'факт')}
                  </td>,
                )
              } else {
                cells.push(
                  <td key={c.id} className="sh-num">
                    {field(`hr.${part}.${i}.${c.id}.v`, 'sh-in num')}
                  </td>,
                )
              }
            })
            return (
              <tr key={h}>
                <td className="sh-time">{h}</td>
                {cells}
              </tr>
            )
          })}
          <tr className="sh-total">
            <td>ИТОГ</td>
            {HOURLY.flatMap((c) =>
              c.pair
                ? [
                    <td key={`${c.id}p`}>{hourlyTotal(part, c, 'p')}</td>,
                    <td key={`${c.id}f`}>{hourlyTotal(part, c, 'f')}</td>,
                  ]
                : [<td key={c.id}>{hourlyTotal(part, c, 'v')}</td>],
            )}
          </tr>
        </tbody>
      </table>
    </div>
  )

  const statusLines = (part: Part, title: string) => (
    <>
      <div className="sh-status-title">{title}</div>
      {[1, 2, 3].map((n) => (
        <div key={n}>{field(`status.${part}.${n}`, 'sh-line')}</div>
      ))}
    </>
  )

  // ---------- страница ----------

  return (
    <div className="page">
      <div className="sh-toolbar sh-noprint">
        <span className="muted small">
          {status === 'saving' ? 'Сохраняем…' : status === 'saved' ? '✓ Сохранено' : status === 'error' ? '⚠ Не сохранилось' : ''}
          {!editable && ' Только просмотр'}
          {editable && myParts !== 'me' && ` · Вы заполняете: ${myParts === 'm' ? 'утро' : 'вечер'}`}
        </span>
        {editable && (
          <label className="btn small sh-upload">
            {uploading ? 'Загружаем…' : '📥 Загрузить отчёт iiko (Excel)'}
            <input
              type="file"
              accept=".xlsx"
              hidden
              disabled={uploading}
              onChange={(e) => {
                void uploadReport(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
        )}
        <button className="btn small" onClick={() => window.print()}>
          🖨 Печать
        </button>
      </div>
      {autoNote()}
      {note && <div className="muted small sh-noprint">{note}</div>}
      {error && <div className="error sh-noprint">{error}</div>}

      <div className="sheet">
        <div className="sh-head">
          <div className="sh-logo">IM</div>
          <div className="sh-wish">ЖЕЛАЕМ УДАЧНОЙ СМЕНЫ!</div>
          <div className="sh-meta">
            <div>
              Дата: <b>{date}</b> · {sheet.outletName}
            </div>
            <div>
              Менеджер утро: <b>{sheet.morningName || '—'}</b> · вечер: <b>{sheet.eveningName || '—'}</b> · ночь:{' '}
              {field('head.night', 'sh-in inline')}
            </div>
          </div>
        </div>
        <div className="sh-title">ЧЕК - ЛИСТ МЕНЕДЖЕРА СМЕНЫ</div>
        <div className="sh-section light">ПОДГОТОВКА К СМЕНЕ</div>

        <div className="sh-top">
          <table className="sh-grid sh-list">
            <thead>
              <tr>
                {showM && <th className="sh-cb">Утро</th>}
                {showE && <th className="sh-cb">Вечер</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {PREP.flatMap((g, gi) => [
                ...(g.title ? [bar(`prep-${gi}`, g.title)] : []),
                ...g.items.map(checkRow),
              ])}
            </tbody>
          </table>

          <table className="sh-grid sh-expiry">
            <thead>
              <tr>
                <th>СРОКИ ХРАНЕНИЯ</th>
                {showM && <th>Утро</th>}
                {showE && <th>Вечер</th>}
              </tr>
            </thead>
            <tbody>
              {EXPIRY.map((name, i) => (
                <tr key={name}>
                  <td className="sh-txt">{name}</td>
                  {showM && <td>{field(`exp.${i}.m`)}</td>}
                  {showE && <td>{field(`exp.${i}.e`)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="sh-block">
          <div className="sh-section">ЦЕЛИ НА ТЕКУЩИЙ ДЕНЬ</div>
          <div className="sh-section light small">
            <b>ЦЕЛИ НА ДЕНЬ</b> (учитывайте приоритеты ресторана, план действий PACE\Обея):
          </div>
          <div className="sh-scroll">
            <table className="sh-grid sh-goals">
              <thead>
                <tr>
                  <th />
                  <th>Результат за предыдущий день</th>
                  <th>Цели на текущий день</th>
                  <th>Результат за текущий день</th>
                  <th>Выполнение цели: (в случае невыполнения цели описываем причины)</th>
                </tr>
              </thead>
              <tbody>
                {GOALS.map((g) => (
                  <tr key={g.id} className={g.tall ? 'tall' : ''}>
                    <th className="sh-goal-label">{g.label}</th>
                    <td>{field(`goal.${g.id}.prev`)}</td>
                    <td>{field(`goal.${g.id}.goal`)}</td>
                    <td>{field(`goal.${g.id}.result`)}</td>
                    <td>{g.tall ? area(`goal.${g.id}.note`, 3) : field(`goal.${g.id}.note`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="sh-block">
          <div className="sh-section">ЦЕЛИ НА ДЕНЬ</div>
          <div className="sh-prio-wrap">
            <div>
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className={overSlot === n ? 'sh-slot-over' : ''}
                  onDragOver={(e) => {
                    if (!editable) return
                    e.preventDefault()
                    setOverSlot(n)
                  }}
                  onDragLeave={() => setOverSlot((o) => (o === n ? null : o))}
                  onDrop={(e) => {
                    const text = e.dataTransfer.getData('application/x-prio')
                    setOverSlot(null)
                    if (!editable || !text) return
                    e.preventDefault()
                    dropTo(n, text)
                  }}
                >
                  <div className="sh-section light">Приоритет {n}</div>
                  {area(`prio.${n}`, 2)}
                </div>
              ))}
            </div>
            {editable && tpls.length > 0 && (
              <aside className="sh-prio-pal sh-noprint">
                <h4>Шаблоны приоритетов</h4>
                <div className="muted small">Перетащи в слот слева или нажми, текст можно поправить.</div>
                {cats.map((c) => (
                  <div key={c}>
                    <div className="cat">{c}</div>
                    {tpls
                      .filter((x) => (x.category ?? 'Другое') === c)
                      .map((x) => (
                        <button
                          key={x.id}
                          type="button"
                          className="sh-chip"
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData('application/x-prio', x.title)}
                          onClick={() => pickTpl(x.title)}
                        >
                          {x.title}
                        </button>
                      ))}
                  </div>
                ))}
              </aside>
            )}
          </div>
        </div>

        <div className="sh-block">
          <div className="sh-section">В ТЕЧЕНИЕ СМЕНЫ</div>
          <table className="sh-grid sh-list">
            <tbody>
              {bar('during-top')}
              {DURING_TOP.map(checkRow)}
              {bar('danger', 'НАБЛЮДЕНИЕ ЗА ОПАСНЫМИ ЗОНАМИ И ПРАВИЛЬНАЯ РЕАКЦИЯ НА НИХ:', true)}
              <tr>
                <td colSpan={nCols} className="sh-note">
                  <ul>
                    {DANGER_ZONES.map((z) => (
                      <li key={z}>{z}</li>
                    ))}
                  </ul>
                </td>
              </tr>
              {DURING.flatMap((g, gi) => [bar(`during-${gi}`, g.title), ...g.items.map(checkRow)])}
            </tbody>
          </table>

          <div className="sh-special">СПЕЦИАЛЬНЫЕ ПРОЦЕДУРЫ:</div>
          <table className="sh-grid sh-list">
            <tbody>{SPECIAL.map(checkRow)}</tbody>
          </table>
        </div>

        <div className="sh-block">
          <div className="sh-pctbar">
            <div className="sh-pct-head">
              <b>Доли каналов от общего GC</b>
              <span className="muted small">план по каналам в таблицах ниже = общий GC × доля</span>
            </div>
            <div className="sh-pct-row">
              {CHANNELS.map((c) => (
                <div key={c.key} className="sh-pct">
                  <span className="sh-pct-title">{c.title}</span>
                  <span className="sh-pct-box">
                    <input
                      className="sh-pct-in"
                      inputMode="numeric"
                      value={v(c.key)}
                      disabled={!editable}
                      onChange={(e) => setPct(c.key, e.target.value)}
                    />
                    <span className="sh-pct-sign">%</span>
                  </span>
                </div>
              ))}
              {(() => {
                const sum = CHANNELS.reduce((a, c) => a + (toNum(v(c.key)) ?? 0), 0)
                return (
                  <div className={sum === 100 ? 'sh-pct-sum ok' : 'sh-pct-sum warn'}>
                    <span className="sh-pct-title">Сумма</span>
                    <b>{fmtNum(sum)}%</b>
                    {sum !== 100 && <span className="small">должно быть 100%</span>}
                  </div>
                )
              })()}
            </div>
          </div>
          {hourlyTable('m')}
          {statusLines('m', 'Статус за утро по приоритетам:')}
        </div>
        <div className="sh-block">
          {hourlyTable('e')}
          {statusLines('e', 'Статус за вечер по приоритетам:')}
        </div>

        <div className="sh-block">
          <div className="sh-section">ПОСЛЕ СМЕНЫ</div>
          <table className="sh-grid sh-list">
            <tbody>{AFTER.map(checkRow)}</tbody>
          </table>
        </div>

        <div className="sh-block">
          <div className="sh-section">ИТОГИ ДНЯ</div>
          {[1, 2, 3].map((n) => (
            <div key={n}>
              <div className="sh-section light left">
                Приоритет {n} (если выполнено, то каким образом\если не выполнено, то причина)
              </div>
              {area(`result.${n}`, 2)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}