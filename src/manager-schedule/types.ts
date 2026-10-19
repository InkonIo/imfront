export interface ManagerWeek {
  id: number
  weekStart: string   // "2026-10-12"
  title: string | null
}

export interface ManagerEntry {
  id: number | null
  userId: number
  userName: string
  jobTitle: string
  date: string        // "2026-10-12"
  shiftStart: string | null   // "08:00"
  shiftEnd: string | null     // "16:30"
  dayOff: boolean
  comment: string | null
}

export interface ManagerBoard {
  week: ManagerWeek
  entries: ManagerEntry[]
  staff: Staff[]
}

export interface Staff {
  userId: number
  fullName: string
  jobTitle: string
}

export const SHIFT_PRESETS = [
  { label: 'Утро', start: '08:00', end: '16:30' },
  { label: 'Промеж', start: '10:00', end: '18:30' },
  { label: 'День', start: '12:00', end: '20:30' },
  { label: 'Вечер', start: '16:00', end: '00:30' },
  { label: 'Ночь', start: '00:00', end: '08:30' },
]

export const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export const dm = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}`

export const dowLabel = (s: string) => {
  const d = new Date(`${s}T12:00:00`).getDay()
  return DOW[d === 0 ? 6 : d - 1]
}

/** Понедельник текущей недели */
export const currentMonday = (): string => {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toLocaleDateString('en-CA')
}

export const addDays = (s: string, n: number): string => {
  const d = new Date(`${s}T12:00:00`)
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA')
}

/** Предупреждение: меньше 8 часов между концом предыдущей и началом следующей смены */
export function restWarning(prevEnd: string | null, nextStart: string | null): boolean {
  if (!prevEnd || !nextStart) return false
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  let end = toMin(prevEnd)
  let start = toMin(nextStart)
  if (start < end) start += 24 * 60   // переход через полночь
  return start - end < 8 * 60
}