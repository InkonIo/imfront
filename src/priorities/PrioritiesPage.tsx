import { useCallback, useEffect, useMemo, useState } from 'react'
import { errorText } from '../admin/ui'
import { useAuth } from '../auth'
import { ins } from '../insights/api'
import type { Row } from '../insights/api'
import { priorityApi } from './api'
import type { PriorityIn, PriorityRow } from './api'
import './priorities.css'

const CATS = ['Продажи', 'Сервис', 'Команда', 'Другое']
const CAT_CLASS: Record<string, string> = { Продажи: 'c-sales', Сервис: 'c-service', Команда: 'c-team', Другое: 'c-other' }
const catClass = (c: string | null) => CAT_CLASS[c ?? ''] ?? 'c-other'

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
  const [filter, setFilter] = useState<string>('')
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
    ins
      .outlets()
      .then((o) => {
        setOutlets(o)
        setDraft((d) => (d.outletId || isAdmin ? d : { ...d, outletId: String(o[0]?.id ?? '') }))
      })
      .catch(() => {})
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

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of rows ?? []) m[r.category ?? 'Другое'] = (m[r.category ?? 'Другое'] ?? 0) + 1
    return m
  }, [rows])

  const shown = (rows ?? []).filter((r) => !filter || (r.category ?? 'Другое') === filter)

  const form = (onSave: () => void, onCancel?: () => void, label = 'Сохранить') => (
    <div className="pr-form">
      <label className="pr-field wide">
        <span>Название</span>
        <input
          placeholder="Например «Повысить средний чек»"
          maxLength={200}
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </label>

      <div className="pr-field wide">
        <span>Категория</span>
        <div className="pr-cats">
          {CATS.map((c) => (
            <button
              key={c}
              type="button"
              className={draft.category === c ? `pr-cat on ${catClass(c)}` : `pr-cat ${catClass(c)}`}
              onClick={() => setDraft({ ...draft, category: c })}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <label className="pr-field">
        <span>Точка</span>
        <select value={draft.outletId} onChange={(e) => setDraft({ ...draft, outletId: e.target.value })}>
          {isAdmin && <option value="">Все точки</option>}
          {outlets.map((o) => (
            <option key={String(o.id)} value={String(o.id)}>
              {String(o.name)}
            </option>
          ))}
        </select>
      </label>

      <label className="pr-field narrow">
        <span>Порядок</span>
        <input type="number" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })} />
      </label>

      <div className="pr-field narrow">
        <span>Активен</span>
        <button
          type="button"
          role="switch"
          aria-checked={draft.active}
          className={draft.active ? 'pr-switch on' : 'pr-switch'}
          onClick={() => setDraft({ ...draft, active: !draft.active })}
        >
          <i />
        </button>
      </div>

      <div className="pr-actions">
        <button type="button" className="pr-btn primary" disabled={!draft.title.trim()} onClick={onSave}>
          {label}
        </button>
        {onCancel && (
          <button type="button" className="pr-btn" onClick={onCancel}>
            Отмена
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="pr">
      <div className="pr-hint">
        <span className="pr-hint-ico">🎯</span>
        <p>
          Эти приоритеты менеджеры выбирают в бланке «Чек-лист смены»: перетаскивают в слоты «Приоритет 1, 2, 3».
          {isAdmin ? ' Для «Все точки» шаблон виден во всех ресторанах.' : ' Ты управляешь шаблонами своих точек; общие шаблоны правит супер-админ.'}
        </p>
      </div>

      {editId === null && (
        <section className="pr-card">
          <h3>Новый приоритет</h3>
          {form(() => void run(async () => { await priorityApi.create(toIn(draft)); setDraft(empty()) }), undefined, '＋ Добавить')}
        </section>
      )}

      {error && <div className="pr-error">{error}</div>}

      <div className="pr-filter">
        <button type="button" className={filter === '' ? 'on' : ''} onClick={() => setFilter('')}>
          Все <em>{rows?.length ?? 0}</em>
        </button>
        {CATS.map((c) => (
          <button key={c} type="button" className={filter === c ? 'on' : ''} onClick={() => setFilter(c)}>
            {c} <em>{counts[c] ?? 0}</em>
          </button>
        ))}
      </div>

      {rows === null ? (
        <div className="pr-empty">Загрузка…</div>
      ) : shown.length === 0 ? (
        <div className="pr-empty">Шаблонов пока нет</div>
      ) : (
        <div className="pr-list">
          {shown.map((r) =>
            editId === r.id ? (
              <section key={r.id} className="pr-card editing">
                <h3>Редактирование</h3>
                {form(
                  () => void run(async () => { await priorityApi.update(r.id, toIn(draft)); setEditId(null); setDraft(empty()) }),
                  () => { setEditId(null); setDraft(empty()) },
                )}
              </section>
            ) : (
              <article key={r.id} className={r.active ? 'pr-row' : 'pr-row off'}>
                <span className="pr-order" title="Порядок">{r.sortOrder}</span>
                <div className="pr-main">
                  <b>{r.title}</b>
                  <div className="pr-chips">
                    <span className={`pr-chip ${catClass(r.category)}`}>{r.category ?? 'Без категории'}</span>
                    <span className="pr-chip plain">📍 {r.global ? 'Все точки' : r.outletName}</span>
                    {!canEdit(r) && <span className="pr-chip plain">общий</span>}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={r.active}
                  aria-label="Активен"
                  title={r.active ? 'Активен' : 'Отключён'}
                  disabled={!canEdit(r)}
                  className={r.active ? 'pr-switch on' : 'pr-switch'}
                  onClick={() => void run(() => priorityApi.update(r.id, { title: r.title, category: r.category, outletId: r.outletId, active: !r.active, sortOrder: r.sortOrder }))}
                >
                  <i />
                </button>
                {canEdit(r) && (
                  <div className="pr-tools">
                    <button type="button" className="pr-icon" onClick={() => startEdit(r)} title="Изменить" aria-label="Изменить">✎</button>
                    <button
                      type="button"
                      className="pr-icon danger"
                      title="Удалить"
                      aria-label="Удалить"
                      onClick={() => { if (confirm(`Удалить «${r.title}»?`)) void run(() => priorityApi.remove(r.id)) }}
                    >
                      🗑
                    </button>
                  </div>
                )}
              </article>
            ),
          )}
        </div>
      )}
    </div>
  )
}