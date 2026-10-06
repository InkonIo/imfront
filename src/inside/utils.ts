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

/** Время пункта в мс. До 06:00 = следующие сутки (вечерняя смена после полуночи). */
export function shiftTimeMs(shiftDate: string, time: string) {
  const hhmm = time.slice(0, 5)
  const d = new Date(`${shiftDate}T${hhmm}:00`)
  if (Number(hhmm.slice(0, 2)) < 6) d.setDate(d.getDate() + 1)
  return d.getTime()
}

export function isOverdue(i: RunItem, now: number, shiftDate: string) {
  if (i.status !== 'PENDING' || !i.dueTo) return false
  return now > shiftTimeMs(shiftDate, i.dueTo)
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

/** Когда снято фото: EXIF DateTimeOriginal, иначе дата файла. */
export async function readTakenAt(file: File): Promise<number> {
  try {
    const exif = await readExifDate(file)
    if (exif) return exif
  } catch {
    // битый EXIF не повод падать
  }
  return file.lastModified
}

async function readExifDate(file: File): Promise<number | null> {
  if (!/jpe?g/i.test(file.type)) return null
  const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer())
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null
  let off = 2
  while (off + 4 <= v.byteLength) {
    const marker = v.getUint16(off)
    if ((marker & 0xff00) !== 0xff00) return null
    const size = v.getUint16(off + 2)
    if (marker === 0xffe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966) {
      return parseTiffDate(v, off + 10) // после "Exif\0\0"
    }
    off += 2 + size
  }
  return null
}

function parseTiffDate(v: DataView, start: number): number | null {
  if (start + 8 > v.byteLength) return null
  const little = v.getUint16(start) === 0x4949
  const u16 = (o: number) => v.getUint16(start + o, little)
  const u32 = (o: number) => v.getUint32(start + o, little)

  const findTag = (ifd: number, tag: number): number | null => {
    if (start + ifd + 2 > v.byteLength) return null
    const count = u16(ifd)
    for (let i = 0; i < count; i++) {
      const e = ifd + 2 + i * 12
      if (start + e + 12 > v.byteLength) return null
      if (u16(e) === tag) return e
    }
    return null
  }

  const ifd0 = u32(4)
  const exifPtr = findTag(ifd0, 0x8769)
  let entry = exifPtr !== null ? findTag(u32(exifPtr + 8), 0x9003) : null // DateTimeOriginal
  if (entry === null) entry = findTag(ifd0, 0x0132) // DateTime
  if (entry === null) return null

  const valueOff = u32(entry + 8)
  if (start + valueOff + 19 > v.byteLength) return null
  let s = ''
  for (let i = 0; i < 19; i++) s += String.fromCharCode(v.getUint8(start + valueOff + i))
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s)
  if (!m) return null
  const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime()
  return Number.isFinite(t) ? t : null
}