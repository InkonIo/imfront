import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { extApi } from '../ext/api'
import type { ExtBranch } from '../ext/api'
import SchedulePage from '../schedule/SchedulePage'
import OverviewTab from './OverviewTab'
import WeekView from './WeekView'
import { AccessTab, RequestsTab } from './StaffAdmin'
import { KlnPanel, LimitsPanel, PeoplePanel, SlotsPanel, TrainingPanel } from './PlanSetup'
import { useCaps } from './useCaps'
import './sched.css'
import './plan.css'

type Top = 'overview' | 'managers' | 'staff'
type Sub = 'requests' | 'week' | 'people' | 'settings'

const BRANCH_KEY = 'sched.branch'
const readBranch = () => { try { const v = localStorage.getItem(BRANCH_KEY); return v ? Number(v) : null } catch { return null } }
const saveBranch = (id: number | null) => { try { if (id) localStorage.setItem(BRANCH_KEY, String(id)); else localStorage.removeItem(BRANCH_KEY) } catch { /* без хранилища тоже работает */ } }

function NeedBranch() {
  return <div className="ext-wrap"><div className="ext-empty">Выберите ресторан справа вверху: этот раздел работает по одному ресторану.</div></div>
}

/**
 * Единая страница «Расписание».
 *  - «Общий график»: все (менеджеры и сотрудники) — видят директор, супер-админ и ответственная за расписание;
 *  - «Менеджеры»: график менеджеров — директор и супер-админ;
 *  - «Сотрудники»: заявки, график недели, люди и обучение, настройки — ответственная за расписание и супер-админ.
 * Что показывать, решают роль и /api/me/caps; доступ всё равно проверяет сервер.
 */
export default function ScheduleHub({ onChanged }: { onChanged?: () => void }) {
  const { user } = useAuth()
  const { caps, refresh } = useCaps(true, user?.id)
  const role = String(user?.accountRole ?? '')
  const isAdmin = role === 'SUPER_ADMIN'
  const canManagers = isAdmin || role === 'DIRECTOR'
  const canStaff = caps?.canManageSchedule === true

  const [top, setTop] = useState<Top | null>(null)
  const [sub, setSub] = useState<Sub>('requests')
  const [branches, setBranches] = useState<ExtBranch[]>([])
  const [branch, setBranch] = useState<number | null>(readBranch())

  useEffect(() => {
    extApi.list('', null, false).then((r) => {
      setBranches(r.branches)
      setBranch((cur) => (cur && r.branches.some((b) => b.id === cur) ? cur : r.branches[0]?.id ?? null))
    }).catch(() => {})
  }, [])

  if (!caps && !canManagers) return <div className="ext"><div className="ext-empty">Загрузка…</div></div>

  const tabs: { id: Top; label: string; badge?: number }[] = []
  if (canManagers || canStaff) tabs.push({ id: 'overview', label: 'Общий график' })
  if (canManagers) tabs.push({ id: 'managers', label: 'Менеджеры' })
  if (canStaff) tabs.push({ id: 'staff', label: 'Сотрудники', badge: caps?.pending })
  const current: Top = top && tabs.some((t) => t.id === top) ? top : tabs[0]?.id ?? 'overview'
  if (tabs.length === 0) return <div className="ext"><div className="ext-empty">Нет доступа к расписанию.</div></div>

  const subs: [Sub, string][] = [['requests', 'Заявки'], ['week', 'График недели'], ['people', 'Люди и обучение'], ['settings', 'Настройки']]
  const needsBranch = current === 'overview' || (current === 'staff' && sub !== 'requests')

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
            {current === 'staff' && sub === 'requests' && <option value="">Все рестораны</option>}
            {branches.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
        )}
      </div>

      {current === 'overview' && (branch == null ? <NeedBranch /> : <OverviewTab branchId={branch} />)}

      {current === 'managers' && <SchedulePage />}

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
    </div>
  )
}