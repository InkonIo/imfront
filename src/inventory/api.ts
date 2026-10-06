import { request, send } from '../api'
import type { InvCount, InvLine, InvSummary, LineBody } from './types'

export const inventoryApi = {
  current: () => request<InvCount | undefined>('/api/inventory/current'),
  start: () => request<InvCount>('/api/inventory/start', send('POST', {})),
  get: (id: number) => request<InvCount>(`/api/inventory/${id}`),
  updateLine: (id: number, lineId: number, body: LineBody) =>
    request<InvLine>(`/api/inventory/${id}/lines/${lineId}`, send('PUT', body)),
  submit: (id: number) => request<InvCount>(`/api/inventory/${id}/submit`, send('POST')),
  list: (from: string, to: string) => request<InvSummary[]>(`/api/inventory?from=${from}&to=${to}`),
}