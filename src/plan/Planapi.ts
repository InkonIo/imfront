import { request, send } from '../api'

export interface PlanBranch { id: number; title: string; employees: number; withPositions: number; slotNeed: number }
export interface Position { code: string; title: string; planned: boolean; note: string | null }
export type Part = 'MORNING' | 'MID' | 'EVENING' | 'NIGHT'
export interface SlotRow { pos: string; part: Part; need: number; start: string; end: string }
export interface PlanEmp {
  id: number; name: string; isManager: boolean; isInstructor: boolean; inKln: boolean; manualLink: boolean
  positions: { code: string; source: 'KLN' | 'MANUAL' }[]
}
export interface Training {
  id: number; instructorId: number; instructor: string; traineeId: number | null; trainee: string | null
  from: string; to: string; start: string; end: string; comment: string | null
}
export interface TrainingIn { instructorId: number; traineeId: number | null; from: string; to: string; start: string; end: string; comment: string }

export interface DraftBrief { id: number; weekStart: string; status: 'DRAFT' | 'PUBLISHED'; cells: number; empty: number }
export interface Shift {
  id: number; day: string; pos: string; part: Part; start: string; end: string
  employeeId: number | null; employeeName: string | null; manual: boolean; note: string | null
}
export interface Limit { employeeId: number; day: string; kind: 'ABSENCE' | 'DAY_OFF' | 'UNAVAILABLE' | 'AVAILABLE'; note?: string; from?: string; to?: string }
export interface Draft {
  id: number; branchId: number; branchTitle: string; weekStart: string; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; publishedAt: string | null
  shifts: Shift[]; employees: { id: number; name: string; positions: string[] }[]; limits: Limit[]; pendingRequests: number
}
export interface GenResult {
  draftId: number; weekStart: string; filled: number; empty: number; warnings: string[]
  pendingRequests: number; employeesUsed: number; slotsDefined: number
}
export interface KlnBranch { id: number; title: string; ttBranchId: number | null; users: number; suggestTtBranchId?: number }
export interface KlnUser { id: number; name: string; branch: string; active: boolean; phoneTail: string; positions: string; linkedTo: number | null }
export interface KlnReport {
  branches?: number; users?: number; matched: number; positions: number
  unknownPositions: string[]; unmatchedInMappedBranches: string[]
}

const B = '/api/sched/plan'

export const planApi = {
  branches: () => request<PlanBranch[]>(`${B}/branches`),
  positions: () => request<Position[]>(`${B}/positions`),

  slots: (b: number) => request<SlotRow[]>(`${B}/branches/${b}/slots`),
  saveSlots: (b: number, rows: SlotRow[]) => request<SlotRow[]>(`${B}/branches/${b}/slots`, send('PUT', rows)),
  preset: (b: number) => request<SlotRow[]>(`${B}/branches/${b}/slots/preset?name=evening`, send('POST', {})),

  employees: (b: number) => request<PlanEmp[]>(`${B}/branches/${b}/employees`),
  addPos: (e: number, code: string) => request<{ ok: boolean }>(`${B}/employees/${e}/positions/${encodeURIComponent(code)}`, send('POST', {})),
  delPos: (e: number, code: string) => request<{ ok: boolean }>(`${B}/employees/${e}/positions/${encodeURIComponent(code)}`, send('DELETE')),

  trainings: (b: number) => request<Training[]>(`${B}/branches/${b}/trainings`),
  addTraining: (b: number, t: TrainingIn) => request<{ id: number }>(`${B}/branches/${b}/trainings`, send('POST', t)),
  delTraining: (b: number, id: number) => request<{ ok: boolean }>(`${B}/branches/${b}/trainings/${id}`, send('DELETE')),

  generate: (b: number, weekStart: string) => request<GenResult>(`${B}/branches/${b}/generate?weekStart=${weekStart}`, send('POST', {})),
  drafts: (b: number) => request<DraftBrief[]>(`${B}/branches/${b}/drafts`),
  draft: (id: number) => request<Draft>(`${B}/drafts/${id}`),
  assign: (id: number, sid: number, employeeId: number | null) =>
    request<{ ok: boolean; warnings: string[] }>(`${B}/drafts/${id}/shifts/${sid}`, send('PUT', { employeeId })),
  addShift: (id: number, s: { day: string; pos: string; start: string; end: string }) =>
    request<{ ok: boolean; id: number }>(`${B}/drafts/${id}/shifts`, send('POST', { ...s, employeeId: null, note: null })),
  delShift: (id: number, sid: number) => request<{ ok: boolean }>(`${B}/drafts/${id}/shifts/${sid}`, send('DELETE')),
  publish: (id: number, confirmEmpty: boolean) =>
    request<{ ok: boolean; emptySlots: number; message: string }>(`${B}/drafts/${id}/publish?confirmEmpty=${confirmEmpty}`, send('POST', {})),

  klnSync: () => request<KlnReport>(`${B}/kln/sync`, send('POST', {})),
  klnRematch: () => request<KlnReport>(`${B}/kln/rematch`, send('POST', {})),
  klnUsers: (q: string) => request<KlnUser[]>(`${B}/kln/users?q=${encodeURIComponent(q)}`),
  klnLink: (employeeId: number, klnUserId: number) => request<KlnReport>(`${B}/employees/${employeeId}/kln-link`, send('PUT', { klnUserId })),
  klnUnlink: (employeeId: number) => request<KlnReport>(`${B}/employees/${employeeId}/kln-link`, send('DELETE')),
  klnBranches: () => request<KlnBranch[]>(`${B}/kln/branches`),
  klnMap: (id: number, ttBranchId: number | null) => request<{ ok: boolean }>(`${B}/kln/branches/${id}/map`, send('PUT', { ttBranchId })),
}