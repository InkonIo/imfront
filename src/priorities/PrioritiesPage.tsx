import { useCallback, useEffect, useState } from 'react'
import { errorText } from '../admin/ui'
import { useAuth } from '../auth'
import { ins } from '../insights/api'
import type { Row } from '../insights/api'
import { priorityApi } from './api'
import type { PriorityIn, PriorityRow } from './api'
import '../inventory/inventory.css'

const CATS = ['Продажи', 'Сервис', 'Команда', 'Другое']

interface Draft {
  title: string
  category: string
  outletId: string // '' = все точки
  active: boolean
  sortOrder: string
}

const toIn = (d: Draft): PriorityIn => ({
  title: d.title.trim(),
  category: d.category || null,
  outletId: d.outletId ? Number(d.outletId) : null,
  active: d.active,
  sortOrder: Number(d.sortOrder) || 0,
})

/** Справочник приоритетов дня: добавить, изменить, отключить, удалить. */
export default function PrioritiesPage() {
  const { user } = useAuth()
  const isAdmin = user?.accountRole === 'SUPER_ADMIN'
  const [rows, setRows] = useState<PriorityRow[] | null>(null)
  const [outlets, setOutlets] = useState<Row[]>([])
  const [error, setError] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const empty = (): Draft => ({ title: '', category: 'Продажи', outletId: isAdmin ? '' : String(outlets[0]?.id ?? ''), active: true, sortOrder: '0' })
  const [draft, setDraft] = useState<Draft>(empty)

  const load = useCallback(() => {
    priorityApi
      .list()
      .then((r) => {
        setRows(r)
        setError('')
      })
      .catch((e) => {
        setRows([])
        setError(errorText(e))
      })
  }, [])

  useEffect(() => {
    load()
    ins.outlets().then((o) => {
      setOutlets(o)
      setDraft((d) => (d.outletId || isAdmin ? d : { ...d, outletId: String(o[0]?.id ?? '') }))
    }).catch(() => {})
  }, [load, isAdmin])

  async function run(fn: () => Promise<unknown>) {
    setError('')
    try {
      await fn()
      load()
    } catch (e) {
      setError(errorText(e))
    }
  }

  const canEdit = (r: PriorityRow) => isAdmin || !r.global

  function startEdit(r: PriorityRow) {
    setEditId(r.id)
    setDraft({
      title: r.title,
      category: r.category ?? '',
      outletId: r.outletId ? String(r.outletId) : '',
      active: r.active,
      sortOrder: String(r.sortOrder),
    })
  }

  const form = (onSave: () => void, onCancel?: () => void, label = 'Сохранить') => (
    <div className="toolbar">
      <input
        className="ins-input"
        style={{ minWidth: 280 }}
        placeholder="Название приоритета, например «Повысить средний чек»"
        maxLength={200}
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
      />
      <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
        {CATS.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <select value={draft.outletId} onChange={(e) => setDraft({ ...draft, outletId: e.target.value })}>
        {isAdmin && <option value="">Все точки</option>}
        {outlets.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
      <label className="inv-date">
        порядок <input type="number" style={{ width: 70 }} value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })} />
      </label>
      <label className="ext-check">
        <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> активен
      </label>
      <button className="btn small" disabled={!draft.title.trim()} onClick={onSave}>{label}</button>
      {onCancel && <button className="btn ghost small" onClick={onCancel}>Отмена</button>}
    </div>
  )

  return (
    <div className="page">
      <p className="muted small">
        Эти приоритеты менеджеры выбирают в бланке «Чек-лист смены»: перетаскивают в слоты «Приоритет 1, 2, 3».
        {isAdmin ? ' Для «Все точки» шаблон виден во всех ресторанах.' : ' Ты управляешь шаблонами своих точек; общие шаблоны правит супер-админ.'}
      </p>

      {editId === null && form(() => void run(async () => { await priorityApi.create(toIn(draft)); setDraft(empty()) }), undefined, 'Добавить')}
      {error && <div className="error">{error}</div>}

      <div className="panel table-panel">
        {rows === null ? (
          <div className="table-state muted">Загрузка…</div>
        ) : rows.length === 0 ? (
          <div className="table-state muted">Шаблонов пока нет</div>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Приоритет</th>
                  <th>Категория</th>
                  <th>Точка</th>
                  <th>Порядок</th>
                  <th>Активен</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) =>
                  editId === r.id ? (
                    <tr key={r.id}>
                      <td colSpan={6}>
                        {form(() => void run(async () => { await priorityApi.update(r.id, toIn(draft)); setEditId(null); setDraft(empty()) }), () => { setEditId(null); setDraft(empty()) })}
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.id} style={r.active ? undefined : { opacity: 0.5 }}>
                      <td className="strong">{r.title}</td>
                      <td>{r.category ?? '—'}</td>
                      <td>{r.global ? 'Все точки' : r.outletName}</td>
                      <td>{r.sortOrder}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={r.active}
                          disabled={!canEdit(r)}
                          onChange={() => void run(() => priorityApi.update(r.id, { title: r.title, category: r.category, outletId: r.outletId, active: !r.active, sortOrder: r.sortOrder }))}
                        />
                      </td>
                      <td>
                        {canEdit(r) ? (
                          <>
                            <button className="btn ghost small" onClick={() => startEdit(r)}>Изменить</button>{' '}
                            <button className="btn ghost small" onClick={() => { if (confirm(`Удалить «${r.title}»?`)) void run(() => priorityApi.remove(r.id)) }}>Удалить</button>
                          </>
                        ) : (
                          <span className="muted small">общий</span>
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}