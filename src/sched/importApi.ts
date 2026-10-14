import { request, send } from '../api'

export interface ImpCell {
  day: number; date: string
  kind: 'SHIFT' | 'OFF' | 'VACATION' | 'TASK' | 'EMPTY'
  start: string | null; end: string | null; part: 'MORNING' | 'MID' | 'EVENING' | 'NIGHT' | null
  pos: string | null; note: string | null; raw: string; warn: string | null
}
export interface ImpPerson {
  name: string; title: string; employeeId: number | null; employeeName: string | null; cells: ImpCell[]
}
export interface ImpWeek {
  sheet: string; weekStart: string; dayNotes: string[]; warnings: string[]
  people: ImpPerson[]; shifts: number; hasDraft: boolean
}
export interface ImpPreview {
  weeks: ImpWeek[]; unmatched: string[]; employees: { id: number; name: string }[]
}
export interface ImpApplied {
  weekStart: string; draftId?: number; shifts?: number; people?: number
  skippedPeople?: string[]; published?: boolean; error?: string
}

const B = (b: number) => `/api/sched/plan/branches/${b}/import-schedule`

export const importApi = {
  preview: (b: number, data: string) => request<ImpPreview>(`${B(b)}/preview`, send('POST', { data })),
  apply: (b: number, data: string, weeks: string[], map: Record<string, number>, publish: boolean) =>
    request<{ ok: boolean; results: ImpApplied[] }>(`${B(b)}/apply`, send('POST', { data, weeks, map, publish })),
}