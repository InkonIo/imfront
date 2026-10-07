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

export const extApi = {
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
