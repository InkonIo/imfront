import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { errorText } from '../admin/ui'
import { useAuth } from '../auth'
import { SHIFT_ROLE_LABEL } from '../types'
import type { Outlet, ShiftRole } from '../types'
import { ratingApi } from './api'
import type { RatingBoard, RatingEntry } from './types'
import './rating.css'

type Period = 'week' | 'month' | 'lastMonth'

const PERIODS: { id: Period; label: string }[] = [
  { id: 'week', label: 'Эта неделя' },
  { id: 'month', label: 'Этот месяц' },
  { id: 'lastMonth', label: 'Прошлый месяц' },
]

const ROLES: ShiftRole[] = ['INSIDE', 'PRODUCTION_MANAGER', 'SERVICE_MANAGER']
const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }
const REVEAL_DELAY: Record<number, number> = { 3: 0, 2: 450, 1: 900 } // как в Kahoot: 3 → 2 → 1
const AVATAR_COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#864cbf', '#0aa3a3', '#ff7a00']
const CONFETTI_COLORS = ['#f2a007', '#e21b3c', '#1368ce', '#26890c', '#ffffff', '#ff7ad9', '#7dd3fc']

function isoLocal(d: Date) {
  return d.toLocaleDateString('en-CA')
}

function periodRange(p: Period): [string, string] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (p === 'week') {
    const monday = new Date(today)
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
    return [isoLocal(monday), isoLocal(today)]
  }
  if (p === 'month') return [isoLocal(new Date(today.getFullYear(), today.getMonth(), 1)), isoLocal(today)]
  return [
    isoLocal(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
    isoLocal(new Date(today.getFullYear(), today.getMonth(), 0)),
  ]
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

function avatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length]
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

/** Баллы «набегают» от 0 до значения. */
function useCountUp(target: number, duration: number, delay: number) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let raf = 0
    let start = 0
    const timer = setTimeout(() => {
      const step = (ts: number) => {
        if (!start) start = ts
        const p = Math.min(1, (ts - start) / duration)
        setValue(Math.round(target * (1 - Math.pow(1 - p, 3))))
        if (p < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }, delay)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [target, duration, delay])
  return value
}

// ================= страница =================

export default function RatingPage() {
  const { user } = useAuth()
  const isAdmin = user?.accountRole === 'SUPER_ADMIN'
  const [period, setPeriod] = useState<Period>('week')
  const [role, setRole] = useState<ShiftRole>('INSIDE')
  const [outlets, setOutlets] = useState<Outlet[]>(user?.outlets ?? [])
  const [outletId, setOutletId] = useState<number | null>(user?.outlets[0]?.id ?? null)
  const [board, setBoard] = useState<RatingBoard | null>(null)
  const [error, setError] = useState('')
  const [showId, setShowId] = useState(0) // чтобы анимация проигрывалась заново при смене фильтров

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    api
      .adminOutlets()
      .then((o) => {
        if (!cancelled) setOutlets(o)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isAdmin])

  useEffect(() => {
    let cancelled = false
    const [from, to] = periodRange(period)
    ratingApi
      .board(from, to, role, outletId)
      .then((b) => {
        if (cancelled) return
        setBoard(b)
        setError('')
        setShowId((k) => k + 1)
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err))
      })
    return () => {
      cancelled = true
    }
  }, [period, role, outletId])

  const entries = board?.entries ?? []
  const top = entries.slice(0, 3)
  const rest = entries.slice(3)
  const me = entries.find((e) => e.userId === user?.id)

  return (
    <div className="page rating-page">
      <div className="toolbar">
        <div className="filter-tabs">
          {PERIODS.map((p) => (
            <button key={p.id} className={p.id === period ? 'tab active' : 'tab'} onClick={() => setPeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <select className="select" value={role} onChange={(e) => setRole(e.target.value as ShiftRole)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {SHIFT_ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={outletId ?? ''}
          onChange={(e) => setOutletId(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">🌐 Все точки</option>
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>
              📍 {o.name}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="stage" key={showId}>
        <div className="stage-title">🏆 {SHIFT_ROLE_LABEL[role]} · {PERIODS.find((p) => p.id === period)?.label}</div>
        {board === null && !error ? (
          <div className="stage-empty">Загрузка…</div>
        ) : entries.length === 0 ? (
          <div className="stage-empty">
            <div className="stage-empty-icon">🏁</div>
            Пока никто не закончил ни одной смены за этот период
          </div>
        ) : (
          <>
            <Podium top={top} meId={user?.id} />
            {top.length > 0 && <Confetti />}
          </>
        )}
      </div>

      {me && me.rank > 3 && (
        <div className="me-card">
          <span className="me-rank">#{me.rank}</span>
          <span>
            Ты на <b>{me.rank}</b> месте с <b>{me.score}</b> {plural(me.score, 'баллом', 'баллами', 'баллами')}.
            {entries[me.rank - 2] && ` До ${me.rank - 1}-го места: ${entries[me.rank - 2].score - me.score + 1}.`}
          </span>
        </div>
      )}

      {rest.length > 0 && (
        <ol className="board-list">
          {rest.map((e, i) => (
            <BoardRow key={`${showId}-${e.userId}`} e={e} me={e.userId === user?.id} index={i} />
          ))}
        </ol>
      )}

      <details className="panel rules">
        <summary>Как считаются баллы</summary>
        <ul>
          <li>+1 за каждый выполненный пункт (сделано или честно отмеченная проблема)</li>
          <li>+1 если пункт со сроком «до HH:mm» закрыт вовремя</li>
          <li>+2 если директор принял пункт ✅</li>
          <li>+10 за идеальную смену: 100%, без пропусков и подтверждённых нарушений</li>
          <li>−1 за пропущенный пункт, −2 за невыполненный к концу смены</li>
          <li>−3 за подтверждённое директором нарушение 🟠, −5 за серьёзное 🔴</li>
        </ul>
        <p className="muted small">Непроверенные флаги баллы не снимают. Решение директора пересчитывает баллы сразу.</p>
      </details>
    </div>
  )
}

// ================= подиум =================

function Podium({ top, meId }: { top: RatingEntry[]; meId?: number }) {
  // раскладка как на пьедестале: 2 — 1 — 3
  const slots: { entry?: RatingEntry; place: number }[] = [
    { entry: top[1], place: 2 },
    { entry: top[0], place: 1 },
    { entry: top[2], place: 3 },
  ]
  return (
    <div className="podium">
      {slots.map(({ entry, place }) =>
        entry ? (
          <PodiumSlot key={entry.userId} entry={entry} place={place} me={entry.userId === meId} />
        ) : (
          <div key={place} className={`podium-slot p${place} vacant`}>
            <div className="podium-bar" style={{ animationDelay: `${REVEAL_DELAY[place]}ms` }}>
              <span className="podium-place">{place}</span>
            </div>
          </div>
        ),
      )}
    </div>
  )
}

function PodiumSlot({ entry, place, me }: { entry: RatingEntry; place: number; me: boolean }) {
  const delay = REVEAL_DELAY[place]
  const score = useCountUp(entry.score, 1100, delay + 350)
  return (
    <div className={`podium-slot p${place} ${me ? 'me' : ''}`}>
      <div className="podium-person" style={{ animationDelay: `${delay + 250}ms` }}>
        {place === 1 && <div className="crown">👑</div>}
        <div className="avatar" style={{ background: avatarColor(entry.userId) }}>
          {initials(entry.name)}
        </div>
        <div className="podium-name">
          {entry.name}
          {me && <span className="you-tag">ты</span>}
        </div>
        <div className="podium-score">
          {score}
          <small> {plural(entry.score, 'балл', 'балла', 'баллов')}</small>
        </div>
        <div className="podium-sub">
          {entry.shifts} {plural(entry.shifts, 'смена', 'смены', 'смен')} · ⌀ {entry.avgScore}
        </div>
      </div>
      <div className="podium-bar" style={{ animationDelay: `${delay}ms` }}>
        <span className="podium-medal">{MEDAL[place]}</span>
        <span className="podium-place">{place}</span>
      </div>
    </div>
  )
}

function Confetti() {
  // без Math.random: позиции детерминированы, но выглядят случайно
  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: (i * 37 + 7) % 100,
        delay: 1.3 + (i % 12) * 0.07,
        duration: 2.2 + (i % 7) * 0.3,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: (i * 47) % 360,
        size: 6 + (i % 4) * 2,
        drift: ((i % 9) - 4) * 12,
      })),
    [],
  )
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i
          key={i}
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 1.6,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              '--rot': `${p.rotate}deg`,
              '--drift': `${p.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}

// ================= остальные места =================

function BoardRow({ e, me, index }: { e: RatingEntry; me: boolean; index: number }) {
  return (
    <li className={me ? 'board-row me' : 'board-row'} style={{ animationDelay: `${1.6 + index * 0.06}s` }}>
      <span className="board-rank">{e.rank}</span>
      <span className="avatar small" style={{ background: avatarColor(e.userId) }}>
        {initials(e.name)}
      </span>
      <div className="board-main">
        <div className="board-name">
          {e.name}
          {me && <span className="you-tag">ты</span>}
        </div>
        <div className="board-stats">
          <span>
            {e.shifts} {plural(e.shifts, 'смена', 'смены', 'смен')}
          </span>
          <span>✅ {e.completionPct}%</span>
          {e.onTimePct !== null && <span>⏰ {e.onTimePct}% вовремя</span>}
          {e.perfect > 0 && <span>⭐ {e.perfect} идеальн.</span>}
          {e.violations > 0 && <span className="text-danger">🚩 {e.violations}</span>}
        </div>
      </div>
      <div className="board-score">
        {e.score}
        <small>⌀ {e.avgScore}</small>
      </div>
    </li>
  )
}