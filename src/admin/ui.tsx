import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
export function errorText(err: unknown) {
  return err instanceof Error ? err.message : 'Ошибка'
}

/** Loads a list; loader must be a stable function (e.g. api.adminCities). */
export function useList<T>(loader: () => Promise<T[]>) {
  const [items, setItems] = useState<T[] | null>(null)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    try {
      const data = await loader()
      setItems(data)
      setError('')
    } catch (err) {
      setError(errorText(err))
    }
  }, [loader])

  useEffect(() => {
    void reload()
  }, [reload])

  return { items, error, reload }
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  // Esc закрывает
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // пока открыта, страница под ней не скроллится (учитываем вложенные модалки)
  useEffect(() => {
    const body = document.body
    const count = Number(body.dataset.modals ?? '0') + 1
    body.dataset.modals = String(count)
    body.classList.add('modal-open')
    return () => {
      const left = Number(body.dataset.modals ?? '1') - 1
      body.dataset.modals = String(left)
      if (left <= 0) body.classList.remove('modal-open')
    }
  }, [])

  // портал: модалка всегда в <body>, поверх всего, где бы её ни вызвали
  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function Toolbar({
  query,
  onQuery,
  placeholder,
  addLabel,
  onAdd,
  children,
}: {
  query: string
  onQuery: (v: string) => void
  placeholder: string
  addLabel: string
  onAdd: () => void
  children?: ReactNode
}) {
  return (
    <div className="toolbar">
      <input
        className="search"
        placeholder={placeholder}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />
      {children}
      <button type="button" className="btn primary" onClick={onAdd}>
        ＋ {addLabel}
      </button>
    </div>
  )
}

export function StatusPill({ active, on = 'Активна', off = 'Выключена' }: {
  active: boolean
  on?: string
  off?: string
}) {
  return <span className={active ? 'pill ok' : 'pill off'}>{active ? on : off}</span>
}

export function TableState({ loading, empty }: { loading: boolean; empty: boolean }) {
  if (loading) return <div className="table-state muted">Загрузка…</div>
  if (empty) return <div className="table-state muted">Ничего не найдено</div>
  return null
}