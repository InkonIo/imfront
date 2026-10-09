import { request, send } from '../api'

export type DayKind = 'SHIFT' | 'OFF' | 'RESET'
export interface DayLogRow { at: string; by: string; before: string | null; after: string | null }

export interface PushResult {
  ok: boolean; reason?: string
  day?: string; from?: string; to?: string
  changes?: { field: string; from: string | null; to: string | null }[]
  sent?: boolean; verified?: boolean; message?: string; warning?: string; synced?: boolean
}

export const dayApi = {
  push: (employeeId: number, day: string, confirm: boolean) =>
    request<PushResult>('/api/sched/day/push', send('POST', { employeeId, day, confirm })),
  save: (b: { employeeId: number; day: string; kind: DayKind; start?: string; end?: string; note?: string }) =>
    request<{ ok: boolean; before: string; after: string }>('/api/sched/day', send('PUT', b)),
  log: (employeeId: number, day: string) =>
    request<DayLogRow[]>(`/api/sched/day/log?employeeId=${employeeId}&day=${day}`),
}