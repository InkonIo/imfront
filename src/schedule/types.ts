import type { DayPart, ShiftRole } from '../types'

export type JobTitle = 'DIRECTOR' | 'DEPUTY' | 'MANAGER' | 'TRAINEE'
export type AbsenceKind = 'VACATION' | 'SICK' | 'OTHER'

export interface Staff {
  userId: number
  fullName: string
  login: string
  jobTitle: JobTitle
  canInside: boolean
  schedulable: boolean
  maxShiftsWeek: number
}

export interface Slot {
  date: string
  dayPart: DayPart
  role: ShiftRole
  userId: number | null
  userName: string | null
  published: boolean
}

export interface Absence {
  id: number
  userId: number
  userName: string | null
  kind: AbsenceKind
  from: string
  to: string
  note: string | null
}

export interface Stat {
  userId: number
  shifts: number
  mornings: number
  evenings: number
  insides: number
}

export interface Board {
  outletId: number
  outletName: string
  from: string
  to: string
  morning: ShiftRole[]
  evening: ShiftRole[]
  slots: Slot[]
  staff: Staff[]
  absences: Absence[]
  stats: Stat[]
  warnings: string[]
}

export interface SlotRef {
  date: string
  dayPart: DayPart
  role: ShiftRole
}

export interface MySlot {
  date: string
  dayPart: DayPart
  role: ShiftRole
  outletId: number
  outletName: string
}

export const POSITIONS: ShiftRole[] = ['INSIDE', 'PRODUCTION_MANAGER', 'SERVICE_MANAGER']

export const POSITION_LABEL: Record<ShiftRole, string> = {
  INSIDE: 'Инсайд',
  PRODUCTION_MANAGER: 'Кухня',
  SERVICE_MANAGER: 'Прилавок',
}

export const JOB_LABEL: Record<JobTitle, string> = {
  DIRECTOR: 'Директор',
  DEPUTY: 'Зам. менеджера',
  MANAGER: 'Менеджер',
  TRAINEE: 'Свит-менеджер (учится)',
}

export const ABSENCE_LABEL: Record<AbsenceKind, string> = {
  VACATION: '🏖 Отпуск',
  SICK: '🤒 Больничный',
  OTHER: '📌 Другое',
}