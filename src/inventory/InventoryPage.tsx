import { useCallback, useEffect, useRef, useState } from 'react'
import { errorText } from '../admin/ui'
import { inventoryApi } from './api'
import { fmt, isFilled, totalOf, warnOf } from './logic'
import type { InvCount, InvLine, LineBody } from './types'
import { exportCount } from './xlsx'
import './inventory.css'

const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']
const FIELDS = [
  { k: 'cs', label: 'Кейсы' },
  { k: 'slv', label: 'Сливы' },
  { k: 'ea', label: 'Россыпью' },
] as const
type FieldKey = (typeof FIELDS)[number]['k']
type Txt = Record<FieldKey, string>

const str = (n: number | null) => (n == null ? '' : fmt(n))
const num = (s: string) => (s === '' ? null : Number(s.replace(',', '.')))

function clean(raw: string, decimal: boolean) {
  let s = raw.replace(/\s/g, '').replace('.', ',')
  s = decimal ? s.replace(/[^\d,]/g, '').replace(/,(?=.*,)/g, '') : s.replace(/\D/g, '')
  if (s.startsWith(',')) s = '0' + s
  return s.slice(0, 7)
}

function recalc(l: InvLine): InvLine {
  return { ...l, filled: isFilled(l), total: totalOf(l), warning: warnOf(l) }
}

function packLabel(l: InvLine) {
  if (l.caseQty == null && l.sleeveQty == null) return l.packText ?? ''
  const parts: string[] = []
  if (l.caseQty != null) parts.push(`кейс ${fmt(l.caseQty)}`)
  if (l.sleeveQty != null) parts.push(`слив ${fmt(l.sleeveQty)}`)
  return `${parts.join(', ')} ${l.unit}`
}

export default function InventoryPage({ countId, onBack }: { countId?: number; onBack?: () => void }) {
  const [count, setCount] = useState<InvCount | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(0)
  const [query, setQuery] = useState('')
  const timers = useRef(new Map<number, number>())
  const pending = useRef(new Map<number, LineBody>())
  const cidRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = countId ? inventoryApi.get(countId) : inventoryApi.current()
    load
      .then((c) => {
        if (!cancelled) setCount(c ?? null)
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err))
      })
    return () => {
      cancelled = true
    }
  }, [countId])

  useEffect(() => {
    cidRef.current = count?.id ?? null
  }, [count])

  const flushOne = useCallback(async (cid: number, lineId: number) => {
    const body = pending.current.get(lineId)
    if (!body) return
    pending.current.delete(lineId)
    const t = timers.current.get(lineId)
    if (t) clearTimeout(t)
    timers.current.delete(lineId)
    setSaving((s) => s + 1)
    try {
      const saved = await inventoryApi.updateLine(cid, lineId, body)
      // пока ждали ответ, человек мог снова поменять цифры: тогда не затираем
      if (!pending.current.has(lineId)) {
        setCount((c) => c && { ...c, lines: c.lines.map((l) => (l.id === lineId ? saved : l)) })
      }
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving((s) => s - 1)
    }
  }, [])

  // при уходе со страницы отправить то, что не успело сохраниться
  useEffect(() => {
    const map = pending.current
    return () => {
      const cid = cidRef.current
      if (cid) [...map.keys()].forEach((id) => void flushOne(cid, id))
    }
  }, [flushOne])

  async function flushAll(cid: number) {
    await Promise.all([...pending.current.keys()].map((id) => flushOne(cid, id)))
  }

  function change(lineId: number, body: LineBody) {
    if (!count) return
    const cid = count.id
    setNotice('')
    setCount((c) => c && { ...c, lines: c.lines.map((l) => (l.id === lineId ? recalc({ ...l, ...body }) : l)) })
    pending.current.set(lineId, body)
    const t = timers.current.get(lineId)
    if (t) clearTimeout(t)
    timers.current.set(lineId, window.setTimeout(() => void flushOne(cid, lineId), 450))
  }

  function scrollToLine(id: number) {
    document.getElementById(`inv-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async function start() {
    setBusy(true)
    setError('')
    try {
      setCount(await inventoryApi.start())
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    if (!count) return
    const empty = count.lines.find((l) => !l.filled)
    if (empty) {
      setError(`Не заполнено позиций: ${count.lines.filter((l) => !l.filled).length}. Если товара нет, нажми «Нет на складе»`)
      scrollToLine(empty.id)
      return
    }
    const flagged = count.lines.find((l) => l.warning && !l.confirmed)
    if (flagged) {
      setError('Есть позиции с большим расхождением. Пересчитай и подтверди')
      scrollToLine(flagged.id)
      return
    }
    if (!confirm('Сдать инвентаризацию? После этого цифры изменить нельзя.')) return
    setBusy(true)
    setError('')
    try {
      await flushAll(count.id)
      setCount(await inventoryApi.submit(count.id))
      setNotice('✅ Инвентаризация сдана. Можно закрыть пункт в маршруте')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

    async function download() {
    if (!count) return
    try {
      await flushAll(count.id)
      await exportCount(count)
    } catch (err) {
      setError(errorText(err))
    }
  }

  // ---------- загрузка и старт ----------
  if (count === undefined) {
    return error ? <div className="error">{error}</div> : <div className="muted">Загрузка…</div>
  }

  if (count === null) {
    const dow = new Date().getDay()
    return (
      <div className="page">
        <div className="panel inv-start">
          <div className="tile-icon">📦</div>
          <h2>Инвентаризация ещё не начата</h2>
          <p className="muted">
            Сегодня {WEEKDAYS[dow]}: {dow === 0 ? 'еженедельный' : 'ежедневный'} лист. Обычно считают вечером, после 21:00.
          </p>
          {error && <div className="error">{error}</div>}
          <button className="btn primary" disabled={busy} onClick={start}>
            {busy ? 'Создаём…' : '📦 Начать инвентаризацию'}
          </button>
        </div>
      </div>
    )
  }

  // ---------- сам лист ----------
  const q = query.trim().toLowerCase()
  const visible = q ? count.lines.filter((l) => l.name.toLowerCase().includes(q)) : count.lines
  const zoneNames = [...new Set(count.lines.map((l) => l.zone))]
  const zoneStats = zoneNames.map((name) => {
    const ls = count.lines.filter((l) => l.zone === name)
    return { name, done: ls.filter((l) => l.filled).length, total: ls.length }
  })
  const filled = count.lines.filter((l) => l.filled).length
  const flags = count.lines.filter((l) => l.warning && !l.confirmed).length
  const pct = count.lines.length ? Math.round((filled * 100) / count.lines.length) : 0
  const date = count.date.split('-').reverse().join('.')
  const submittedAt = count.submittedAt
    ? new Date(count.submittedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="page inv-page">
      {onBack && (
        <button className="btn ghost small inv-back" onClick={onBack}>
          ← К списку
        </button>
      )}

      <div className="panel">
        <div className="panel-row">
          <h2>📦 {count.listTitle} лист</h2>
          <span className={count.status === 'SUBMITTED' ? 'pill ok' : 'pill warn'}>
            {count.status === 'SUBMITTED' ? `Сдано в ${submittedAt}` : 'Черновик'}
          </span>
        </div>
        <p className="muted small">
          {count.outletName}, {date}, считает {count.userName}
        </p>
        <div className="progress">
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="inv-zones">
          {zoneStats.map((z, i) => (
            <button
              key={z.name}
              type="button"
              className={z.done === z.total ? 'inv-zone-chip done' : 'inv-zone-chip'}
              onClick={() => {
                setQuery('')
                document.getElementById(`inv-zone-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            >
              {z.name}
              <small>
                {z.done}/{z.total}
              </small>
            </button>
          ))}
        </div>
      </div>

      <input
        className="inv-search"
        type="search"
        placeholder="Найти позицию"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {notice && <div className="inv-notice">{notice}</div>}
      {error && <div className="error">{error}</div>}

      {zoneNames.map((name, i) => {
        const ls = visible.filter((l) => l.zone === name)
        if (!ls.length) return null
        return (
          <section key={name} className="section-block">
            <h3 className="inv-zone" id={`inv-zone-${i}`}>
              {name}
            </h3>
            {ls.map((l) => (
              <LineCard key={l.id} line={l} editable={count.editable} onChange={(b) => change(l.id, b)} />
            ))}
          </section>
        )
      })}

      <div className="inv-bar">
        <span className="inv-bar-status">
          <b>
            {filled}/{count.lines.length}
          </b>
          {flags > 0 && <span className="text-danger"> · ⚠ {flags}</span>}
          {saving > 0 && <span className="muted"> · сохраняем…</span>}
        </span>
        <button className="btn ghost small" onClick={download}>
          ⬇ Excel
        </button>
        {count.editable && (
          <button className="btn primary small" disabled={busy} onClick={submit}>
            {busy ? 'Сдаём…' : 'Сдать'}
          </button>
        )}
      </div>
    </div>
  )
}

// ================= одна позиция =================

function LineCard({ line, editable, onChange }: { line: InvLine; editable: boolean; onChange: (b: LineBody) => void }) {
  const [txt, setTxt] = useState<Txt>(() => ({ cs: str(line.cs), slv: str(line.slv), ea: str(line.ea) }))
  const needsCheck = !!line.warning && !line.confirmed

  function send(next: Txt, none = false, confirmed = false) {
    onChange({ cs: num(next.cs), slv: num(next.slv), ea: num(next.ea), none, confirmed })
  }

  function edit(f: FieldKey, raw: string) {
    const next = { ...txt, [f]: clean(raw, f === 'ea' && line.decimal) }
    setTxt(next)
    send(next)
  }

  function step(f: FieldKey, d: number) {
    const cur = num(txt[f]) ?? 0
    const next = { ...txt, [f]: fmt(Math.max(0, Math.round((cur + d) * 100) / 100)) }
    setTxt(next)
    send(next)
  }

  function toggleNone() {
    if (line.none) {
      send(txt, false)
    } else {
      const empty = { cs: '', slv: '', ea: '' }
      setTxt(empty)
      send(empty, true)
    }
  }

  const prevDate = line.prevDate ? line.prevDate.split('-').reverse().join('.') : null
  const prevText = !prevDate
    ? null
    : line.prevTotal != null
      ? `${fmt(line.prevTotal)} ${line.unit}`
      : `кейсы ${fmt(line.prevCs ?? 0)}, сливы ${fmt(line.prevSlv ?? 0)}, россыпью ${fmt(line.prevEa ?? 0)}`
  const readonlyText = line.none
    ? 'Нет на складе'
    : [
        line.cs != null ? `${fmt(line.cs)} кс` : '',
        line.slv != null ? `${fmt(line.slv)} сл` : '',
        line.ea != null ? `${fmt(line.ea)} ${line.unit}` : '',
      ]
        .filter(Boolean)
        .join(' + ') || '—'
  const cls = ['inv-line', line.none ? 'none' : line.filled ? 'filled' : '', needsCheck ? 'flag' : ''].join(' ')

  return (
    <article id={`inv-${line.id}`} className={cls}>
      <div className="inv-head">
        <div>
          <div className="inv-name">{line.name}</div>
          {line.packText && (
            <div className={line.caseQty == null && line.sleeveQty == null ? 'inv-pack note' : 'inv-pack'}>
              {packLabel(line)}
            </div>
          )}
        </div>
        <div className={line.total == null ? 'inv-total empty' : 'inv-total'}>
          <b>{line.total == null ? '—' : fmt(line.total)}</b>
          <span>{line.unit}</span>
        </div>
      </div>

      {editable ? (
        <div className="inv-fields">
          {FIELDS.map((f) => (
            <label key={f.k} className="inv-field">
              <span>{f.k === 'ea' ? `Россыпью, ${line.unit}` : f.label}</span>
              <div className="inv-stepper">
                <button type="button" aria-label="Минус" onClick={() => step(f.k, -1)}>
                  −
                </button>
                <input
                  inputMode={f.k === 'ea' && line.decimal ? 'decimal' : 'numeric'}
                  value={txt[f.k]}
                  onChange={(e) => edit(f.k, e.target.value)}
                />
                <button type="button" aria-label="Плюс" onClick={() => step(f.k, 1)}>
                  +
                </button>
              </div>
            </label>
          ))}
          <button type="button" className={line.none ? 'inv-none on' : 'inv-none'} onClick={toggleNone}>
            Нет на складе
          </button>
        </div>
      ) : (
        <div className="inv-readonly">{readonlyText}</div>
      )}

      {needsCheck && editable && (
        <div className="inv-warn">
          <span>⚠ {line.warning}</span>
          <button type="button" onClick={() => send(txt, line.none, true)}>
            Пересчитал, верно
          </button>
        </div>
      )}

      {prevText && (
        <div className="inv-prev">
          В прошлый раз ({prevDate}): {prevText}
          {line.warning && line.confirmed && <span className="inv-ok"> ✓ пересчитано</span>}
        </div>
      )}
    </article>
  )
}