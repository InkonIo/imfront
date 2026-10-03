import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
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