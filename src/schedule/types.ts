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

export interface MiddleShift {
  role: ShiftRole
  start: string
  end: string
}

export interface Slot {
  date: string
  dayPart: DayPart
  role: ShiftRole
  startTime: string | null
  endTime: string | null
  userId: number | null
  userName: string | null
  published: boolean
  conflict: string | null
  limit: string | null
}

export interface Absence {
  id: number
  userId: number
  userName: string | null
  kind: AbsenceKind
  from: string
  to: string
  note: string | null
  freed?: number
}

export interface Limit {
  id: number
  userId: number
  userName: string | null
  weekdays: number[]
  dayPart: DayPart | null
  from: string | null
  to: string | null
  note: string | null
}

export interface Stat {
  userId: number
  shifts: number
  mornings: number
  evenings: number
  middles: number
  insides: number
}

export interface Board {
  outletId: number
  outletName: string
  from: string
  to: string
  morning: ShiftRole[]
  evening: ShiftRole[]
  middle: MiddleShift[]
  slots: Slot[]
  staff: Staff[]
  absences: Absence[]
  limits: Limit[]
  stats: Stat[]
  warnings: string[]
}

export interface SlotRef {
  date: string
  dayPart: DayPart
  role: ShiftRole
  startTime: string | null
  endTime: string | null
}

/** Колонка сетки: утро/вечер (роль) или промеж (роль + время). */
export interface Col {
  part: DayPart
  role: ShiftRole
  start: string | null
  end: string | null
}

export interface MySlot {
  date: string
  dayPart: DayPart
  role: ShiftRole
  startTime: string | null
  endTime: string | null
  outletId: number
  outletName: string
}

export const POSITIONS: ShiftRole[] = ['INSIDE', 'PRODUCTION_MANAGER', 'SERVICE_MANAGER']
/** Промеж бывает только у этих ролей. */
export const MIDDLE_ROLES: ShiftRole[] = ['PRODUCTION_MANAGER', 'SERVICE_MANAGER']

export const POSITION_LABEL: Record<ShiftRole, string> = {
  INSIDE: 'Инсайд',
  PRODUCTION_MANAGER: 'Кухня',
  SERVICE_MANAGER: 'Прилавок',
}

export const PART_LABEL: Record<DayPart, string> = { MORNING: 'Утро', EVENING: 'Вечер', MIDDLE: 'Промеж' }
export const PART_ICON: Record<DayPart, string> = { MORNING: '🌅', EVENING: '🌙', MIDDLE: '🌤' }

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

export const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

/** '12:00:00' → '12:00'. */
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')

/** 1 = пн … 7 = вс. */
export const isoWeekday = (date: string) => {
  const d = new Date(`${date}T12:00:00`).getDay()
  return d === 0 ? 7 : d
}

/** «🌤 Промеж 12:00–21:00 · Прилавок». */
export function shiftLabel(s: { dayPart: DayPart; role: ShiftRole; startTime: string | null; endTime: string | null }) {
  const time = s.dayPart === 'MIDDLE' && s.startTime ? ` ${hhmm(s.startTime)}–${hhmm(s.endTime)}` : ''
  return `${PART_ICON[s.dayPart]} ${PART_LABEL[s.dayPart]}${time} · ${POSITION_LABEL[s.role]}`
}

const fmtDate = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}`

/** «Пн, Вт · утро · по 30.11». */
export function limitText(l: Limit) {
  const days = l.weekdays.length === 7 ? 'все дни' : l.weekdays.map((d) => WEEKDAY_SHORT[d - 1]).join(', ')
  const part = l.dayPart ? PART_LABEL[l.dayPart].toLowerCase() : 'весь день'
  const period =
    !l.from && !l.to
      ? 'постоянно'
      : `${l.from ? `с ${fmtDate(l.from)} ` : ''}${l.to ? `по ${fmtDate(l.to)}` : ''}`.trim()
  return `${days} · ${part} · ${period}`
}

/** Действует ли пожелание в эту дату для этой части дня. */
export function limitBlocks(l: Limit, date: string, part: DayPart) {
  if (l.from && date < l.from) return false
  if (l.to && date > l.to) return false
  if (l.dayPart && l.dayPart !== part) return false
  return l.weekdays.includes(isoWeekday(date))
}