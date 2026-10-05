import { request } from '../api'
import type { ShiftRole } from '../types'
import type { RatingBoard } from './types'

export const ratingApi = {
  board: (from: string, to: string, role: ShiftRole, outletId: number | null) => {
    const q = new URLSearchParams({ from, to, role })
    if (outletId !== null) q.set('outletId', String(outletId))
    return request<RatingBoard>(`/api/rating?${q}`)
  },
}