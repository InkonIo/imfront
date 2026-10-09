import { request, send } from '../api'

export interface EmpMe { fullName: string; position: string | null; branch: string | null }
export interface EmpDay {
  day: number; type: string | null; planStart: string | null; planEnd: string | null
  factIn: string | null; factOut: string | null; workedMin: number; planned: boolean
}
export interface EmpStats { planned: number; plannedPast: number; came: number; late: number; missed: number; workedMin: number; plannedMin: number }
export interface EmpReqMini { id: number; kind: 'DAY_OFF' | 'UNAVAILABLE' | 'AVAILABLE'; dateFrom: string; dateTo: string; timeFrom: string | null; timeTo: string | null; status: string }
export interface EmpSchedule {
  month: string; daysInMonth: number; days: EmpDay[]; stats: EmpStats; requests: EmpReqMini[]
  next: { date?: string; planStart?: string; planEnd?: string }
  leadDays: number
}
export interface EmpRequest {
  id: number; kind: 'DAY_OFF' | 'UNAVAILABLE' | 'AVAILABLE'; dateFrom: string; dateTo: string; timeFrom: string | null; timeTo: string | null
  comment: string | null; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'; decisionNote: string | null
}
export interface Coworker { fullName: string; position: string | null; planStart: string; planEnd: string }
export interface NewRequest { kind: string; dateFrom: string; dateTo: string; timeFrom?: string; timeTo?: string; comment?: string }

export const employeeApi = {
  me: () => request<EmpMe>('/api/employee/me'),
  schedule: (month: string) => request<EmpSchedule>(`/api/employee/schedule?month=${month}`),
  coworkers: (day: string) => request<Coworker[]>(`/api/employee/coworkers?day=${day}`),
  requests: () => request<EmpRequest[]>('/api/employee/requests'),
  create: (b: NewRequest) => request<{ id: number }>('/api/employee/requests', send('POST', b)),
  cancel: (id: number) => request<void>(`/api/employee/requests/${id}`, send('DELETE')),
}