import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { api } from '../api'
import { Modal } from '../admin/ui'
import type { Checklist, RunItem, RunItemStatus } from '../types'
import AuthImage from './AuthImage'
import CameraModal, { cameraSupported } from './CameraModal'
import { compressImage, fmtTime, isOverdue, readTakenAt, timingLabel } from './utils'

const EARLY_GRACE_MS = 5 * 60_000

const STATUS_LABEL: Record<RunItemStatus, string> = {
  PENDING: '',
  DONE: 'Сделано',
  PROBLEM: 'Проблема',
  SKIPPED: 'Пропущено',
}

function fmtElapsed(ms: number) {
  const total = Math.floor(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export default function ItemCard({
  item,
  shiftDate,
  now,
  onChange,
}: {
  item: RunItem
  shiftDate: string
  now: number
  onChange: (c: Checklist) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [problemOpen, setProblemOpen] = useState(false)
  const [comment, setComment] = useState(item.comment ?? '')
  const [viewer, setViewer] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const pending = item.status === 'PENDING'
  const notStarted = pending && item.timed && !item.startedAt
  const running = pending && item.timed && !!item.startedAt

  // живой таймер, тикает только пока пункт в работе
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])

  const elapsedMs = running && item.startedAt ? Math.max(0, tick - Date.parse(item.startedAt)) : 0
  const opensAt = item.dueFrom
    ? new Date(`${shiftDate}T${fmtTime(item.dueFrom)}:00`).getTime() - EARLY_GRACE_MS
    : null
  const tooEarly = pending && opensAt !== null && now < opensAt
  const canReopen = !pending && item.reopenUntil !== null && now < Date.parse(item.reopenUntil)
  const overdue = isOverdue(item, now, shiftDate)
  const timing = timingLabel(item)
  const needsPhoto = item.photoMode === 'REQUIRED' && item.photos.length === 0
  const showPhotoBtn = pending && (item.photoMode !== 'NONE' || problemOpen)
  const doneTime = item.doneAt
    ? new Date(item.doneAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : null

  async function run(action: () => Promise<Checklist>): Promise<boolean> {
    setBusy(true)
    setError('')
    try {
      onChange(await action())
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
      return false
    } finally {
      setBusy(false)
    }
  }

  /** Встроенная камера, если доступна, иначе системная камера телефона. */
  function openCamera() {
    if (cameraSupported()) setCameraOpen(true)
    else fileRef.current?.click()
  }

  function start() {
    if (tooEarly) {
      setError(`Ещё рано: пункт доступен с ${fmtTime(item.dueFrom)}`)
      return
    }
    void run(() => api.startRunItem(item.id))
  }

  function finish() {
    if (tooEarly) {
      setError(`Ещё рано: пункт доступен с ${fmtTime(item.dueFrom)}`)
      return
    }
    if (needsPhoto) {
      setError('Сначала сделай фото 📸')
      openCamera()
      return
    }
    if (running && item.durationMin) {
      const minutes = Math.floor(elapsedMs / 60_000)
      if (
        minutes < item.durationMin * 0.3 &&
        !confirm(
          `Прошло ${minutes} мин при норме ${item.durationMin}. Такое быстрое закрытие будет видно директору. Закрыть?`,
        )
      ) {
        return
      }
    }
    void run(() => api.updateRunItem(item.id, 'DONE'))
  }

  function onMainClick() {
    if (!pending) {
      if (canReopen) void run(() => api.updateRunItem(item.id, 'PENDING'))
      return
    }
    if (notStarted) start()
    else finish()
  }

  async function submitProblem() {
    const ok = await run(() => api.updateRunItem(item.id, 'PROBLEM', comment.trim()))
    if (ok) setProblemOpen(false)
  }

  /** Снимок со встроенной камеры: время съёмки = сейчас. */
  function uploadShot(blob: Blob) {
    return run(() => api.uploadPhoto(item.id, blob, 'photo.jpg', Date.now()))
  }

  /** Запасной путь: системная камера через input. */
  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 5)
    e.target.value = ''
    if (files.length === 0) return
    await run(async () => {
      let result: Checklist | null = null
      for (const f of files) {
        const takenAt = await readTakenAt(f) // до сжатия, пока EXIF на месте
        const blob = await compressImage(f)
        result = await api.uploadPhoto(item.id, blob, blob === f ? f.name : 'photo.jpg', takenAt)
      }
      if (!result) throw new Error('Нет файлов')
      return result
    })
  }

  const mark = notStarted
    ? '▶'
    : item.status === 'DONE'
      ? '✓'
      : item.status === 'PROBLEM'
        ? '!'
        : item.status === 'SKIPPED'
          ? '–'
          : ''
  const cls = [
    'item-card',
    item.status.toLowerCase(),
    overdue ? 'overdue' : '',
    running ? 'running' : '',
    tooEarly ? 'locked' : '',
  ].join(' ')

  return (
    <div className={cls}>
      <div className="item-main">
        <button
          className={notStarted ? 'item-check start' : 'item-check'}
          onClick={onMainClick}
          disabled={busy || (!pending && !canReopen)}
          title={notStarted ? 'Начать' : pending ? 'Готово' : canReopen ? 'Вернуть' : 'Закрыто'}
        >
          {mark}
        </button>
        <div className="item-body">
          <div className="item-title">{item.title}</div>
          <div className="item-meta">
            {item.instructions && (
              <button type="button" className="meta-chip info-chip" onClick={() => setInfoOpen(true)}>
                ℹ️ как делать
              </button>
            )}
            {tooEarly && <span className="meta-chip">🔒 с {fmtTime(item.dueFrom)}</span>}
            {timing && !tooEarly && (
              <span className={overdue ? 'meta-chip danger' : 'meta-chip'}>
                🕗 {timing}
                {overdue ? ' · просрочено' : ''}
              </span>
            )}
            {running && (
              <span className="meta-chip live">
                ⏱ {fmtElapsed(elapsedMs)} / {item.durationMin} мин
              </span>
            )}
            {!running && item.durationMin != null && (
              <span className="meta-chip">
                ⏱ {item.timed ? 'норма ' : ''}
                {item.durationMin} мин
              </span>
            )}
            {item.photoMode === 'REQUIRED' && <span className="meta-chip">📸 нужно фото</span>}
            {item.photoMode === 'ON_PROBLEM' && <span className="meta-chip">📸 при проблеме</span>}
            {item.directorReview && <span className="meta-chip">👁 проверяет директор</span>}
            {!pending && (
              <span className={`meta-chip status-${item.status.toLowerCase()}`}>
                {STATUS_LABEL[item.status]}
                {doneTime ? ` · ${doneTime}` : ''}
              </span>
            )}
          </div>
          {item.comment && <div className="item-comment">💬 {item.comment}</div>}
        </div>
      </div>

      {item.photos.length > 0 && (
        <div className="photo-strip">
          {item.photos.map((ph) => (
            <div key={ph.id} className="thumb-wrap">
              <AuthImage src={ph.url} className="thumb" onClick={() => setViewer(ph.url)} />
              {pending && (
                <button
                  className="thumb-del"
                  title="Удалить фото"
                  disabled={busy}
                  onClick={() => run(() => api.deletePhoto(ph.id))}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {problemOpen && pending && (
        <div className="problem-box">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Что не так? Например: бочка масла пустая, тележка грязная"
            rows={3}
            maxLength={1000}
            autoFocus
          />
          {item.photoMode !== 'NONE' && item.photos.length === 0 && (
            <p className="muted small">Для проблемы нужно фото, нажми 📷</p>
          )}
          <div className="problem-actions">
            <button className="btn ghost small" onClick={() => setProblemOpen(false)}>
              Отмена
            </button>
            <button className="btn danger small" disabled={busy || !comment.trim()} onClick={submitProblem}>
              Отметить проблему
            </button>
          </div>
        </div>
      )}

      <div className="item-actions">
        {pending && notStarted && (
          <button className="btn primary small" onClick={start} disabled={busy || tooEarly}>
            ▶ Начать
          </button>
        )}
        {pending && running && (
          <button className="btn primary small" onClick={finish} disabled={busy}>
            ✓ Готово
          </button>
        )}
        {showPhotoBtn && (
          <button className="btn small" onClick={openCamera} disabled={busy}>
            📷 Снять
          </button>
        )}
        {pending && !problemOpen && (
          <button
            className="btn small warn"
            disabled={busy}
            onClick={() => {
              setProblemOpen(true)
              setError('')
            }}
          >
            ⚠️ Проблема
          </button>
        )}
        {pending && (
          <button
            className="btn ghost small"
            disabled={busy || tooEarly}
            onClick={() => run(() => api.updateRunItem(item.id, 'SKIPPED'))}
          >
            Пропустить
          </button>
        )}
        {!pending && canReopen && (
          <button
            className="btn ghost small"
            disabled={busy}
            onClick={() => run(() => api.updateRunItem(item.id, 'PENDING'))}
          >
            ↩ Вернуть
          </button>
        )}
        {!pending && !canReopen && <span className="muted small">🔒 закрыто</span>}
        {busy && <span className="muted small">Сохраняем…</span>}
      </div>

      {error && <div className="error item-error">{error}</div>}

      {/* запасной вариант: системная камера телефона */}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onFiles} />

      {cameraOpen && (
        <CameraModal
          title={item.title}
          onClose={() => setCameraOpen(false)}
          onShot={uploadShot}
          onFallback={() => {
            setCameraOpen(false)
            fileRef.current?.click()
          }}
        />
      )}

      {infoOpen && (
        <Modal title={item.title} onClose={() => setInfoOpen(false)}>
          <div className="instructions">{item.instructions}</div>
        </Modal>
      )}

      {viewer && (
        <Modal title="Фото" onClose={() => setViewer(null)}>
          <AuthImage src={viewer} className="viewer-img" />
        </Modal>
      )}
    </div>
  )
}