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

/** Тело запроса из пункта с изменением одного поля. */
function toBody(it: TemplateItem, patch: Partial<ItemBody>): ItemBody {
  return {
    sectionId: it.sectionId,
    title: it.title,
    instructions: it.instructions,
    durationMin: it.durationMin,
    dueFrom: it.dueFrom,
    dueTo: it.dueTo,
    photoMode: it.photoMode,
    weekday: it.weekday,
    directorReview: it.directorReview,
    telegramNotify: it.TelegramNotify,
    active: it.active,
    ...patch,
  }
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
  const [forceOpen, setForceOpen] = useState(false)
  const isAdmin = user?.accountRole === 'SUPER_ADMIN'

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
    if (isAdmin) return setForceOpen(true) // суперадмин: окно «удалить вместе со сменами»
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
          {/* ---------- заголовок раздела ---------- */}
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

          {/* ---------- пункты раздела ---------- */}
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
                    className={it.TelegramNotify || it.directorReview ? 'icon-btn tg-on' : 'icon-btn tg-off'}
                    title={
                      it.directorReview
                        ? 'Отправляется в Telegram: пункт проверяет директор'
                        : it.TelegramNotify
                          ? 'Отправляется в Telegram. Нажми, чтобы выключить'
                          : 'Не отправляется в Telegram. Нажми, чтобы включить'
                    }
                    disabled={busy || it.directorReview}
                    onClick={() =>
                      mutate(() => templateApi.updateItem(it.id, toBody(it, { telegramNotify: !it.TelegramNotify })))
                    }
                  >
                    📲
                  </button>
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

      {forceOpen && (
        <ForceDeleteModal
          id={s.id}
          title={s.title}
          onClose={() => setForceOpen(false)}
          onDone={onBack}
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
      {(it.TelegramNotify || it.directorReview) && <span className="meta-chip">📲 в Telegram</span>}
      {it.instructions && (
        <button type="button" className="meta-chip info-chip" onClick={onInfo}>
          ℹ️ инструкция
        </button>
      )}
      {!it.active && <span className="pill off">выключен</span>}
    </>
  )
}
/** Суперадмин: удалить маршрут вместе со всеми сменами по нему. Показываем, что сотрётся, и просим ввести название. */
function ForceDeleteModal({
  id,
  title,
  onClose,
  onDone,
}: {
  id: number
  title: string
  onClose: () => void
  onDone: () => void
}) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    templateApi
      .forcePreview(id)
      .then((r) => {
        if (!cancelled) setCounts(r)
      })
      .catch((e) => {
        if (!cancelled) setErr(errorText(e))
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const rows = counts ? Object.entries(counts) : []
  // всё, что не сам маршрут, разделы и пункты: смены, отметки, фото…
  const others = rows.filter(([t]) => !t.includes('checklist_')).reduce((a, [, n]) => a + n, 0)
  const needName = others > 0
  const ok = counts !== null && (!needName || typed.trim() === title.trim())

  async function go() {
    setBusy(true)
    setErr('')
    try {
      await templateApi.forceRemove(id)
      onDone()
    } catch (e) {
      setErr(errorText(e))
      setBusy(false)
    }
  }

  return (
    <Modal title="Удалить маршрут вместе со сменами" onClose={onClose}>
      <div className="modal-form">
        <p>
          Маршрут <b>«{title}»</b> будет удалён навсегда. Вернуть его нельзя.
        </p>
        {counts === null && !err && <div className="muted">Считаю, что будет удалено…</div>}
        {counts !== null && (
          <div className="error" style={{ background: 'rgba(220,53,69,.08)' }}>
            {needName ? (
              <>
                Вместе с ним сотрутся смены по этому маршруту и всё, что к ним привязано (<b>{others}</b> записей):
              </>
            ) : (
              <>Смен по этому маршруту нет. Сотрутся только сам маршрут, разделы и пункты:</>
            )}
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {rows.map(([t, n]) => (
                <li key={t}>
                  {t}: {n}
                </li>
              ))}
            </ul>
          </div>
        )}
        {needName && (
          <label>
            Чтобы подтвердить, введите название маршрута
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={title} />
          </label>
        )}
        {err && <div className="error">{err}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn danger" disabled={!ok || busy} onClick={go}>
            {busy ? 'Удаляю…' : '🗑️ Удалить навсегда'}
          </button>
        </div>
      </div>
    </Modal>
  )
}