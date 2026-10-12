import { useCallback, useEffect, useState } from 'react'
import { errorText } from '../admin/ui'
import { useAuth } from '../auth'
import { ins } from '../insights/api'
import type { Row } from '../insights/api'
import { noteApi } from './api'
import type { Note, NoteLog, NoteStatus } from './api'
import './board.css'

const STATUS_LABEL: Record<NoteStatus, string> = {
  OPEN: 'Не закрыто',
  IN_PROGRESS: 'В процессе',
  DONE: 'Закрыто',
}
const STATUS_ORDER: NoteStatus[] = ['OPEN', 'IN_PROGRESS', 'DONE']

const fmt = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
}

/**
 * «Табличка дня»: красная кнопка «!» справа поверх всего. Заметки точки со статусом
 * (не закрыто / в процессе / закрыто) и ответственным. outletId — для менеджера (его точка);
 * без него — директор и супер-админ выбирают точку сами.
 */
export default function NoteBoard({ outletId }: { outletId?: number }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState<Note[]>([])
  const [outlets, setOutlets] = useState<Row[]>([])
  const [filterOutlet, setFilterOutlet] = useState<number | ''>('')
  const [showDone, setShowDone] = useState(false)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [newOutlet, setNewOutlet] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ id: number; status: NoteStatus } | null>(null)
  const [comment, setComment] = useState('')
  const [logs, setLogs] = useState<Record<number, NoteLog[] | null>>({})

  const scope = outletId ?? (filterOutlet === '' ? null : filterOutlet)

  const load = useCallback(async () => {
    try {
      setNotes(await noteApi.list(scope, showDone))
      setError('')
    } catch (err) {
      setError(errorText(err))
    }
  }, [scope, showDone])

  // обновляем раз в минуту, чтобы счётчик был живым
  useEffect(() => {
    void load()
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 60_000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    if (outletId) return
    ins
      .outlets()
      .then((list) => {
        setOutlets(list)
        if (list.length === 1) setNewOutlet(Number(list[0].id))
      })
      .catch(() => {})
  }, [outletId])

  const active = notes.filter((n) => n.status !== 'DONE').length
  const targetOutlet = outletId ?? (newOutlet === '' ? null : newOutlet)

  async function add() {
    if (!targetOutlet) return setError('Выбери точку')
    if (!title.trim()) return setError('Напиши, что случилось')
    setBusy(true)
    try {
      await noteApi.create({ outletId: targetOutlet, title: title.trim(), body: body.trim() || null })
      setTitle('')
      setBody('')
      setAdding(false)
      await load()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function applyStatus() {
    if (!pending) return
    setBusy(true)
    try {
      await noteApi.setStatus(pending.id, pending.status, comment.trim() || null)
      setPending(null)
      setComment('')
      setLogs((l) => ({ ...l, [pending.id]: null }))
      await load()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove(n: Note) {
    if (!confirm(`Удалить заметку «${n.title}»?`)) return
    try {
      await noteApi.remove(n.id)
      await load()
    } catch (err) {
      setError(errorText(err))
    }
  }

  async function toggleLog(id: number) {
    if (logs[id]) return setLogs((l) => ({ ...l, [id]: null }))
    try {
      const rows = await noteApi.log(id)
      setLogs((l) => ({ ...l, [id]: rows }))
    } catch (err) {
      setError(errorText(err))
    }
  }

  const canDelete = (n: Note) => user?.accountRole === 'SUPER_ADMIN' || user?.accountRole === 'DIRECTOR' || n.createdBy === user?.id

  return (
    <>
      <button type="button" className={active > 0 ? 'nb-fab alert' : 'nb-fab'} onClick={() => setOpen(true)} aria-label="Заметки точки">
        <span>!</span>
        {active > 0 && <i>{active}</i>}
      </button>

      {open && <div className="nb-shade" onClick={() => setOpen(false)} />}

      <aside className={open ? 'nb-panel open' : 'nb-panel'} aria-hidden={!open}>
        <header className="nb-head">
          <div>
            <h2>Табличка дня</h2>
            <p>Что сломалось, что починили, кто отвечает</p>
          </div>
          <button type="button" className="nb-x" onClick={() => setOpen(false)} aria-label="Закрыть">
            ✕
          </button>
        </header>

        <div className="nb-tools">
          {!outletId && outlets.length > 1 && (
            <select value={filterOutlet} onChange={(e) => setFilterOutlet(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Все точки</option>
              {outlets.map((o) => (
                <option key={String(o.id)} value={String(o.id)}>
                  {String(o.name)}
                </option>
              ))}
            </select>
          )}
          <label className="nb-check">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            весь архив
          </label>
        </div>

        {error && <div className="nb-error">{error}</div>}

        {adding ? (
          <div className="nb-form">
            {!outletId && outlets.length > 1 && (
              <select value={newOutlet} onChange={(e) => setNewOutlet(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Точка…</option>
                {outlets.map((o) => (
                  <option key={String(o.id)} value={String(o.id)}>
                    {String(o.name)}
                  </option>
                ))}
              </select>
            )}
            <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Что случилось? Например «Сломалась лампа над грилем»" autoFocus />
            <textarea value={body} rows={3} onChange={(e) => setBody(e.target.value)} placeholder="Подробности (необязательно)" />
            <div className="nb-row">
              <button type="button" className="nb-btn primary" disabled={busy} onClick={() => void add()}>
                Добавить
              </button>
              <button type="button" className="nb-btn" onClick={() => setAdding(false)}>
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="nb-add" onClick={() => setAdding(true)}>
            ＋ Новая заметка
          </button>
        )}

        <div className="nb-list">
          {notes.length === 0 && <p className="nb-empty">Пока всё спокойно — заметок нет ✅</p>}
          {notes.map((n) => (
            <article key={n.id} className={`nb-note s-${n.status.toLowerCase()}`}>
              <div className="nb-top">
                <span className={`nb-chip s-${n.status.toLowerCase()}`}>{STATUS_LABEL[n.status]}</span>
                {!outletId && <span className="nb-outlet">📍 {n.outletName}</span>}
                {canDelete(n) && (
                  <button type="button" className="nb-del" onClick={() => void remove(n)} aria-label="Удалить">
                    🗑
                  </button>
                )}
              </div>
              <h3>{n.title}</h3>
              {n.body && <p className="nb-body">{n.body}</p>}
              <div className="nb-meta">
                <span>
                  Добавил: <b>{n.createdByName ?? '—'}</b> · {fmt(n.createdAt)}
                </span>
                {n.responsibleName && (
                  <span>
                    {n.status === 'DONE' ? 'Закрыл' : 'Ответственный'}: <b>{n.responsibleName}</b> · {fmt(n.statusAt)}
                  </span>
                )}
              </div>

              <div className="nb-seg">
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={n.status === s ? `on s-${s.toLowerCase()}` : ''}
                    disabled={n.status === s}
                    onClick={() => {
                      setPending({ id: n.id, status: s })
                      setComment('')
                    }}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>

              {pending?.id === n.id && (
                <div className="nb-confirm">
                  <input
                    value={comment}
                    maxLength={500}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={pending.status === 'DONE' ? 'Что сделано? (необязательно)' : 'Комментарий (необязательно)'}
                    autoFocus
                  />
                  <div className="nb-row">
                    <button type="button" className="nb-btn primary" disabled={busy} onClick={() => void applyStatus()}>
                      Поставить «{STATUS_LABEL[pending.status]}»
                    </button>
                    <button type="button" className="nb-btn" onClick={() => setPending(null)}>
                      Отмена
                    </button>
                  </div>
                </div>
              )}

              <button type="button" className="nb-link" onClick={() => void toggleLog(n.id)}>
                {logs[n.id] ? 'Скрыть историю' : 'История'}
              </button>
              {logs[n.id] && (
                <ul className="nb-log">
                  {logs[n.id]!.length === 0 && <li>Статус ещё не менялся</li>}
                  {logs[n.id]!.map((l, i) => (
                    <li key={i}>
                      <b>{STATUS_LABEL[l.status]}</b> — {l.userName ?? '—'}, {fmt(l.at)}
                      {l.comment ? ` · ${l.comment}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </aside>
    </>
  )
}