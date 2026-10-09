export const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
export const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

export function currentMonth(): string {
  const d = new Date(Date.now() + 5 * 3600_000) // Алматы
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function hm(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
}
