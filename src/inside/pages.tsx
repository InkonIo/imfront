import { useState } from 'react'
import type { Checklist, Shift } from '../types'
import { DAY_PART_LABEL, SHIFT_ROLE_LABEL } from '../types'
import ItemCard from './ItemCard'
import { DAILY_SECTION, groupBySection, isOverdue, pct, useNow } from './utils'

type PageProps = {
  shift: Shift
  checklist: Checklist | null
  onChange: (c: Checklist) => void
}

function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="placeholder">
      <div className="tile-icon">{icon}</div>
      <h2>{title}</h2>
      <p className="muted">{text}</p>
    </div>
  )
}

function NoChecklist() {
  return (
    <Empty
      icon="🗂️"
      title="Чек-лист не настроен"
      text="Для этой роли и части дня пока нет шаблона. Попроси суперадмина добавить его."
    />
  )
}

type Filter = 'all' | 'left' | 'problems'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'left', label: 'Осталось' },
  { id: 'problems', label: 'Проблемы' },
]

// ---------------- Маршрут ----------------

export function RoutePage({ shift, checklist, onChange }: PageProps) {
  const now = useNow()
  const [filter, setFilter] = useState<Filter>('all')
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set())

  if (!checklist) return <NoChecklist />

  const all = groupBySection(checklist.items)
  const visible = checklist.items.filter(
    (i) =>
      filter === 'all' ||
      (filter === 'left' && i.status === 'PENDING') ||
      (filter === 'problems' && i.status === 'PROBLEM'),
  )
  const sections = groupBySection(visible)
  const overdue = checklist.items.filter((i) => isOverdue(i, now, shift.shiftDate)).length
  const done = checklist.items.filter((i) => i.status === 'DONE').length
  const p = pct(checklist.completed, checklist.total)

  function toggle(order: number) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(order)) next.delete(order)
      else next.add(order)
      return next
    })
  }

  return (
    <div className="page">
      <div className="panel">
        <div className="panel-row">
          <h2>{checklist.title}</h2>
          <span className="chip">
            {checklist.completed} / {checklist.total} · {p}%
          </span>
        </div>
        <div className="progress">
          <span style={{ width: `${p}%` }} />
        </div>
        <div className="route-stats">
          <span>✅ {done} сделано</span>
          <span>⚠️ {checklist.problems} проблем</span>
          <span className={overdue ? 'text-danger' : ''}>⏰ {overdue} просрочено</span>
        </div>
      </div>

      <div className="filter-tabs">
        {FILTERS.map((f) => (
          <button key={f.id} className={f.id === filter ? 'tab active' : 'tab'} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {sections.length === 0 && (
        <Empty
          icon={filter === 'problems' ? '👌' : '🎉'}
          title={filter === 'problems' ? 'Проблем нет' : 'Всё сделано!'}
          text={filter === 'problems' ? 'Отмеченные проблемы появятся здесь.' : 'Можно завершать смену.'}
        />
      )}

      {sections.map((sec) => {
        const full = all.find((a) => a.order === sec.order)
        const total = full?.items.length ?? sec.items.length
        const closed = full?.items.filter((i) => i.status !== 'PENDING').length ?? 0
        const isCollapsed = collapsed.has(sec.order)
        return (
          <section key={sec.order} className="section-block">
            <button className="section-head" onClick={() => toggle(sec.order)}>
              <span className="section-title">{sec.title}</span>
              <span className={closed === total ? 'section-count full' : 'section-count'}>
                {closed}/{total}
              </span>
              <span className="section-arrow">{isCollapsed ? '▸' : '▾'}</span>
            </button>
            {!isCollapsed && (
              <div className="section-items">
                {sec.items.map((i) => (
                  <ItemCard key={i.id} item={i} shiftDate={shift.shiftDate} now={now} onChange={onChange} />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

// ---------------- Регламент дня ----------------

export function DailyPage({ shift, checklist, onChange }: PageProps) {
  const now = useNow()
  const weekday = new Date(`${shift.shiftDate}T00:00:00`).toLocaleDateString('ru-RU', { weekday: 'long' })

  if (!checklist) return <NoChecklist />
  const items = checklist.items.filter((i) => i.sectionTitle === DAILY_SECTION)

  return (
    <div className="page">
      <div className="panel">
        <div className="panel-row">
          <h2>Сегодня</h2>
          <span className="chip">{weekday}</span>
        </div>
        <p className="muted">
          Регламентные работы на {DAY_PART_LABEL[shift.dayPart].toLowerCase()}. Список меняется по дням недели.
        </p>
      </div>
      {items.length === 0 ? (
        <Empty icon="😌" title="Сегодня регламентов нет" text="На этот день недели в ТЗ работ не указано." />
      ) : (
        <div className="section-items">
          {items.map((i) => (
            <ItemCard key={i.id} item={i} shiftDate={shift.shiftDate} now={now} onChange={onChange} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------- Проблемные зоны ----------------

export function ProblemsPage({ shift, checklist, onChange }: PageProps) {
  const now = useNow()
  if (!checklist) return <NoChecklist />
  const items = checklist.items.filter((i) => i.status === 'PROBLEM')

  return (
    <div className="page">
      <div className="panel">
        <p className="muted">
          Всё, что отмечено как проблема, с комментариями и фото. Позже эти пункты будут уходить директору.
        </p>
      </div>
      {items.length === 0 ? (
        <Empty icon="👌" title="Проблем нет" text="Если найдёшь проблему, отметь её в маршруте кнопкой ⚠️" />
      ) : (
        <div className="section-items">
          {items.map((i) => (
            <ItemCard key={i.id} item={i} shiftDate={shift.shiftDate} now={now} onChange={onChange} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------- Инвентаризация ----------------

export function InventoryPage({ shift, checklist, onChange }: PageProps) {
  const now = useNow()
  if (!checklist) return <NoChecklist />
  const items = checklist.items.filter((i) => i.title.toLowerCase().includes('инвентаризац'))

  return (
    <div className="page">
      <div className="panel">
        <p className="muted">Пункты инвентаризации из маршрута. Отдельная форма подсчёта появится позже.</p>
      </div>
      {items.length === 0 ? (
        <Empty icon="📦" title="Пунктов нет" text="В этом чек-листе нет инвентаризации." />
      ) : (
        <div className="section-items">
          {items.map((i) => (
            <ItemCard key={i.id} item={i} shiftDate={shift.shiftDate} now={now} onChange={onChange} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------- Итоги смены ----------------

export function SummaryPage({ shift, checklist }: PageProps) {
  const now = useNow()
  const minutes = Math.max(0, Math.floor((now - new Date(shift.startedAt).getTime()) / 60_000))
  const duration = `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`
  const started = new Date(shift.startedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const photos = checklist?.items.reduce((sum, i) => sum + i.photos.length, 0) ?? 0
  const overdue = checklist?.items.filter((i) => isOverdue(i, now, shift.shiftDate)).length ?? 0

  return (
    <div className="page">
      <div className="stats">
        <div className="stat">
          <span className="muted small">Выполнено</span>
          <span className="stat-value">
            {checklist ? `${pct(checklist.completed, checklist.total)}%` : '—'}
          </span>
        </div>
        <div className="stat">
          <span className="muted small">Проблем</span>
          <span className="stat-value">{checklist?.problems ?? 0}</span>
        </div>
        <div className="stat">
          <span className="muted small">Просрочено</span>
          <span className="stat-value">{overdue}</span>
        </div>
        <div className="stat">
          <span className="muted small">Фото</span>
          <span className="stat-value">{photos}</span>
        </div>
        <div className="stat">
          <span className="muted small">Начало</span>
          <span className="stat-value">{started}</span>
        </div>
        <div className="stat">
          <span className="muted small">Идёт уже</span>
          <span className="stat-value">{duration}</span>
        </div>
      </div>

      {checklist && (
        <div className="panel">
          <h2>По разделам</h2>
          <div className="section-progress">
            {groupBySection(checklist.items).map((sec) => {
              const closed = sec.items.filter((i) => i.status !== 'PENDING').length
              const p = pct(closed, sec.items.length)
              return (
                <div key={sec.order} className="section-progress-row">
                  <div className="panel-row">
                    <span>{sec.title}</span>
                    <span className="muted small">
                      {closed}/{sec.items.length}
                    </span>
                  </div>
                  <div className="progress">
                    <span style={{ width: `${p}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="muted small">
        {SHIFT_ROLE_LABEL[shift.shiftRole]} · {shift.outletName} · {DAY_PART_LABEL[shift.dayPart]}. Баллы появятся
        после системы оценивания.
      </p>
    </div>
  )
}