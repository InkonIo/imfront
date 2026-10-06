import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { errorText } from '../admin/ui'
import { sheetApi } from './api'
import type { Sheet } from './api'
import { AFTER, DANGER_ZONES, DURING, DURING_TOP, EXPIRY, GOALS, HOURLY, HOURS, PREP, SPECIAL } from './schema'
import type { SheetItem } from './schema'
import './sheet.css'

type Part = 'm' | 'e'

const toNum = (s: string) => {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'))
  return s.trim() !== '' && Number.isFinite(n) ? n : null
}
const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace('.', ','))

export default function ShiftSheetPage({ sheetId }: { sheetId?: number }) {
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const pending = useRef<Record<string, string | null>>({})
  const timer = useRef(0)
  const idRef = useRef<number | null>(null)

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

  const editable = sheet.editable
  const v = (k: string) => values[k] ?? ''
  const date = sheet.date.split('-').reverse().join('.')

  function set(key: string, value: string) {
    if (!editable) return
    setValues((prev) => ({ ...prev, [key]: value }))
    pending.current[key] = value === '' ? null : value
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush(), 600)
  }

  // ---------- куски разметки: обычные функции, НЕ компоненты (иначе слетает фокус) ----------

  const field = (k: string, className = 'sh-in', placeholder?: string) => (
    <input
      className={className}
      value={v(k)}
      placeholder={placeholder}
      disabled={!editable}
      onChange={(e) => set(k, e.target.value)}
    />
  )

  const area = (k: string, rows = 3) => (
    <textarea className="sh-area" rows={rows} value={v(k)} disabled={!editable} onChange={(e) => set(k, e.target.value)} />
  )

  const check = (k: string) => (
    <td className="sh-cb">
      <input type="checkbox" checked={v(k) === '1'} disabled={!editable} onChange={() => set(k, v(k) === '1' ? '' : '1')} />
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
      <td colSpan={3} className={strong ? 'sh-bar strong' : 'sh-bar'}>
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
        </span>
        <button className="btn small" onClick={() => window.print()}>
          🖨 Печать
        </button>
      </div>
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
                <th className="sh-cb">Утро</th>
                <th className="sh-cb">Вечер</th>
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
                <th>Утро</th>
                <th>Вечер</th>
              </tr>
            </thead>
            <tbody>
              {EXPIRY.map((name, i) => (
                <tr key={name}>
                  <td className="sh-txt">{name}</td>
                  <td>{field(`exp.${i}.m`)}</td>
                  <td>{field(`exp.${i}.e`)}</td>
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
          {[1, 2, 3].map((n) => (
            <div key={n}>
              <div className="sh-section light">Приоритет {n}</div>
              {area(`prio.${n}`, 2)}
            </div>
          ))}
        </div>

        <div className="sh-block">
          <div className="sh-section">В ТЕЧЕНИЕ СМЕНЫ</div>
          <table className="sh-grid sh-list">
            <tbody>
              {bar('during-top')}
              {DURING_TOP.map(checkRow)}
              {bar('danger', 'НАБЛЮДЕНИЕ ЗА ОПАСНЫМИ ЗОНАМИ И ПРАВИЛЬНАЯ РЕАКЦИЯ НА НИХ:', true)}
              <tr>
                <td colSpan={3} className="sh-note">
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