import { useEffect, useState } from 'react'
import { api } from '../api'
import AuthImage from '../inside/AuthImage'
import { DAY_PART_LABEL, FLAG_META, SHIFT_ROLE_LABEL } from '../types'
import type { ItemReport, ShiftReport, ShiftSummary } from '../types'
import { Modal, errorText } from './ui'

const ZONE = 'Asia/Almaty'

function todayAlmaty() {
  return new Date().toLocaleDateString('en-CA', { timeZone: ZONE })
}

function hm(iso: string | null) {
  return iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: ZONE }) : null
}

const pct = (a: number, b: number) => (b ? Math.round((a * 100) / b) : 0)

// ================= список смен за день =================

export default function ShiftsReport({ onOpenLog }: { onOpenLog: (shiftId: number) => void }) {
  const [date, setDate] = useState(todayAlmaty)
  const [list, setList] = useState<ShiftSummary[] | null>(null)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    api
      .auditShifts(date)
      .then((res) => {
        if (cancelled) return
        setList(res)
        setError('')
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err))
      })
    return () => {
      cancelled = true
    }
  }, [date, reloadKey])

  if (openId !== null) {
    return <ShiftReportView id={openId} onBack={() => setOpenId(null)} onOpenLog={onOpenLog} />
  }

  const sorted = [...(list ?? [])].sort(
    (a, b) => (a.dayPart === b.dayPart ? 0 : a.dayPart === 'MORNING' ? -1 : 1) || a.startedAt.localeCompare(b.startedAt),
  )

  return (
    <div className="page">
      <div className="toolbar">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayAlmaty())} />
        <button className="btn" title="Обновить" onClick={() => setReloadKey((k) => k + 1)}>
          ↻
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {list === null && !error && <div className="muted">Загрузка…</div>}
      {list !== null && list.length === 0 && (
        <div className="placeholder">
          <div className="tile-icon">🗓️</div>
          <h2>Смен нет</h2>
          <p className="muted">За этот день никто не начинал смену.</p>
        </div>
      )}

      <div className="shift-grid">
        {sorted.map((s) => (
          <button
            key={s.shiftId}
            className={s.flagged > 0 ? 'shift-card flagged' : 'shift-card'}
            onClick={() => setOpenId(s.shiftId)}
          >
            <div className="shift-card-top">
              <span className="shift-part">
                {s.dayPart === 'MORNING' ? '🌅' : '🌙'} {DAY_PART_LABEL[s.dayPart]}
              </span>
              <span className="muted">{SHIFT_ROLE_LABEL[s.shiftRole]}</span>
              {!s.finishedAt && <span className="live-badge">● идёт</span>}
            </div>
            <div className="shift-name">{s.userName}</div>
            <div className="muted small">
              📍 {s.outletName} · {hm(s.startedAt)} – {s.finishedAt ? hm(s.finishedAt) : 'сейчас'}
            </div>
            <div className="progress">
              <span style={{ width: `${pct(s.completed, s.total)}%` }} />
            </div>
            <div className="shift-stats">
              <span>
                ✅ {s.completed}/{s.total}
              </span>
              <span>⚠️ {s.problems}</span>
              <span>📸 {s.photos}</span>
              <span className={s.flagged ? 'text-danger' : ''}>🚩 {s.flagged}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ================= отчёт по одной смене =================

function ShiftReportView({
  id,
  onBack,
  onOpenLog,
}: {
  id: number
  onBack: () => void
  onOpenLog: (shiftId: number) => void
}) {
  const [report, setReport] = useState<ShiftReport | null>(null)
  const [error, setError] = useState('')
  const [onlyMarked, setOnlyMarked] = useState(false)
  const [viewer, setViewer] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .auditShift(id)
      .then((r) => {
        if (!cancelled) setReport(r)
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err))
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (error) {
    return (
      <div className="page">
        <button className="btn ghost small" onClick={onBack}>
          ← Все смены
        </button>
        <div className="error">{error}</div>
      </div>
    )
  }
  if (!report) return <div className="muted">Загрузка отчёта…</div>

  const s = report.shift
  const items = onlyMarked
    ? report.items.filter((i) => i.flags.length > 0 || i.status === 'PROBLEM')
    : report.items

  const sections: { order: number; title: string; items: ItemReport[] }[] = []
  for (const i of items) {
    let g = sections.find((x) => x.order === i.sectionOrder)
    if (!g) {
      g = { order: i.sectionOrder, title: i.sectionTitle, items: [] }
      sections.push(g)
    }
    g.items.push(i)
  }
  sections.sort((a, b) => a.order - b.order)

  const dateLabel = new Date(`${s.shiftDate}T00:00:00`).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  return (
    <div className="page">
      <div className="report-top">
        <button className="btn ghost small" onClick={onBack}>
          ← Все смены
        </button>
        <button className="btn small" onClick={() => onOpenLog(s.shiftId)}>
          📜 Журнал смены
        </button>
      </div>

      <div className="panel">
        <div className="panel-row">
          <h2>
            {s.userName} <span className="muted small">@{s.userLogin}</span>
          </h2>
          <span className="chip">
            {s.dayPart === 'MORNING' ? '🌅' : '🌙'} {DAY_PART_LABEL[s.dayPart]} · {SHIFT_ROLE_LABEL[s.shiftRole]}
          </span>
        </div>
        <p className="muted">
          📍 {s.outletName} · {dateLabel} · {hm(s.startedAt)} – {s.finishedAt ? hm(s.finishedAt) : 'идёт сейчас'}
        </p>
        <div className="stats">
          <div className="stat">
            <span className="muted small">Выполнено</span>
            <span className="stat-value">
              {s.completed}/{s.total}
            </span>
          </div>
          <div className="stat">
            <span className="muted small">Проблем</span>
            <span className="stat-value">{s.problems}</span>
          </div>
          <div className="stat">
            <span className="muted small">Фото</span>
            <span className="stat-value">{s.photos}</span>
          </div>
          <div className="stat">
            <span className="muted small">С флагами 🚩</span>
            <span className={s.flagged ? 'stat-value text-danger' : 'stat-value'}>{s.flagged}</span>
          </div>
        </div>
      </div>

      <label className="check">
        <input type="checkbox" checked={onlyMarked} onChange={(e) => setOnlyMarked(e.target.checked)} />
        Только с отметками (🚩 и проблемы)
      </label>

      {sections.length === 0 && <div className="muted">Нечего показать</div>}

      {sections.map((sec) => (
        <section key={sec.order} className="section-block">
          <div className="section-head static">
            <span className="section-title">{sec.title}</span>
          </div>
          <div className="section-items">
            {sec.items.map((i) => (
              <ReportItem key={i.id} i={i} onPhoto={setViewer} />
            ))}
          </div>
        </section>
      ))}

      {viewer && (
        <Modal title="Фото" onClose={() => setViewer(null)}>
          <AuthImage src={viewer} className="viewer-img" />
        </Modal>
      )}
    </div>
  )
}

const STATUS_VIEW: Record<string, { icon: string; label: string }> = {
  DONE: { icon: '✓', label: 'Сделано' },
  PROBLEM: { icon: '⚠️', label: 'Проблема' },
  SKIPPED: { icon: '⏭', label: 'Пропущено' },
  PENDING: { icon: '…', label: 'Не закрыт' },
}

function ReportItem({ i, onPhoto }: { i: ItemReport; onPhoto: (url: string) => void }) {
  const danger = i.flags.some((f) => FLAG_META[f].tone === 'danger')
  const st = STATUS_VIEW[i.status]

  return (
    <div className={`item-card report ${i.status.toLowerCase()} ${danger ? 'flag-danger' : ''}`}>
      <div className="item-title">{i.title}</div>

      <div className="report-timeline">
        {i.startedAt && <span>▶ {hm(i.startedAt)}</span>}
        {i.startedAt && i.doneAt && <span className="muted">→</span>}
        {i.doneAt ? (
          <span>
            {st.icon} {hm(i.doneAt)}
          </span>
        ) : (
          <span className="muted">{st.label}</span>
        )}
        {i.actualMin !== null && (
          <span className="meta-chip">
            {i.actualMin} мин{i.normMin ? ` из ${i.normMin}` : ''}
          </span>
        )}
        {i.actualMin === null && i.normMin !== null && <span className="meta-chip">норма {i.normMin} мин</span>}
        {i.dueTo && <span className="meta-chip">срок до {i.dueTo.slice(0, 5)}</span>}
        {i.directorReview && <span className="meta-chip">👁 на проверку</span>}
      </div>

      {i.flags.length > 0 && (
        <div className="item-meta">
          {i.flags.map((f) => (
            <span key={f} className={`meta-chip flag-${FLAG_META[f].tone}`}>
              {FLAG_META[f].icon} {FLAG_META[f].label}
              {f === 'LATE' && i.lateMin ? ` на ${i.lateMin} мин` : ''}
            </span>
          ))}
        </div>
      )}

      {i.comment && <div className="item-comment">💬 {i.comment}</div>}

      {i.photos.length > 0 && (
        <div className="photo-strip">
          {i.photos.map((ph) => (
            <div key={ph.id} className="thumb-wrap">
              <AuthImage src={ph.url} className="thumb" onClick={() => onPhoto(ph.url)} />
              <span className="thumb-time">{hm(ph.uploadedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}