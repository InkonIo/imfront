import { useMemo, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { PART_LABEL, num, has, tone, DOW, signed, fmt } from './utils'
import type { Async } from './utils'
import type { Row } from './api'

export function Card(p: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`ins-card ${p.className ?? ''}`}>
      {(p.title || p.right) && (
        <header className="ins-card-h">
          <div>
            {p.title && <h3>{p.title}</h3>}
            {p.sub && <div className="ins-sub">{p.sub}</div>}
          </div>
          {p.right}
        </header>
      )}
      <div className={p.pad === false ? '' : 'ins-card-b'}>{p.children}</div>
    </section>
  )
}

export function Kpi(p: { label: string; value: ReactNode; hint?: ReactNode; delta?: number | null; deltaGoodUp?: boolean; tone?: string }) {
  const good = p.deltaGoodUp !== false
  const d = p.delta
  return (
    <div className={`ins-kpi ${p.tone ? 'is-' + p.tone : ''}`}>
      <div className="ins-kpi-l">{p.label}</div>
      <div className="ins-kpi-v">{p.value}</div>
      <div className="ins-kpi-f">
        {d != null && Math.abs(d) >= 0.05 && (
          <span className={`ins-delta ${(d > 0) === good ? 'up' : 'down'}`}>
            {d > 0 ? '▲' : '▼'} {signed(Math.round(d * 10) / 10, 1).replace('+', '')}
          </span>
        )}
        {p.hint && <span className="ins-hint">{p.hint}</span>}
      </div>
    </div>
  )
}

export function Pill(p: { children: ReactNode; kind?: string; title?: string }) {
  return <span className={`ins-pill k-${p.kind ?? 'mute'}`} title={p.title}>{p.children}</span>
}

export function Avatar({ name, size = 32 }: { name?: string; size?: number }) {
  const seed = [...(name ?? '?')].reduce((a, c) => a + c.charCodeAt(0), 0)
  const bg = ['#fcb614', '#2a78d6', '#1baf7a', '#eb6834', '#e87ba4', '#4a3aa7'][seed % 6]
  const txt = (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
  return <span className="ins-av" style={{ width: size, height: size, background: bg, fontSize: size * 0.4 }}>{txt}</span>
}

export function State<T>({ s, children, empty }: { s: Async<T>; children: (d: T) => ReactNode; empty?: (d: T) => boolean }) {
  if (s.error) return <div className="ins-err">Не удалось загрузить: {s.error}</div>
  if (!s.data) return <div className="ins-load"><span className="ins-spin" />Загрузка…</div>
  if (empty?.(s.data)) return <div className="ins-empty">За выбранный период данных нет</div>
  return <div className={s.loading ? 'ins-stale' : ''}>{children(s.data)}</div>
}

export function Modal(p: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && p.onClose()
    window.addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [p])
  return createPortal(
    <div className="ins-modal-bg" onMouseDown={e => e.target === e.currentTarget && p.onClose()}>
      <div className={`ins-modal ${p.wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <header>
          <div>
            <h2>{p.title}</h2>
            {p.sub && <div className="ins-sub">{p.sub}</div>}
          </div>
          <button className="ins-x" onClick={p.onClose} aria-label="Закрыть">✕</button>
        </header>
        <div className="ins-modal-b">{p.children}</div>
      </div>
    </div>,
    document.body,
  )
}

export interface Col<T = Row> {
  key: string
  title: ReactNode
  render?: (r: T) => ReactNode
  sort?: (r: T) => number | string
  align?: 'right' | 'center'
  width?: number | string
  className?: (r: T) => string
}

export function Table<T extends Row = Row>(p: {
  cols: Col<T>[]
  rows: T[]
  onRow?: (r: T) => void
  sortKey?: string
  desc?: boolean
  rowClass?: (r: T) => string
  max?: number
  empty?: string
}) {
  const [key, setKey] = useState(p.sortKey ?? '')
  const [desc, setDesc] = useState(p.desc ?? true)
  const [all, setAll] = useState(false)
  const rows = useMemo(() => {
    const c = p.cols.find(x => x.key === key)
    if (!c?.sort) return p.rows
    const f = c.sort
    return [...p.rows].sort((a, b) => {
      const x = f(a), y = f(b)
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ru')
      return desc ? -r : r
    })
  }, [p.rows, p.cols, key, desc])
  const shown = p.max && !all ? rows.slice(0, p.max) : rows
  if (!rows.length) return <div className="ins-empty">{p.empty ?? 'Нет данных'}</div>
  return (
    <div className="ins-tw">
      <table className="ins-t">
        <thead>
          <tr>
            {p.cols.map(c => (
              <th key={c.key} style={{ width: c.width, textAlign: c.align }}
                  className={c.sort ? 'sortable' : ''}
                  onClick={() => { if (!c.sort) return; if (key === c.key) setDesc(!desc); else { setKey(c.key); setDesc(true) } }}>
                {c.title}{key === c.key && <i>{desc ? ' ↓' : ' ↑'}</i>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i} className={`${p.onRow ? 'click' : ''} ${p.rowClass?.(r) ?? ''}`} onClick={() => p.onRow?.(r)}>
              {p.cols.map(c => (
                <td key={c.key} style={{ textAlign: c.align }} className={c.className?.(r) ?? ''}>
                  {c.render ? c.render(r) : (r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {p.max && rows.length > p.max && (
        <button className="ins-more" onClick={() => setAll(!all)}>{all ? 'Свернуть' : `Показать все (${rows.length})`}</button>
      )}
    </div>
  )
}

/** Процент с мини-полосой. */
export function PctBar({ v, good, warn }: { v: unknown; good?: number; warn?: number }) {
  if (!has(v)) return <span className="ins-mute">—</span>
  const n = Math.max(0, Math.min(100, num(v)))
  return (
    <span className={`ins-pctbar t-${tone(v, good, warn)}`}>
      <b>{fmt(v)}%</b>
      <span><i style={{ width: `${n}%` }} /></span>
    </span>
  )
}

export const PART_COLORS: Record<string, string> = {
  done: '#1baf7a', on_time: '#2a78d6', approved: '#4a3aa7', other: '#fcb614',
  skipped: '#eda100', not_done: '#eb6834', flag_medium: '#e87ba4', flag_high: '#e52723',
}

/** Из чего сложился балл: зелёное/синее — плюс, тёплое — минус. */
export function ScoreParts({ parts, compact }: { parts: Row; compact?: boolean }) {
  const entries = Object.entries(parts ?? {}).map(([k, v]) => [k, num(v)] as const).filter(([, v]) => v !== 0)
  const pos = entries.filter(([, v]) => v > 0), neg = entries.filter(([, v]) => v < 0)
  const sp = pos.reduce((a, [, v]) => a + v, 0), sn = neg.reduce((a, [, v]) => a - v, 0)
  const tot = sp + sn || 1
  const seg = ([k, v]: readonly [string, number]) => (
    <i key={k} style={{ width: `${(Math.abs(v) / tot) * 100}%`, background: PART_COLORS[k] }}
       title={`${PART_LABEL[k] ?? k}: ${signed(v)}`} />
  )
  return (
    <div className={`ins-parts ${compact ? 'compact' : ''}`}>
      <div className="bar">{pos.map(seg)}{sn > 0 && <em />}{neg.map(seg)}</div>
      {!compact && (
        <ul>
          {entries.map(([k, v]) => (
            <li key={k}><span style={{ background: PART_COLORS[k] }} />{PART_LABEL[k] ?? k}<b className={v < 0 ? 'neg' : 'pos'}>{signed(v)}</b></li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Тепловая карта активности: день недели × час. */
export function Heatmap({ cells }: { cells: Row[] }) {
  const grid = useMemo(() => {
    const m = new Map<string, number>()
    let max = 0
    for (const c of cells) { const v = num(c.minutes); m.set(`${c.dow}-${c.hour}`, v); max = Math.max(max, v) }
    return { m, max }
  }, [cells])
  const hours = Array.from({ length: 24 }, (_, i) => i)
  return (
    <div className="ins-heat">
      <div className="hrow head"><span />{hours.map(h => <span key={h}>{h % 3 === 0 ? h : ''}</span>)}</div>
      {DOW.map((d, i) => (
        <div className="hrow" key={d}>
          <span className="dl">{d}</span>
          {hours.map(h => {
            const v = grid.m.get(`${i + 1}-${h}`) ?? 0
            const a = grid.max ? v / grid.max : 0
            return <span key={h} className="cell" title={`${d}, ${h}:00 — ${fmt(v)} мин активности`}
                         style={{ background: v ? `rgba(252,182,20,${0.15 + a * 0.85})` : undefined }} />
          })}
        </div>
      ))}
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  return (
    <nav className="ins-tabs" role="tablist">
      {tabs.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>
      ))}
    </nav>
  )
}

/** Единые подсказки графиков. */
export const tip = {
  contentStyle: { background: 'var(--ins-card)', border: '1px solid var(--ins-line)', borderRadius: 10, fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,.12)', color: 'var(--ins-text)' },
  labelStyle: { color: 'var(--ins-mute)', marginBottom: 4 },
  cursor: { fill: 'rgba(252,182,20,.12)' },
}
export const axis = { stroke: 'var(--ins-mute)', fontSize: 11, tickLine: false, axisLine: false } as const
