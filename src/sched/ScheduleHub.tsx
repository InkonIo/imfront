import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { extApi } from '../ext/api'
import type { ExtBranch } from '../ext/api'
import SchedulePage from '../schedule/SchedulePage'
import OverviewTab from './OverviewTab'
import ScheduleImport from './ScheduleImport'
// Скрыто (закомментировано, чтобы не потерять): аналитика загрузки и вкладка «Сотрудники» из Таймтрекера
// import AnalyticsTab from './AnalyticsTab'
// import WeekView from './WeekView'
// import { AccessTab, RequestsTab } from './StaffAdmin'
// import { KlnPanel, LimitsPanel, PeoplePanel, SlotsPanel, TrainingPanel } from './PlanSetup'
// import { useCaps } from './useCaps'
import './sched.css'
import './plan.css'
import ManagerSchedulePage from '../manager-schedule/ManagerSchedulePage'

// type Top = 'overview' | 'analytics' | 'managers' | 'staff'
// type Sub = 'requests' | 'week' | 'people' | 'settings'
type Top = 'overview' | 'managers' | 'mgrsched'

const BRANCH_KEY = 'sched.branch'
const readBranch = () => { try { const v = localStorage.getItem(BRANCH_KEY); return v ? Number(v) : null } catch { return null } }
const saveBranch = (id: number | null) => { try { if (id) localStorage.setItem(BRANCH_KEY, String(id)); else localStorage.removeItem(BRANCH_KEY) } catch { /* без хранилища тоже работает */ } }

function NeedBranch() {
  return <div className="ext-wrap"><div className="ext-empty">Выберите ресторан справа вверху: этот раздел работает по одному ресторану.</div></div>
}

/**
 * Страница «Расписание» для супер-админа и директора.
 *  - «Общий график»: менеджеры по данным Таймтрекера (кто пришёл, кто не вышел);
 *  - «Менеджеры»: составление и публикация графика менеджеров.
 * Вкладки «Аналитика» и «Сотрудники» скрыты (код ниже закомментирован); сервер остался как был.
 * Доступ всё равно проверяет сервер.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function ScheduleHub(_props: { onChanged?: () => void }) {
  const { user } = useAuth()
  // const { caps, refresh } = useCaps(true, user?.id)
  const role = String(user?.accountRole ?? '')
  const isAdmin = role === 'SUPER_ADMIN'
  const canManagers = isAdmin || role === 'DIRECTOR'
  // const canStaff = caps?.canManageSchedule === true

  const [top, setTop] = useState<Top | null>(null)
  // const [sub, setSub] = useState<Sub>('requests')
  const [branches, setBranches] = useState<ExtBranch[]>([])
  const [branch, setBranch] = useState<number | null>(readBranch())
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [syncKey, setSyncKey] = useState(0)
  const [importing, setImporting] = useState(false)

  /** Подтянуть график из Таймтрекера (этот и следующий месяц) и перерисовать составление графика. */
  async function syncTt() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const now = new Date()
      const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      await extApi.syncSchedule(ym(now))
      await extApi.syncSchedule(ym(new Date(now.getFullYear(), now.getMonth() + 1, 1)))
      setSyncKey((k) => k + 1)
      setSyncMsg('График обновлён ✓')
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Не удалось обновить')
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    extApi.list('', null, false).then((r) => {
      setBranches(r.branches)
      setBranch((cur) => (cur && r.branches.some((b) => b.id === cur) ? cur : r.branches[0]?.id ?? null))
    }).catch(() => {})
  }, [])

  if (!canManagers) return <div className="ext"><div className="ext-empty">Нет доступа к расписанию.</div></div>

  const tabs: { id: Top; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Общий график' },
    { id: 'managers', label: 'Менеджеры (ТТ)' },
    { id: 'mgrsched', label: 'График менеджеров' },
  ]
  const current: Top = top && tabs.some((t) => t.id === top) ? top : tabs[0].id
  

  // const subs: [Sub, string][] = [['requests', 'Заявки'], ['week', 'График недели'], ['people', 'Люди и обучение'], ['settings', 'Настройки']]
  // const needsBranch = current === 'overview' || current === 'analytics' || (current === 'staff' && sub !== 'requests')

  return (
    <div className="ext sched">
      <div className="hub-top">
        <div className="hub-tabs">
          {tabs.map((t) => (
            <button key={t.id} className={current === t.id ? 'hub-tab on' : 'hub-tab'} onClick={() => setTop(t.id)}>
              {t.label}{t.badge ? <span className="nav-count">{t.badge}</span> : null}
            </button>
          ))}
        </div>
        {current !== 'managers' && (
          <select className="ext-input hub-branch" value={branch ?? ''} aria-label="Ресторан"
            onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; setBranch(v); saveBranch(v) }}>
            {/* {current === 'staff' && sub === 'requests' && <option value="">Все рестораны</option>} */}
            {branches.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
        )}
      </div>

      {current === 'overview' && (branch == null ? <NeedBranch /> : <OverviewTab key={syncKey} branchId={branch} canEdit />)}

      {/* {current === 'analytics' && (branch == null ? <NeedBranch /> : <AnalyticsTab branchId={branch} />)} */}

      {current === 'managers' && (
        <>
          <div className="sch-bar" style={{ alignItems: 'center' }}>
            <button className="ext-btn" disabled={syncing} onClick={() => void syncTt()}>{syncing ? 'Обновляю…' : '🔄 Обновить из Таймтрекера'}</button>
            <button className="ext-btn primary" disabled={branch == null} title={branch == null ? 'Сначала выберите ресторан справа вверху' : ''} onClick={() => setImporting(true)}>📥 Загрузить из Excel</button>
            {syncMsg && <span className="muted-s">{syncMsg}</span>}
          </div>
          {importing && branch != null && (
            <ScheduleImport branchId={branch} onClose={() => setImporting(false)} onDone={() => setSyncKey((k) => k + 1)} />
          )}
          <SchedulePage key={syncKey} />
        </>
      )}
      {current === 'mgrsched' && <ManagerSchedulePage />}

      {/* Вкладка «Сотрудники» (заявки, график недели, люди и обучение, настройки) скрыта:
      {current === 'staff' && (
        <>
          <div className="sch-seg hub-sub">
            {subs.map(([k, t]) => <button key={k} className={sub === k ? 'on' : ''} onClick={() => setSub(k)}>{t}</button>)}
          </div>
          {sub === 'requests' && <RequestsTab branchId={branch} onChanged={() => { void refresh(); onChanged?.() }} />}
          {needsBranch && branch == null && sub !== 'requests' && <NeedBranch />}
          {sub === 'week' && branch != null && <WeekView branchId={branch} onGoSettings={() => setSub('settings')} />}
          {sub === 'people' && branch != null && (
            <>
              <h3 className="hub-h" style={{ marginTop: 0 }}>Обучение: инструктор и стажёр</h3>
              <TrainingPanel branchId={branch} />
              <h3 className="hub-h">Позиции сотрудников</h3>
              <PeoplePanel branchId={branch} />
            </>
          )}
          {sub === 'settings' && (
            <>
              {branch != null && <details className="hub-sec" open><summary>Нормы по ресторану: сколько кого нужно</summary><div><SlotsPanel branchId={branch} /></div></details>}
              <details className="hub-sec"><summary>Ограничения при сборке графика</summary><div><LimitsPanel /></div></details>
              <details className="hub-sec"><summary>Связь с kln</summary><div><KlnPanel /></div></details>
              <details className="hub-sec"><summary>Доступ сотрудников на сайт{isAdmin ? ' и ответственная' : ''}</summary><div><AccessTab branchId={branch} isAdmin={isAdmin} /></div></details>
            </>
          )}
        </>
      )}
      */}
    </div>
  )
}