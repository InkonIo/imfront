import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../admin/ui'
import type { PhotoMode } from '../types'
import type { ItemBody, TemplateItem, TemplateSection } from './types'
import { WEEKDAYS } from './types'

type TimeMode = 'none' | 'to' | 'from' | 'window'

const TIME_MODES: { v: TimeMode; label: string }[] = [
  { v: 'none', label: 'Без времени' },
  { v: 'to', label: 'До …' },
  { v: 'from', label: 'С …' },
  { v: 'window', label: 'С … до …' },
]

const PHOTO_MODES: { v: PhotoMode; label: string }[] = [
  { v: 'NONE', label: 'Не нужно' },
  { v: 'REQUIRED', label: '📸 Обязательно' },
  { v: 'ON_PROBLEM', label: 'При проблеме' },
]

export default function ItemForm({
  sections,
  sectionId,
  item,
  onClose,
  onSave,
}: {
  sections: TemplateSection[]
  sectionId: number
  item: TemplateItem | null
  onClose: () => void
  onSave: (body: ItemBody) => Promise<string | null>
}) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [instructions, setInstructions] = useState(item?.instructions ?? '')
  const [section, setSection] = useState<number>(item?.sectionId ?? sectionId)
  const [duration, setDuration] = useState(item?.durationMin != null ? String(item.durationMin) : '')
  const [mode, setMode] = useState<TimeMode>(
    item?.dueFrom && item?.dueTo ? 'window' : item?.dueTo ? 'to' : item?.dueFrom ? 'from' : 'none',
  )
  const [from, setFrom] = useState(item?.dueFrom?.slice(0, 5) ?? '')
  const [to, setTo] = useState(item?.dueTo?.slice(0, 5) ?? '')
  const [photo, setPhoto] = useState<PhotoMode>(item?.photoMode ?? 'NONE')
  const [weekday, setWeekday] = useState<number | ''>(item?.weekday ?? '')
  const [review, setReview] = useState(item?.directorReview ?? false)
  const [active, setActive] = useState(item?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const dur = duration.trim() === '' ? null : Number(duration)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (dur !== null && (!Number.isInteger(dur) || dur < 1 || dur > 600)) {
      return setError('Норма: целое число минут от 1 до 600')
    }
    const needFrom = mode === 'from' || mode === 'window'
    const needTo = mode === 'to' || mode === 'window'
    if (needFrom && !from) return setError('Укажи время «с»')
    if (needTo && !to) return setError('Укажи время «до»')
    if (needFrom && needTo && from >= to) return setError('«С» должно быть раньше «до»')

    setBusy(true)
    setError('')
    const err = await onSave({
      sectionId: section,
      title: title.trim(),
      instructions: instructions.trim() || null,
      durationMin: dur,
      dueFrom: needFrom ? from : null,
      dueTo: needTo ? to : null,
      photoMode: photo,
      weekday: weekday === '' ? null : weekday,
      directorReview: review,
      active,
    })
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <Modal title={item ? 'Карточка пункта' : 'Новый пункт'} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label>
          Что сделать (коротко)
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={500}
            placeholder="Например: Принять ночников"
            autoFocus
          />
        </label>

        <label>
          ℹ️ Как делать (подробная инструкция)
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder={'1. Проверить бочки с маслом\n2. Осмотреть серые тележки и ножки\n3. Сфоткать хим. шкаф'}
          />
          <span className="field-hint">Сотрудник увидит это по кнопке «ℹ️ как делать» на карточке</span>
        </label>

        <label>
          Раздел
          <select className="select" value={section} onChange={(e) => setSection(Number(e.target.value))}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>

        <div className="form-grid">
          <label>
            Норма, мин
            <input
              type="number"
              min={1}
              max={600}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="не задана"
            />
            <span className="field-hint">
              {dur !== null && dur >= 10 ? '⏱ будет таймер «Начать → Готово»' : 'от 10 мин включается таймер'}
            </span>
          </label>
          <label>
            День недели
            <select
              className="select"
              value={weekday}
              onChange={(e) => setWeekday(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">Каждый день</option>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i + 1}>
                  Только {d}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="field">
          <span className="field-label">🕗 Время</span>
          <div className="seg">
            {TIME_MODES.map((m) => (
              <button
                key={m.v}
                type="button"
                className={mode === m.v ? 'seg-btn active' : 'seg-btn'}
                onClick={() => setMode(m.v)}
              >
                {m.label}
              </button>
            ))}
          </div>
          {mode !== 'none' && (
            <div className="time-row">
              {(mode === 'from' || mode === 'window') && (
                <label className="time-field">
                  с
                  <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
                </label>
              )}
              {(mode === 'to' || mode === 'window') && (
                <label className="time-field">
                  до
                  <input type="time" value={to} onChange={(e) => setTo(e.target.value)} />
                </label>
              )}
            </div>
          )}
          <span className="field-hint">
            «До» — после этого времени пункт считается просроченным. «С» — раньше закрыть нельзя.
          </span>
        </div>

        <div className="field">
          <span className="field-label">📸 Фото</span>
          <div className="seg">
            {PHOTO_MODES.map((m) => (
              <button
                key={m.v}
                type="button"
                className={photo === m.v ? 'seg-btn active' : 'seg-btn'}
                onClick={() => setPhoto(m.v)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <label className="check">
          <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} />
          👁 Проверяет директор (появится в «Ждут проверки»)
        </label>
        <label className="check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Пункт активен
        </label>

        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={busy || !title.trim()}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </Modal>
  )
}