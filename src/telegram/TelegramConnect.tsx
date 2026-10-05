import { useCallback, useEffect, useState } from 'react'
import { errorText } from '../admin/ui'
import { useAuth } from '../auth'
import { telegramApi } from './api'
import type { TgStatus } from './api'
import './telegram.css'

export default function TelegramConnect() {
  const { user } = useAuth()
  const [status, setStatus] = useState<TgStatus | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState('')
  const reviewer = user?.accountRole === 'DIRECTOR' || user?.accountRole === 'SUPER_ADMIN'

  const load = useCallback(async () => {
    try {
      setStatus(await telegramApi.status())
    } catch (err) {
      setError(errorText(err))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // пока человек жмёт Start в Telegram, проверяем привязку каждые 3 секунды
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(async () => {
      try {
        const s = await telegramApi.status()
        setStatus(s)
        if (s.linked) setWaiting(false)
      } catch {
        // проверим в следующий раз
      }
    }, 3000)
    const stop = setTimeout(() => setWaiting(false), 15 * 60_000)
    return () => {
      clearInterval(timer)
      clearTimeout(stop)
    }
  }, [waiting])

  async function connect() {
    setError('')
    // окно открываем сразу по клику, иначе браузер заблокирует всплывающее окно
    const win = window.open('about:blank', '_blank')
    try {
      const { url } = await telegramApi.link()
      if (win) win.location.href = url
      else window.location.href = url
      setWaiting(true)
    } catch (err) {
      win?.close()
      setError(errorText(err))
    }
  }

  async function disconnect() {
    if (!confirm('Отключить Telegram? Уведомления перестанут приходить туда.')) return
    try {
      await telegramApi.unlink()
      await load()
    } catch (err) {
      setError(errorText(err))
    }
  }

  if (!status) return null
  if (!status.botReady) {
    return <div className="tg-box muted small">📲 Telegram-бот пока не запущен на сервере</div>
  }

  return (
    <div className={status.linked ? 'tg-box linked' : 'tg-box'}>
      {status.linked ? (
        <>
          <span>
            ✅ Telegram подключён{status.username ? ` · @${status.username}` : ''}
          </span>
          <button className="btn ghost small" onClick={disconnect}>
            Отключить
          </button>
        </>
      ) : waiting ? (
        <>
          <span>
            ⏳ Открой Telegram и нажми <b>Start</b> у @{status.botUsername}
          </span>
          <button className="btn ghost small" onClick={() => setWaiting(false)}>
            Отмена
          </button>
        </>
      ) : (
        <>
          <span>📲 Получай {reviewer ? 'фото на проверку, нарушения' : 'замечания'} и итоги недели в Telegram</span>
          <button className="btn primary small" onClick={connect}>
            Подключить
          </button>
        </>
      )}
      {error && <div className="error tg-error">{error}</div>}
    </div>
  )
}