import { useEffect, useState } from 'react'
import type { RunItem } from '../types'

export const DAILY_SECTION = 'Регламент дня'

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export const pct = (done: number, total: number) => (total ? Math.round((done * 100) / total) : 0)

export function fmtTime(t: string | null) {
  return t ? t.slice(0, 5) : null
}

export function timingLabel(i: RunItem) {
  const from = fmtTime(i.dueFrom)
  const to = fmtTime(i.dueTo)
  if (from && to) return `${from}–${to}`
  if (to) return `до ${to}`
  if (from) return `с ${from}`
  return null
}

export function isOverdue(i: RunItem, now: number, shiftDate: string) {
  if (i.status !== 'PENDING' || !i.dueTo) return false
  return now > new Date(`${shiftDate}T${fmtTime(i.dueTo)}:00`).getTime()
}

export function groupBySection(items: RunItem[]) {
  const map = new Map<number, { order: number; title: string; items: RunItem[] }>()
  for (const i of items) {
    let g = map.get(i.sectionOrder)
    if (!g) {
      g = { order: i.sectionOrder, title: i.sectionTitle, items: [] }
      map.set(i.sectionOrder, g)
    }
    g.items.push(i)
  }
  return [...map.values()].sort((a, b) => a.order - b.order)
}

/** Сжимает фото с камеры до JPEG ~1600px. Если браузер не умеет (например, HEIC в Chrome), отдаёт оригинал. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  } finally {
    URL.revokeObjectURL(url)
  }
}