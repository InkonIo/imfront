import { request, send } from '../api'
import type { ManagerBoard, ManagerEntry, ManagerWeek } from './types'

export const managerScheduleApi = {
  weeks: (outletId: number) =>
    request<ManagerWeek[]>(`/api/manager-schedule/weeks?outletId=${outletId}`),

  board: (weekId: number) =>
    request<ManagerBoard>(`/api/manager-schedule/weeks/${weekId}`),

  createWeek: (body: {
    outletId: number
    weekStart: string
    title?: string
    copyFromWeekId?: number | null
  }) => request<ManagerWeek>('/api/manager-schedule/weeks', send('POST', body)),

  saveEntry: (body: {
    weekId: number
    outletId: number
    userId: number
    date: string
    shiftStart: string | null
    shiftEnd: string | null
    dayOff: boolean
    comment: string | null
  }) => request<ManagerEntry>('/api/manager-schedule/entry', send('PUT', body)),

  deleteWeek: (weekId: number) =>
    request<void>(`/api/manager-schedule/weeks/${weekId}`, send('DELETE')),
}