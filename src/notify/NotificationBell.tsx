import { useEffect, useState } from 'react'
import { Modal, errorText } from '../admin/ui'
import { notifyApi } from './api'
import type { AppNotification } from './types'
import TelegramConnect from '../telegram/TelegramConnect'
import '../admin/admin.css'
import './notify.css'

const ZONE = 'Asia/Almaty'

function when(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ZONE,
  })
}

export default function NotificationBell() {
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[] | null>(null)
  const [error, setError] = useState('')

  // счётчик обновляется раз в минуту
  useEffect(() => {
    let cancelled = false
    const load = () =>
      notifyApi
        .unread()
        .then((r) => {
          if (!cancelled) setUnread(r.unread)
        })
        .catch(() => {})
    void load()
    const timer = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  async function openList() {
    setOpen(true)
    setError('')
    setItems(null)
    try {
      const r = await notifyApi.list()
      setItems(r.items) // непрочитанные подсветятся, потому что readAt ещё null
      if (r.unread > 0) {
        await notifyApi.readAll()
        setUnread(0)
      }
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <>
      <button className="bell" onClick={openList} aria-label="Обратная связь" title="Обратная связь">
        🔔
        {unread > 0 && <span className="bell-badge">{unread}</span>}
      </button>

      {open && (
        <Modal title="Обратная связь" onClose={() => setOpen(false)}>
        <TelegramConnect />
          {error && <div className="error">{error}</div>}
          {items === null && !error && <div className="muted">Загрузка…</div>}
          {items !== null && items.length === 0 && <div className="muted">Пока замечаний нет 👌</div>}
          {items !== null && items.length > 0 && (
            <ul className="notify-list">
              {items.map((n) => (
                <li key={n.id} className={`notify-item ${n.type.toLowerCase()} ${n.readAt ? '' : 'unread'}`}>
                  <div className="notify-title">{n.title}</div>
                  {n.body && <div className="notify-body">{n.body}</div>}
                  <div className="muted small">{when(n.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </>
  )
}