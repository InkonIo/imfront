import { useEffect, useState } from 'react'
import { Modal, errorText } from '../admin/ui'
import { useAuth } from '../auth'
import { DAY_PART_LABEL, SHIFT_ROLE_LABEL } from '../types'
import ItemForm from './ItemForm'
import { templateApi } from './api'
import type { ItemBody, TemplateFull, TemplateItem } from './types'
import { WEEKDAYS } from './types'

/** Новый порядок id после перемещения элемента на одну позицию. */
function swapIds<T extends { id: number }>(list: T[], index: number, dir: -1 | 1): number[] | null {
  const j = index + dir
  if (j < 0 || j >= list.length) return null
  const ids = list.map((x) => x.id)
  ;[ids[index], ids[j]] = [ids[j], ids[index]]
  return ids
}

export default function TemplateEditor({
  id,
  onBack,
  onOpen,
}: {
  id: number
  onBack: () => void
  onOpen: (id: number) => void
}) {
  const { user } = useAuth()
  const [tpl, setTpl] = useState<TemplateFull | null>(null)
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<{ sectionId: number; item: TemplateItem | null } | null>(null)
  const [info, setInfo] = useState<TemplateItem | null>(null)

  useEffect(() => {
    let cancelled = false
    templateApi
      .get(id)
      .then((t) => {
        if (cancelled) return
        setTpl(t)
        setTitle(t.summary.title)
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err))
      })
    return () => {
      cancelled = true
    }
  }, [id])

  async function mutate(action: () => Promise<TemplateFull>) {
    setBusy(true)
    setError('')
    try {
      const t = await action()
      setTpl(t)
      setTitle(t.summary.title)
      return true
    } catch (err) {
      setError(errorText(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function saveItem(body: ItemBody): Promise<string | null> {
    if (!editing) return null
    const { item, sectionId } = editing
    try {
      const t = await (item ? templateApi.updateItem(item.id, body) : templateApi.addItem(sectionId, body))
      setTpl(t)
      setEditing(null)
      return null
    } catch (err) {
      return errorText(err)
    }
  }

  if (!tpl) {
    return (
      <div className="page">
        <button className="btn ghost small" onClick={onBack}>
          ← Все маршруты
        </button>
        {error ? <div className="error">{error}</div> : <div className="muted">Загрузка…</div>}
      </div>
    )
  }

  const s = tpl.summary
  const ro = !s.editable
  const myOutlets = user?.outlets ?? []

  async function copyForMyOutlet() {
    const outlet = myOutlets[0]
    if (!outlet) return setError('За тобой не закреплена точка')
    setBusy(true)
    setError('')
    try {
      const created = await templateApi.create({
        shiftRole: s.shiftRole,
        dayPart: s.dayPart,
        outletId: outlet.id,
        title: `${s.title} · ${outlet.name}`,
        copyFromId: s.id,
      })
      onOpen(created.summary.id)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function removeTemplate() {
    if (!confirm(`Удалить маршрут «${s.title}»? Если по нему уже были смены, удалить не получится, только выключить.`)) return
    setBusy(true)
    try {
      await templateApi.remove(s.id)
      onBack()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="report-top">
        <button className="btn ghost small" onClick={onBack}>
          ← Все маршруты
        </button>
        <span className="chip">
          {s.dayPart === 'MORNING' ? '🌅' : '🌙'} {DAY_PART_LABEL[s.dayPart]} · {SHIFT_ROLE_LABEL[s.shiftRole]} ·{' '}
          {s.outletId ? `📍 ${s.outletName}` : '🌐 Общий'}
        </span>
      </div>

      {ro ? (
        <div className="tpl-banner">
          <span>
            👀 Это общий маршрут, его правит суперадмин. Чтобы изменить маршрут для своей точки, создай копию.
          </span>
          {myOutlets.length > 0 && (
            <button className="btn primary small" disabled={busy} onClick={copyForMyOutlet}>
              📋 Скопировать для {myOutlets[0].name}
            </button>
          )}
        </div>
      ) : (
        <div className="panel">
          <div className="tpl-head">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
            {title.trim() && title.trim() !== s.title && (
              <button
                className="btn primary small"
                disabled={busy}
                onClick={() => mutate(() => templateApi.update(s.id, { title: title.trim(), active: s.active }))}
              >
                Сохранить название
              </button>
            )}
            <button
              className={s.active ? 'btn small' : 'btn primary small'}
              disabled={busy}
              onClick={() => mutate(() => templateApi.update(s.id, { title: s.title, active: !s.active }))}
            >
              {s.active ? '⏸ Выключить' : '▶ Включить'}
            </button>
            <button className="icon-btn danger" title="Удалить маршрут" disabled={busy} onClick={removeTemplate}>
              🗑️
            </button>
          </div>
          <p className="muted small">
            Изменения применяются к новым сменам. Уже начатые смены остаются как были.
            {!s.active && ' Маршрут выключен: новые смены его не получат.'}
          </p>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {tpl.sections.map((sec, si) => (
        <div key={sec.id} className="panel tpl-section">
          <div className="tpl-section-head">
            {!ro && (
              <div className="order-btns">
                <button
                  className="icon-btn"
                  title="Выше"
                  disabled={busy || si === 0}
                  onClick={() => {
                    const ids = swapIds(tpl.sections, si, -1)
                    if (ids) void mutate(() => templateApi.orderSections(s.id, ids))
                  }}
                >
                  ↑
                </button>
                <button
                  className="icon-btn"
                  title="Ниже"
                  disabled={busy || si === tpl.sections.length - 1}
                  onClick={() => {
                    const ids = swapIds(tpl.sections, si, 1)
                    if (ids) void mutate(() => templateApi.orderSections(s.id, ids))
                  }}
                >
                  ↓
                </button>
              </div>
            )}
            <h2 className="tpl-section-title">{sec.title}</h2>
            <span className="section-count">{sec.items.length}</span>
            {!ro && (
              <div className="row-actions">
                <button
                  className="icon-btn"
                  title="Переименовать"
                  disabled={busy}
                  onClick={() => {
                    const t = prompt('Название раздела', sec.title)
                    if (t && t.trim()) void mutate(() => templateApi.renameSection(sec.id, t.trim()))
                  }}
                >
                  ✏️
                </button>
                <button
                  className="icon-btn danger"
                  title="Удалить раздел"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Удалить раздел «${sec.title}» вместе с пунктами (${sec.items.length})?`)) {
                      void mutate(() => templateApi.deleteSection(sec.id))
                    }
                  }}
                >
                  🗑️
                </button>
              </div>
            )}
          </div>

          {sec.items.length === 0 && <div className="muted small">Пунктов пока нет</div>}

          {sec.items.map((it, ii) => (
            <div key={it.id} className={it.active ? 'tpl-item' : 'tpl-item off'}>
              {!ro && (
                <div className="order-btns">
                  <button
                    className="icon-btn"
                    title="Выше"
                    disabled={busy || ii === 0}
                    onClick={() => {
                      const ids = swapIds(sec.items, ii, -1)
                      if (ids) void mutate(() => templateApi.orderItems(sec.id, ids))
                    }}
                  >
                    ↑
                  </button>
                  <button
                    className="icon-btn"
                    title="Ниже"
                    disabled={busy || ii === sec.items.length - 1}
                    onClick={() => {
                      const ids = swapIds(sec.items, ii, 1)
                      if (ids) void mutate(() => templateApi.orderItems(sec.id, ids))
                    }}
                  >
                    ↓
                  </button>
                </div>
              )}
              <div className="tpl-item-body">
                <div className="strong">{it.title}</div>
                <div className="item-meta">
                  <ItemChips it={it} onInfo={() => setInfo(it)} />
                </div>
              </div>
              {!ro && (
                <div className="row-actions">
                  <button
                    className="icon-btn"
                    title="Редактировать"
                    disabled={busy}
                    onClick={() => setEditing({ sectionId: sec.id, item: it })}
                  >
                    ✏️
                  </button>
                  <button
                    className="icon-btn danger"
                    title="Удалить"
                    disabled={busy}
                    onClick={() => {
                      if (confirm(`Удалить пункт «${it.title}»?`)) void mutate(() => templateApi.deleteItem(it.id))
                    }}
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          ))}

          {!ro && (
            <button
              className="btn small tpl-add"
              disabled={busy}
              onClick={() => setEditing({ sectionId: sec.id, item: null })}
            >
              ＋ Пункт
            </button>
          )}
        </div>
      ))}

      {!ro && (
        <button
          className="btn"
          disabled={busy}
          onClick={() => {
            const t = prompt('Название нового раздела', 'Новый раздел')
            if (t && t.trim()) void mutate(() => templateApi.addSection(s.id, t.trim()))
          }}
        >
          ＋ Раздел
        </button>
      )}

      {editing && (
        <ItemForm
          sections={tpl.sections}
          sectionId={editing.sectionId}
          item={editing.item}
          onClose={() => setEditing(null)}
          onSave={saveItem}
        />
      )}

      {info && (
        <Modal title={info.title} onClose={() => setInfo(null)}>
          <div className="instructions">{info.instructions}</div>
        </Modal>
      )}
    </div>
  )
}

function ItemChips({ it, onInfo }: { it: TemplateItem; onInfo: () => void }) {
  const t = (x: string | null) => (x ? x.slice(0, 5) : null)
  const timing =
    it.dueFrom && it.dueTo
      ? `${t(it.dueFrom)}–${t(it.dueTo)}`
      : it.dueTo
        ? `до ${t(it.dueTo)}`
        : it.dueFrom
          ? `с ${t(it.dueFrom)}`
          : null
  return (
    <>
      {it.weekday && <span className="meta-chip">📅 только {WEEKDAYS[it.weekday - 1]}</span>}
      {timing && <span className="meta-chip">🕗 {timing}</span>}
      {it.durationMin != null && (
        <span className="meta-chip">
          ⏱ {it.durationMin} мин{it.durationMin >= 10 ? ' · таймер' : ''}
        </span>
      )}
      {it.photoMode === 'REQUIRED' && <span className="meta-chip">📸 нужно фото</span>}
      {it.photoMode === 'ON_PROBLEM' && <span className="meta-chip">📸 при проблеме</span>}
      {it.directorReview && <span className="meta-chip">👁 проверяет директор</span>}
      {it.instructions && (
        <button type="button" className="meta-chip info-chip" onClick={onInfo}>
          ℹ️ инструкция
        </button>
      )}
      {!it.active && <span className="pill off">выключен</span>}
    </>
  )
}