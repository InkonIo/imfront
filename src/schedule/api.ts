import { request, send } from '../api'
import type { ShiftRole } from '../types'
import type { Absence, AbsenceKind, Board, JobTitle, MySlot, SlotRef, Staff } from './types'

export const scheduleApi = {
  board: (outletId: number, from: string, to: string) =>
    request<Board>(`/api/schedule?outletId=${outletId}&from=${from}&to=${to}`),
  generate: (body: {
    outletId: number
    from: string
    days: number
    morning: ShiftRole[]
    evening: ShiftRole[]
    keepFilled: boolean
  }) => request<Board>('/api/schedule/generate', send('POST', body)),
  setSlot: (body: SlotRef & { outletId: number; userId: number | null }) =>
    request<{ warnings: string[] }>('/api/schedule/slot', send('PUT', body)),
  swap: (outletId: number, a: SlotRef, b: SlotRef) =>
    request<{ warnings: string[] }>('/api/schedule/swap', send('POST', { outletId, a, b })),
  publish: (outletId: number, from: string, to: string) =>
    request<{ published: number; notified: number }>('/api/schedule/publish', send('POST', { outletId, from, to })),
  updateStaff: (userId: number, body: { jobTitle: JobTitle; canInside: boolean; schedulable: boolean; maxShiftsWeek: number }) =>
    request<Staff>(`/api/schedule/staff/${userId}`, send('PUT', body)),
  addAbsence: (body: { userId: number; kind: AbsenceKind; from: string; to: string; note: string | null }) =>
    request<Absence>('/api/schedule/absences', send('POST', body)),
  deleteAbsence: (id: number) => request<void>(`/api/schedule/absences/${id}`, send('DELETE')),
  today: () => request<MySlot[]>('/api/schedule/today'),
  my: (from: string, to: string) => request<MySlot[]>(`/api/schedule/my?from=${from}&to=${to}`),
}