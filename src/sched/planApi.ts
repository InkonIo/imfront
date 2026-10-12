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
export interface TrainingIn { instructorId: number; traineeId: number | null; traineeName: string; from: string; to: string; start: string; end: string; comment: string }

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
export interface OverviewCell {
  kind: 'SHIFT' | 'ABSENCE' | 'OFF'; start?: string; end?: string; pos?: string; src?: 'PUB' | 'DRAFT' | 'TT'
  ttStart?: string; ttEnd?: string; ttNote?: string; note?: string
  parts?: { pos: string; start: string; end: string }[]
  plan?: { start: string; end: string; pos: string; src?: 'PUB' | 'DRAFT' }
  replaces?: string; replacedBy?: string
  factIn?: string; noShow?: boolean
}
export interface OverviewRow { id: number; name: string; role: 'MANAGER' | 'INSTRUCTOR' | 'STAFF'; cells: (OverviewCell | null)[]; any: boolean }
export interface Overview { days: string[]; rows: OverviewRow[]; ttSyncedAt: string | null; ttSyncedMin: number | null }
export interface AnPos { pos: string; shifts: number; minutes: number; breakMin: number; durs: string }
export interface AnEmp {
  id: number; name: string; shifts: number; minutes: number; breakMin: number; days: number
  morning: number; mid: number; evening: number; night: number; weekend: number
  byPos: AnPos[]; can: string[]; offPos: string[]
}
export interface AnPosTotal { pos: string; shifts: number; people: number; minutes: number; breakMin: number }
export interface AnSales {
  has: boolean; guests: number; amount: number; days: number; avgCheck: number
  byDay: { day: string; hours: number[] }[]
  lastImport: { file: string | null; restaurant: string | null; from: string; to: string; at: string } | null
}
export interface SalesImportResult { restaurant: string | null; from: string; to: string; days: number; rows: number; guests: number; sales: number; replaced: number }
export interface Analytics {
  from: string; to: string; includeDrafts: boolean; draftWeeksOnly: number
  total: { people: number; shifts: number; minutes: number; breakMin: number; prodMin: number }
  employees: AnEmp[]; positions: AnPosTotal[]
  heat: { day: string; hours: number[] }[]
  sales: AnSales
  breakRule: { minHours: number; minutes: string }[]
}
export interface AnShift {
  day: string; emp: number; name: string; role?: string; pos: string | null; start: string; end: string; min: number
  src?: string; noShow?: boolean; factIn?: string; replaces?: string
}
export interface AnShifts {
  from: string; to: string; includeDrafts: boolean; shifts: AnShift[]
  can: Record<string, string[]>
  sales: { guests: number; amount: number; avgCheck: number; byDay: { day: string; hours: number[]; total: number; amount: number }[] }
  breakRule: { minHours: number; total: number; text: string }[]
}
export interface AnCoverage {
  salesFrom: string | null; salesTo: string | null; planFrom: string | null; planTo: string | null; ttFrom: string | null; ttTo: string | null
}
export interface PlanSettings { maxConsecutive: number; minRestHours: number }
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

  overview: (b: number, from: string, days = 7) => request<Overview>(`${B}/overview?branchId=${b}&from=${from}&days=${days}`),
  analytics: (b: number, from: string, to: string, drafts: boolean) =>
    request<Analytics>(`${B}/analytics?branchId=${b}&from=${from}&to=${to}&drafts=${drafts}`),
  analyticsCoverage: (b: number) => request<AnCoverage>(`${B}/analytics/coverage?branchId=${b}`),
  analyticsShifts: (b: number, from: string, to: string, drafts: boolean) =>
    request<AnShifts>(`${B}/analytics/shifts?branchId=${b}&from=${from}&to=${to}&drafts=${drafts}`),
  importSales: (b: number, fileName: string, data: string) =>
    request<SalesImportResult>(`${B}/sales/import?branchId=${b}`, send('POST', { fileName, data })),
  settings: () => request<PlanSettings>(`${B}/settings`),
  saveSettings: (s: PlanSettings) => request<PlanSettings>(`${B}/settings`, send('PUT', s)),

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