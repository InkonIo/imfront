import { request, send } from '../api'
import type { FlagDecision, ItemDecision, ReviewQueueData, ReviewSummary } from './types'

export const reviewApi = {
  queue: () => request<ReviewQueueData>('/api/review/queue'),
  summary: () => request<ReviewSummary>('/api/review/summary'),
  decideFlag: (flagId: number, decision: FlagDecision, comment?: string) =>
    request<ReviewSummary>(`/api/review/flags/${flagId}`, send('POST', { decision, comment: comment ?? null })),
  decideShiftFlags: (shiftId: number, decision: FlagDecision, comment?: string) =>
    request<ReviewSummary>(`/api/review/shifts/${shiftId}/flags`, send('POST', { decision, comment: comment ?? null })),
  decideItem: (runItemId: number, decision: ItemDecision, comment?: string) =>
    request<ReviewSummary>(`/api/review/items/${runItemId}`, send('POST', { decision, comment: comment ?? null })),
}