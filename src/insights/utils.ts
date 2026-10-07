import { useEffect, useState } from 'react'

export const BRAND = '#fcb614'
export const RED = '#e52723'

/** Категориальная палитра (фиксированный порядок) — по одному цвету на человека. */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#e87ba4', '#4a3aa7', '#eda100']

export const DAY_PART: Record<string, string> = { MORNING: 'Утро', EVENING: 'Вечер', MIDDLE: 'Промеж' }
export const ROLE: Record<string, string> = {
  INSIDE: 'Инсайд',
  PRODUCTION_MANAGER: 'Кухня',
  SERVICE_MANAGER: 'Прилавок',
}
export const FLAG: Record<string, string> = {
  TOO_FAST: 'Слишком быстро',
  OLD_PHOTO: 'Старое фото',
  DUPLICATE_PHOTO: 'Дубль фото',
  REJECTED: 'Отклонено директором',
  LATE: 'Опоздание',
  SKIPPED: 'Пропуск',
  NOT_DONE: 'Не сделано',
  BURST: 'Пачка отметок',
  DEVICE_SWITCH: 'Смена устройства',
  SLOW: 'Слишком долго',
  IDLE_LONG: 'Долгая пауза',
}
export const REVIEW: Record<string, string> = { OPEN: 'Ждёт проверки', CONFIRMED: 'Подтверждён', DISMISSED: 'Отклонён' }
export const ITEM_STATUS: Record<string, string> = { DONE: 'Сделано', PENDING: 'Не сделано', SKIPPED: 'Пропущено', PROBLEM: 'Проблема' }
export const PART_LABEL: Record<string, string> = {
  done: 'Выполнено (+1)',
  on_time: 'Вовремя (+1)',
  approved: 'Одобрено директором (+2)',
  skipped: 'Пропуски (−1)',
  not_done: 'Не сделано (−2)',
  flag_medium: 'Флаги MEDIUM (−3)',
  flag_high: 'Флаги HIGH (−5)',
  other: 'Бонусы и прочее',
}
export const ABSENCE: Record<string, string> = { SICK: 'Больничный', VACATION: 'Отпуск', OTHER: 'Другое' }
export const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export const num = (v: unknown): number => (typeof v === 'number' ? v : v == null ? 0 : Number(v) || 0)
export const has = (v: unknown) => v !== null && v !== undefined && v !== ''
export const fmt = (v: unknown, d = 0) =>
  has(v) ? num(v).toLocaleString('ru-RU', { maximumFractionDigits: d }) : '—'
export const pct = (v: unknown) => (has(v) ? `${fmt(v)}%` : '—')
export const signed = (v: number, d = 0) => (v > 0 ? '+' : '') + v.toLocaleString('ru-RU', { maximumFractionDigits: d })

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return ymd(d)
}
export const shortDate = (s?: string) => {
  if (!s) return '—'
  const [, m, d] = s.slice(0, 10).split('-')
  return `${d}.${m}`
}
export const fullDate = (s?: string) => {
  if (!s) return '—'
  const [y, m, d] = s.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}
export const hhmm = (s?: string) => (s ? s.slice(11, 16) : '—')
export const dt = (s?: string) => (s ? `${shortDate(s)} ${hhmm(s)}` : '—')
export const mins = (v: unknown) => {
  if (!has(v)) return '—'
  const m = Math.round(num(v))
  return m >= 60 ? `${Math.floor(m / 60)}ч ${m % 60}м` : `${m} мин`
}
export const initials = (name?: string) =>
  (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')

/** Цвет «хорошо/плохо» для процента выполнения. */
export const tone = (v: unknown, good = 85, warn = 65) =>
  !has(v) ? 'mute' : num(v) >= good ? 'good' : num(v) >= warn ? 'warn' : 'bad'

export interface Async<T> { data: T | null; loading: boolean; error: string | null }
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const [s, set] = useState<Async<T>>({ data: null, loading: true, error: null })
  useEffect(() => {
    let alive = true
    set(p => ({ ...p, loading: true, error: null }))
    fn().then(
      d => alive && set({ data: d, loading: false, error: null }),
      e => alive && set({ data: null, loading: false, error: e instanceof Error ? e.message : String(e) }),
    )
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return s
}
