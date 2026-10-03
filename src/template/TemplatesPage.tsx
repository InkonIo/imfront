import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../api'
import { Modal, StatusPill, errorText } from '../admin/ui'
import { useAuth } from '../auth'
import { DAY_PART_LABEL, SHIFT_ROLE_LABEL } from '../types'
import type { DayPart, Outlet, ShiftRole } from '../types'
import TemplateEditor from './TemplateEditor'
import { templateApi } from './api'
import type { TemplateSummary } from './types'
import './template.css'

const ROLES: ShiftRole[] = ['INSIDE', 'PRODUCTION_MANAGER', 'SERVICE_MANAGER']

export default function TemplatesPage() {
  const [list, setList] = useState<TemplateSummary[] | null>(null)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    templateApi
      .list()
      .then((r) => {
        if (cancelled) return
        setList(r)
        setError('')
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err))
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  if (openId !== null) {
    return (
      <TemplateEditor
        key={openId}
        id={openId}
        onOpen={setOpenId}
        onBack={() => {
          setOpenId(null)
          setReloadKey((k) => k + 1)
        }}
      />
    )
  }

  return (
    <div className="page">
      <div className="toolbar">
        <p className="muted small toolbar-text">
          🌐 Общий маршрут работает на всех точках. 📍 Маршрут точки заменяет общий на этой точке.
        </p>
        <button className="btn primary" onClick={() => setCreating(true)}>
          ＋ Маршрут
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {list === null && !error && <div className="muted">Загрузка…</div>}

      {list !== null &&
        ROLES.map((role) => {
          const rows = list.filter((t) => t.shiftRole === role)
          return (
            <section key={role} className="section-block">
              <div className="section-head static">
                <span className="section-title">{SHIFT_ROLE_LABEL[role]}</span>
                <span className="section-count">{rows.length}</span>
              </div>
              {rows.length === 0 ? (
                <div className="muted small">Маршрутов пока нет. Нажми «＋ Маршрут»</div>
              ) : (
                <div className="template-grid">
                  {rows.map((t) => (
                    <button
                      key={t.id}
                      className={t.active ? 'template-card' : 'template-card off'}
                      onClick={() => setOpenId(t.id)}
                    >
                      <div className="template-card-top">
                        <span className="shift-part">
                          {t.dayPart === 'MORNING' ? '🌅' : '🌙'} {DAY_PART_LABEL[t.dayPart]}
                        </span>
                        <span className={t.outletId ? 'scope-chip outlet' : 'scope-chip'}>
                          {t.outletId ? `📍 ${t.outletName}` : '🌐 Общий'}
                        </span>
                      </div>
                      <div className="shift-name">{t.title}</div>
                      <div className="muted small">
                        {t.sections} разделов · {t.items} пунктов
                      </div>
                      <div className="chips">
                        <StatusPill active={t.active} on="Активен" off="Выключен" />
                        {!t.editable && <span className="pill off">только просмотр</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )
        })}

      {creating && (
        <CreateForm
          templates={list ?? []}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            setOpenId(id)
          }}
        />
      )}
    </div>
  )
}

function CreateForm({
  templates,
  onClose,
  onCreated,
}: {
  templates: TemplateSummary[]
  onClose: () => void
  onCreated: (id: number) => void
}) {
  const { user } = useAuth()
  const isAdmin = user?.accountRole === 'SUPER_ADMIN'
  const [outlets, setOutlets] = useState<Outlet[]>(isAdmin ? [] : (user?.outlets ?? []))
  const [role, setRole] = useState<ShiftRole>('INSIDE')
  const [dayPart, setDayPart] = useState<DayPart>('MORNING')
  const [outletId, setOutletId] = useState<number | ''>(isAdmin ? '' : (user?.outlets[0]?.id ?? ''))
  const [copyFrom, setCopyFrom] = useState<number | ''>('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    api
      .adminOutlets()
      .then((o) => {
        if (!cancelled) setOutlets(o)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isAdmin])

  const defaultTitle = `${SHIFT_ROLE_LABEL[role]} — ${DAY_PART_LABEL[dayPart].toLowerCase()}`

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!isAdmin && outletId === '') return setError('Выбери точку')
    setBusy(true)
    setError('')
    try {
      const res = await templateApi.create({
        shiftRole: role,
        dayPart,
        outletId: outletId === '' ? null : outletId,
        title: title.trim() || defaultTitle,
        copyFromId: copyFrom === '' ? null : copyFrom,
      })
      onCreated(res.summary.id)
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <Modal title="Новый маршрут" onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="form-grid">
          <label>
            Роль
            <select className="select" value={role} onChange={(e) => setRole(e.target.value as ShiftRole)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {SHIFT_ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Часть дня
            <select className="select" value={dayPart} onChange={(e) => setDayPart(e.target.value as DayPart)}>
              <option value="MORNING">🌅 Утро</option>
              <option value="EVENING">🌙 Вечер</option>
            </select>
          </label>
        </div>

        <label>
          Где действует
          <select
            className="select"
            value={outletId}
            onChange={(e) => setOutletId(e.target.value === '' ? '' : Number(e.target.value))}
          >
            {isAdmin && <option value="">🌐 Общий (все точки)</option>}
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>
                📍 {o.name} ({o.cityName})
              </option>
            ))}
          </select>
        </label>

        <label>
          Взять пункты из
          <select
            className="select"
            value={copyFrom}
            onChange={(e) => setCopyFrom(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">— пустой маршрут —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} ({t.outletId ? t.outletName : 'общий'})
              </option>
            ))}
          </select>
        </label>

        <label>
          Название
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} placeholder={defaultTitle} />
        </label>

        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Создаём…' : 'Создать'}
          </button>
        </div>
      </form>
    </Modal>
  )
}