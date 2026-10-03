import { useEffect, useState } from 'react'
import { Modal, errorText } from '../admin/ui'
import AuthImage from '../inside/AuthImage'
import { DAY_PART_LABEL, FLAG_META, SEVERITY_TONE } from '../types'
import type { ChecklistPhoto } from '../types'
import { reviewApi } from './api'
import type { FlagDecision, ItemDecision, QueueFlag, QueueItem, ReviewQueueData, ReviewSummary } from './types'
import './review.css'

const ZONE = 'Asia/Almaty'

const QUICK_REASONS = [
  'Работа не выполнена',
  'Фото не подтверждает выполнение',
  'Прокликано слишком быстро',
  'Не по стандарту',
  'Старое или чужое фото',
]

function hm(iso: string | null) {
  return iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: ZONE }) : '—'
}

function day(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

export default function ReviewQueue({ onSummary }: { onSummary?: (s: ReviewSummary) => void }) {
  const [queue, setQueue] = useState<ReviewQueueData | null>(null)
  const [error, setError] = useState('')
  const [seriousOnly, setSeriousOnly] = useState(true)
  const [busy, setBusy] = useState(false)
  const [viewer, setViewer] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    reviewApi
      .queue()
      .then((q) => {
        if (cancelled) return
        setQueue(q)
        setError('')
        onSummary?.({ openFlags: q.openFlags, awaitingItems: q.awaitingItems })
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err))
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey])

  async function act(action: () => Promise<ReviewSummary>, remove: (q: ReviewQueueData) => ReviewQueueData) {
    setBusy(true)
    setError('')
    try {
      const s = await action()
      setQueue((q) => (q ? { ...remove(q), openFlags: s.openFlags, awaitingItems: s.awaitingItems } : q))
      onSummary?.(s)
      return true
    } catch (err) {
      setError(errorText(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  const decideItem = (i: QueueItem, d: ItemDecision, comment?: string) =>
    act(
      () => reviewApi.decideItem(i.runItemId, d, comment),
      (q) => ({ ...q, items: q.items.filter((x) => x.runItemId !== i.runItemId) }),
    )

  const decideFlag = (f: QueueFlag, d: FlagDecision, comment?: string) =>
    act(
      () => reviewApi.decideFlag(f.flagId, d, comment),
      (q) => ({ ...q, flags: q.flags.filter((x) => x.flagId !== f.flagId) }),
    )

  const decideShift = (shiftId: number, d: FlagDecision, comment?: string) =>
    act(
      () => reviewApi.decideShiftFlags(shiftId, d, comment),
      (q) => ({ ...q, flags: q.flags.filter((x) => x.shiftId !== shiftId) }),
    )

  if (!queue) {
    return error ? <div className="error">{error}</div> : <div className="muted">Загрузка…</div>
  }

  const flags = seriousOnly ? queue.flags.filter((f) => f.severity !== 'LOW') : queue.flags
  const groups: { shiftId: number; head: QueueFlag; flags: QueueFlag[] }[] = []
  for (const f of flags) {
    let g = groups.find((x) => x.shiftId === f.shiftId)
    if (!g) {
      g = { shiftId: f.shiftId, head: f, flags: [] }
      groups.push(g)
    }
    g.flags.push(f)
  }

  return (
    <div className="page">
      <div className="stats">
        <div className="stat">
          <span className="muted small">Подтвердить выполнение</span>
          <span className="stat-value">{queue.awaitingItems}</span>
        </div>
        <div className="stat">
          <span className="muted small">Серьёзные флаги</span>
          <span className={queue.openFlags ? 'stat-value text-danger' : 'stat-value'}>{queue.openFlags}</span>
        </div>
      </div>

      <div className="toolbar">
        <label className="check">
          <input type="checkbox" checked={seriousOnly} onChange={(e) => setSeriousOnly(e.target.checked)} />
          Только серьёзные (🔴 и 🟠)
        </label>
        <button className="btn" title="Обновить" onClick={() => setReloadKey((k) => k + 1)}>
          ↻
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <section className="section-block">
        <div className="section-head static">
          <span className="section-title">👁 Подтвердить выполнение</span>
          <span className="section-count">{queue.items.length}</span>
        </div>
        {queue.items.length === 0 ? (
          <div className="muted small">Всё проверено 👌</div>
        ) : (
          <div className="section-items">
            {queue.items.map((i) => (
              <ItemReviewCard
                key={i.runItemId}
                item={i}
                busy={busy}
                onPhoto={setViewer}
                onDecide={(d, c) => decideItem(i, d, c)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="section-block">
        <div className="section-head static">
          <span className="section-title">🚩 Флаги</span>
          <span className="section-count">{flags.length}</span>
        </div>
        {groups.length === 0 ? (
          <div className="muted small">Непроверенных флагов нет 👌</div>
        ) : (
          groups.map((g) => (
            <ShiftGroup
              key={g.shiftId}
              head={g.head}
              flags={g.flags}
              busy={busy}
              onPhoto={setViewer}
              onDecideFlag={decideFlag}
              onDecideShift={(d, c) => decideShift(g.shiftId, d, c)}
            />
          ))
        )}
      </section>

      {viewer && (
        <Modal title="Фото" onClose={() => setViewer(null)}>
          <AuthImage src={viewer} className="viewer-img" />
        </Modal>
      )}
    </div>
  )
}

// ---------------- причина нарушения ----------------

function ReasonBox({
  confirmLabel,
  busy,
  onCancel,
  onSubmit,
}: {
  confirmLabel: string
  busy: boolean
  onCancel: () => void
  onSubmit: (text: string) => void
}) {
  const [text, setText] = useState('')
  return (
    <div className="reason-box">
      <div className="reason-chips">
        {QUICK_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            className="chip-btn"
            onClick={() => setText((t) => (t.trim() ? `${t.trim()}. ${r}` : r))}
          >
            {r}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="В чём нарушение? Сотрудник увидит этот текст"
        autoFocus
      />
      <div className="problem-actions">
        <button className="btn ghost small" onClick={onCancel}>
          Отмена
        </button>
        <button className="btn danger small" disabled={busy || !text.trim()} onClick={() => onSubmit(text.trim())}>
          {confirmLabel}
        </button>
      </div>
      <p className="muted small">🔔 Сотрудник получит это как обратную связь</p>
    </div>
  )
}

function Photos({ photos, onOpen }: { photos: ChecklistPhoto[]; onOpen: (url: string) => void }) {
  return (
    <div className="photo-strip">
      {photos.map((ph) => (
        <div key={ph.id} className="thumb-wrap">
          <AuthImage src={ph.url} className="thumb" onClick={() => onOpen(ph.url)} />
          <span className="thumb-time">{hm(ph.uploadedAt)}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------- группа флагов одной смены ----------------

function ShiftGroup({
  head,
  flags,
  busy,
  onPhoto,
  onDecideFlag,
  onDecideShift,
}: {
  head: QueueFlag
  flags: QueueFlag[]
  busy: boolean
  onPhoto: (url: string) => void
  onDecideFlag: (f: QueueFlag, d: FlagDecision, comment?: string) => Promise<boolean>
  onDecideShift: (d: FlagDecision, comment?: string) => Promise<boolean>
}) {
  const [bulkReason, setBulkReason] = useState(false)

  function dismissAll() {
    if (!confirm('Снять ВСЕ непроверенные флаги этой смены как ложные (включая скрытые низкие)?')) return
    void onDecideShift('DISMISS')
  }

  return (
    <div className="panel review-group">
      <div className="review-group-head">
        <div>
          <strong>{head.userName}</strong>{' '}
          <span className="muted small">
            · {head.outletName} · {head.dayPart === 'MORNING' ? '🌅' : '🌙'} {DAY_PART_LABEL[head.dayPart]} ·{' '}
            {day(head.shiftDate)} · смена #{head.shiftId}
          </span>
        </div>
        {!bulkReason && (
          <div className="review-actions">
            <button className="btn danger small" disabled={busy} onClick={() => setBulkReason(true)}>
              🚩 Все — нарушение
            </button>
            <button className="btn small" disabled={busy} onClick={dismissAll}>
              👌 Снять все
            </button>
          </div>
        )}
      </div>

      {bulkReason && (
        <div className="review-flag-row">
          <ReasonBox
            confirmLabel="🚩 Подтвердить все нарушения"
            busy={busy}
            onCancel={() => setBulkReason(false)}
            onSubmit={async (text) => {
              if (await onDecideShift('CONFIRM', text)) setBulkReason(false)
            }}
          />
        </div>
      )}

      {flags.map((f) => (
        <FlagRow key={f.flagId} f={f} busy={busy} onPhoto={onPhoto} onDecide={(d, c) => onDecideFlag(f, d, c)} />
      ))}
    </div>
  )
}

function FlagRow({
  f,
  busy,
  onPhoto,
  onDecide,
}: {
  f: QueueFlag
  busy: boolean
  onPhoto: (url: string) => void
  onDecide: (d: FlagDecision, comment?: string) => Promise<boolean>
}) {
  const [confirming, setConfirming] = useState(false)
  const meta = FLAG_META[f.type]

  return (
    <div className="review-flag-row">
      <div className="review-flag-main">
        <div className="item-meta">
          <span className={`meta-chip flag-${SEVERITY_TONE[f.severity]}`}>
            {meta.icon} {meta.label}
          </span>
          <span className="muted small">{hm(f.createdAt)}</span>
        </div>
        {f.itemTitle && <div className="strong">{f.itemTitle}</div>}
        {f.details && <div className="muted small">{f.details}</div>}
        {f.photos.length > 0 && <Photos photos={f.photos} onOpen={onPhoto} />}
        {confirming && (
          <ReasonBox
            confirmLabel="🚩 Подтвердить нарушение"
            busy={busy}
            onCancel={() => setConfirming(false)}
            onSubmit={(text) => void onDecide('CONFIRM', text)}
          />
        )}
      </div>
      {!confirming && (
        <div className="review-actions">
          <button className="btn danger small" disabled={busy} onClick={() => setConfirming(true)}>
            🚩 Нарушение
          </button>
          <button className="btn small" disabled={busy} onClick={() => void onDecide('DISMISS')}>
            👌 Всё ок
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------- пункты на подтверждение (ночники) ----------------

function ItemReviewCard({
  item,
  busy,
  onPhoto,
  onDecide,
}: {
  item: QueueItem
  busy: boolean
  onPhoto: (url: string) => void
  onDecide: (d: ItemDecision, comment?: string) => Promise<boolean>
}) {
  const [rejecting, setRejecting] = useState(false)

  return (
    <div className={`item-card report ${item.status.toLowerCase()}`}>
      <div className="muted small">
        {item.userName} · {item.outletName} · {item.dayPart === 'MORNING' ? '🌅' : '🌙'} {DAY_PART_LABEL[item.dayPart]} ·{' '}
        {day(item.shiftDate)} · закрыто в {hm(item.doneAt)}
      </div>
      <div className="item-title">{item.title}</div>
      {item.status === 'PROBLEM' && (
        <div className="item-meta">
          <span className="meta-chip status-problem">Инсайд отметил проблему</span>
        </div>
      )}
      {item.comment && <div className="item-comment">💬 {item.comment}</div>}
      {item.photos.length > 0 ? (
        <Photos photos={item.photos} onOpen={onPhoto} />
      ) : (
        <div className="muted small">Фото нет</div>
      )}

      {rejecting ? (
        <ReasonBox
          confirmLabel="❌ Неправильно принято"
          busy={busy}
          onCancel={() => setRejecting(false)}
          onSubmit={(text) => void onDecide('REJECTED', text)}
        />
      ) : (
        <div className="review-actions">
          <button className="btn primary small" disabled={busy} onClick={() => void onDecide('APPROVED')}>
            ✅ Принято
          </button>
          <button className="btn danger small" disabled={busy} onClick={() => setRejecting(true)}>
            ❌ Неправильно
          </button>
        </div>
      )}
    </div>
  )
}