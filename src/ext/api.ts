import { request, send } from '../api'

export interface ExtEmployee {
  id: number
  fullName: string
  phone: string | null
  isFired: boolean
  isRegistered: boolean | null
  hiredDate: string | null
  firedDate: string | null
  branchId: number | null
  branch: string | null
  position: string | null
  workDays: string | null
}
export interface ExtBranch { id: number; title: string; active: number }
export interface ExtList { employees: ExtEmployee[]; branches: ExtBranch[]; syncedAt: string | null }
export interface SyncResult { pages: number; saved: number; total: number }

export interface SchedCell {
  employeeId: number; day: number; type: string | null
  planStart: string | null; planEnd: string | null
  factIn: string | null; factOut: string | null; workedMin: number
}
export interface SchedData {
  month: string; daysInMonth: number
  employees: { id: number; fullName: string; position: string | null }[]
  cells: SchedCell[]
}

export interface AnSummary {
  employees: number; planned: number; plannedPast: number; attended: number; extra: number
  late: number; noshow: number; hours: number; avgShiftMin: number; avgLateMin: number; earlyLeave: number
}
export interface AnEmp {
  id: number; fullName: string; position: string | null
  planned: number; plannedPast: number; attended: number; extra: number
  late: number; lateMin: number; noshow: number; earlyLeave: number
  hours: number; avgShiftMin: number; reliability: number | null
}
export interface AnData {
  month: string
  summary: AnSummary
  employees: AnEmp[]
  daily: { day: number; planned: number; came: number; late: number; noshow: number; hours: number }[]
  weekday: { dow: number; planned: number; came: number | null; late: number | null }[]
  lateBuckets: { label: string; ord: number; n: number }[]
}

export const extApi = {
  analytics: (month: string, branchId: number | null) => {
    const p = new URLSearchParams({ month })
    if (branchId) p.set('branchId', String(branchId))
    return request<AnData>(`/api/ext/analytics?${p.toString()}`)
  },
  schedule: (month: string, branchId: number | null) => {
    const p = new URLSearchParams({ month })
    if (branchId) p.set('branchId', String(branchId))
    return request<SchedData>(`/api/ext/schedule?${p.toString()}`)
  },
  syncSchedule: (month: string) =>
    request<{ month: string; pages: number; days: number }>(`/api/ext/sync-schedule?month=${month}`, send('POST', {})),
  list: (q: string, branchId: number | null, fired: boolean) => {
    const p = new URLSearchParams()
    if (q.trim()) p.set('q', q.trim())
    if (branchId) p.set('branchId', String(branchId))
    if (fired) p.set('fired', 'true')
    const s = p.toString()
    return request<ExtList>(`/api/ext/employees${s ? `?${s}` : ''}`)
  },
  sync: () => request<SyncResult>('/api/ext/sync', send('POST', {})),
}
