import { request, send } from '../api'

export interface Caps { role: string; canManageSchedule: boolean; pending: number }

export type ReqKind = 'DAY_OFF' | 'UNAVAILABLE' | 'AVAILABLE'
export type ReqStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

/** Заявка глазами ответственной. */
export interface SchedRequest {
  id: number; employeeId: number; fullName: string; position: string | null; branch: string | null
  kind: ReqKind; dateFrom: string; dateTo: string; timeFrom: string | null; timeTo: string | null
  comment: string | null; status: ReqStatus; decisionNote: string | null; createdAt: string; decidedBy: string | null
  myShifts: number; minOthers: number | null
}

export interface AccountRow {
  employeeId: number; fullName: string; phone: string | null; position: string | null; branch: string | null
  userId: number | null; login: string | null; active: boolean | null; mustChange: boolean | null
}
export interface CreatedRow { employeeId: number; fullName?: string; status: 'created' | 'skipped'; reason?: string; login?: string; password?: string }
export interface OwnerInfo { ownerUserId: number | null; candidates: { id: number; fullName: string; role: string }[]; leadDays: number }

export const schedApi = {
  caps: () => request<Caps>('/api/me/caps'),
  requests: (status: 'PENDING' | 'ACTIVE' | 'ALL', month?: string, branchId?: number | null) => {
    const p = new URLSearchParams({ status })
    if (month) p.set('month', month)
    if (branchId) p.set('branchId', String(branchId))
    return request<SchedRequest[]>(`/api/sched/requests?${p.toString()}`)
  },
  decide: (id: number, approve: boolean, note: string) =>
    request<{ ok: boolean }>(`/api/sched/requests/${id}/decide`, send('POST', { approve, note })),
  accounts: (q: string, branchId: number | null) => {
    const p = new URLSearchParams()
    if (q.trim()) p.set('q', q.trim())
    if (branchId) p.set('branchId', String(branchId))
    const s = p.toString()
    return request<AccountRow[]>(`/api/sched/accounts${s ? `?${s}` : ''}`)
  },
  createAccounts: (employeeIds: number[]) => request<CreatedRow[]>('/api/sched/accounts', send('POST', { employeeIds })),
  reset: (employeeId: number) => request<{ login: string; password: string }>(`/api/sched/accounts/${employeeId}/reset`, send('POST', {})),
  setActive: (employeeId: number, active: boolean) =>
    request<{ ok: boolean }>(`/api/sched/accounts/${employeeId}/active`, send('POST', { active })),
  owner: () => request<OwnerInfo>('/api/admin/sched/owner'),
  setOwner: (userId: number | null, leadDays: number) =>
    request<OwnerInfo>('/api/admin/sched/owner', send('PUT', { userId, leadDays })),
}