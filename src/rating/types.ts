import type { ShiftRole } from '../types'

export interface RatingEntry {
  rank: number
  userId: number
  name: string
  shifts: number
  score: number
  avgScore: number
  completionPct: number
  onTimePct: number | null
  violations: number
  photos: number
  perfect: number
}

export interface RatingBoard {
  from: string
  to: string
  role: ShiftRole
  outletId: number | null
  entries: RatingEntry[]
}