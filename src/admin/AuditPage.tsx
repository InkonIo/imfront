import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { AUDIT_META } from '../types'
import type { AuditEvent, AuditEventType, AuditQuery } from '../types'
import { errorText, useList } from './ui'

const PAGE_SIZE = 50
const ZONE = 'Asia/Almaty'

const GROUPS: { label: string; types: AuditEventType[] }[] = [
  { label: 'Вход', types: ['LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGED'] },
  { label: 'Смены', types: ['SHIFT_STARTED', 'SHIFT_FINISHED'] },
  { label: 'Чек-лист', types: ['ITEM_STARTED', 'ITEM_DONE', 'ITEM_PROBLEM', 'ITEM_SKIPPED', 'ITEM_REOPENED'] },
  { label: 'Фото', types: ['PHOTO_UPLOADED', 'PHOTO_DELETED'] },
  {
    label: 'Админка',
    types: ['USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'USER_PASSWORD_RESET', 'CATALOG_CHANGED'],
  },
]

function todayAlmaty() {
  return new Date().toLocaleDateString('en-CA', { timeZone: ZONE }) // YYYY-MM-DD
}

function deviceLabel(ua: string | null) {
  if (!ua) return 'неизвестно'
  const os = /iPhone|iPad/.test(ua)
    ? 'iPhone'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'Mac'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Устройство'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /YaBrowser/.test(ua)
      ? 'Яндекс'
      : /CriOS|Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : ''
  return browser ? `${os} · ${browser}` : os
}

/** Один и тот же deviceId всегда получает один и тот же цвет. */
function deviceColor(id: string | null) {
  if (!id) return 'var(--line)'
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360
  return `hsl(${h} 70% 50%)`
}

export default function AuditPage({ initialShiftId = null }: { initialShiftId?: number | null }) {
  const users = useList(api.adminUsers)
  const [date, setDate] = useState(todayAlmaty)
  const [userId, setUserId] = useState<number | ''>('')
  const [type, setType] = useState<AuditEventType | ''>('')
  const [shiftId, setShiftId] = useState<number | null>(initialShiftId)
  const [reloadKey, setReloadKey] = useState(0)

  const [items, setItems] = useState<AuditEvent[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')

  const buildQuery = useCallback(
    (p: number): AuditQuery => ({
      // при просмотре конкретной смены дату не ограничиваем: смена может перейти через полночь
      from: shiftId !== null ? undefined : date,
      to: shiftId !== null ? undefined : date,
      userId: userId === '' ? undefined : userId,
      type: type === '' ? undefined : type,
      shiftId: shiftId ?? undefined,
      page: p,
      size: PAGE_SIZE,
    }),
    [date, userId, type, shiftId],
  )

  useEffect(() => {
    let cancelled = false
    api
      .auditEvents(buildQuery(0))
      .then((res) => {
        if (cancelled) return
        setItems(res.items)
        setTotal(res.total)
        setPage(0)
        setError('')
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err))
      })
    return () => {
      cancelled = true
    }
  }, [buildQuery, reloadKey])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const res = await api.auditEvents(buildQuery(page + 1))
      setItems((prev) => [...(prev ?? []), ...res.items])
      setTotal(res.total)
      setPage(page + 1)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  const nameOf = (id: number | null) => (id === null ? undefined : users.items?.find((u) => u.id === id)?.fullName)

  return (
    <div className="page">
      <div className="toolbar">
        <input
          type="date"
          value={date}
          max={todayAlmaty()}
          disabled={shiftId !== null}
          onChange={(e) => setDate(e.target.value || todayAlmaty())}
        />
        <select
          className="select"
          value={userId}
          onChange={(e) => setUserId(e.target.value === '' ? '' : Number(e.target.value))}
        >
          <option value="">Все сотрудники</option>
          {(users.items ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName} (@{u.login})
            </option>
          ))}
        </select>
        <select className="select" value={type} onChange={(e) => setType(e.target.value as AuditEventType | '')}>
          <option value="">Все события</option>
          {GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.types.map((t) => (
                <option key={t} value={t}>
                  {AUDIT_META[t].icon} {AUDIT_META[t].label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button className="btn" title="Обновить" onClick={() => setReloadKey((k) => k + 1)}>
          ↻
        </button>
      </div>

      {shiftId !== null && (
        <div className="filter-chip-row">
          <span className="chip">История смены #{shiftId}</span>
          <button className="btn ghost small" onClick={() => setShiftId(null)}>
            ✕ сбросить
          </button>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="panel table-panel">
        {items === null ? (
          <div className="table-state muted">Загрузка…</div>
        ) : items.length === 0 ? (
          <div className="table-state muted">Событий нет</div>
        ) : (
          <ul className="audit-list">
            {items.map((e) => (
              <AuditRow key={e.id} e={e} name={nameOf(e.userId)} showDate={shiftId !== null} onShift={setShiftId} />
            ))}
          </ul>
        )}
      </div>

      {items && items.length < total && (
        <button className="btn" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Загружаем…' : `Показать ещё (${total - items.length})`}
        </button>
      )}

      <p className="muted small">🔒 Записи журнала нельзя изменить или удалить, даже напрямую в базе.</p>
    </div>
  )
}

function AuditRow({
  e,
  name,
  showDate,
  onShift,
}: {
  e: AuditEvent
  name: string | undefined
  showDate: boolean
  onShift: (id: number) => void
}) {
  const meta = AUDIT_META[e.type] ?? { icon: '•', label: e.type }
  const at = new Date(e.createdAt)
  const time = at.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: ZONE,
  })
  const day = at.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone: ZONE })

  return (
    <li className={`audit-row tone-${meta.tone ?? 'none'}`}>
      <span className="audit-icon">{meta.icon}</span>
      <div className="audit-main">
        <div className="audit-head">
          <strong>{name ?? e.userLogin ?? 'неизвестно'}</strong>
          {name && e.userLogin && <span className="muted small">@{e.userLogin}</span>}
          <span className="audit-label">{meta.label}</span>
        </div>
        {e.details && <div className="audit-details">{e.details}</div>}
        <div className="audit-meta">
          <span>
            🕒 {showDate ? `${day} ` : ''}
            {time}
          </span>
          <span className="device" title={e.userAgent ?? ''}>
            <i className="device-dot" style={{ background: deviceColor(e.deviceId) }} />
            {deviceLabel(e.userAgent)}
            {e.deviceId ? ` · #${e.deviceId.slice(-4)}` : ''}
          </span>
          {e.ip && <span>🌐 {e.ip}</span>}
          {e.shiftId !== null && (
            <button className="link-btn" onClick={() => onShift(e.shiftId as number)}>
              смена #{e.shiftId} →
            </button>
          )}
        </div>
      </div>
    </li>
  )
}