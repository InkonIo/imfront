import type { InvLine } from './types'

export const fmt = (n: number) =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace('.', ',')

export function isFilled(l: Pick<InvLine, 'none' | 'cs' | 'slv' | 'ea'>) {
  return l.none || l.cs != null || l.slv != null || l.ea != null
}

export function totalOf(l: InvLine): number | null {
  if (l.none) return 0
  if (!isFilled(l)) return null
  const cs = l.cs ?? 0
  const slv = l.slv ?? 0
  const ea = l.ea ?? 0
  if (cs && l.caseQty == null) return null
  if (slv && l.sleeveQty == null) return null
  return Math.round((cs * (l.caseQty ?? 0) + slv * (l.sleeveQty ?? 0) + ea) * 100) / 100
}

function jump(now: number, before: number) {
  if (before === 0) return now >= 30
  const hi = Math.max(now, before)
  const lo = Math.min(now, before)
  return hi >= lo * 3 && hi - lo >= 5
}

export function warnOf(l: InvLine): string | null {
  if (!isFilled(l) || l.none) return null
  const cs = l.cs ?? 0
  const slv = l.slv ?? 0
  const ea = l.ea ?? 0
  if (cs > 60 || slv > 400 || ea > 5000) return 'Очень большое число. Проверь, нет ли лишней цифры'
  if (!l.prevDate) return null
  const total = totalOf(l)
  if (total != null && l.prevTotal != null) {
    return jump(total, l.prevTotal)
      ? `В прошлый раз было ${fmt(l.prevTotal)} ${l.unit}, сейчас ${fmt(total)}. Пересчитай`
      : null
  }
  if (jump(cs, l.prevCs ?? 0)) return `Кейсы: в прошлый раз ${fmt(l.prevCs ?? 0)}, сейчас ${fmt(cs)}. Пересчитай`
  if (jump(slv, l.prevSlv ?? 0)) return `Сливы: в прошлый раз ${fmt(l.prevSlv ?? 0)}, сейчас ${fmt(slv)}. Пересчитай`
  if (jump(ea, l.prevEa ?? 0)) return `Россыпью: в прошлый раз ${fmt(l.prevEa ?? 0)}, сейчас ${fmt(ea)}. Пересчитай`
  return null
}