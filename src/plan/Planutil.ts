export const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
export const PART_LABEL: Record<string, string> = { MORNING: 'Утро', MID: 'Промежуточная', EVENING: 'Вечер', NIGHT: 'Ночь' }

const pad = (n: number) => String(n).padStart(2, '0')
export const parseIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const addDays = (s: string, n: number) => { const d = parseIso(s); d.setDate(d.getDate() + n); return toIso(d) }
export const dayLabel = (s: string) => { const d = parseIso(s); return `${WD[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}` }
export const shortName = (n: string) => n.split(' ').slice(0, 2).join(' ')
export const clk = (t: string | null | undefined) => (t === '23:59' ? '00:00' : t ?? '')
export const errText = (e: unknown) => (e instanceof Error ? e.message : 'Ошибка')
/** От сегодня + offset дней, чтобы выбирать дату из списка, а не календарём. */
export const dayOptions = (from: number, count: number) => {
  const base = new Date()
  base.setDate(base.getDate() + from)
  const first = toIso(base)
  return Array.from({ length: count }, (_, i) => { const v = addDays(first, i); return { value: v, label: dayLabel(v) } })
}
const FIXED: Record<string, number> = { K: 0, C: 1, DLK: 2, NT1: 3, NT2: 3, MR: 4, SUP: 5, TR: 6, TRN: 7 }
export const posClass = (code: string) => {
  if (code in FIXED) return `pc-${FIXED[code]}`
  let h = 0
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) % 8
  return `pc-${h}`
}