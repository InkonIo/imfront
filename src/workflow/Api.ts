import { request, send } from '../api'

export interface DoneRec { itemId: string; periodKey: string }

export const workflowApi = {
  done: (keys: string[]) => request<DoneRec[]>(`/api/workflow/done?${keys.map((k) => `keys=${encodeURIComponent(k)}`).join('&')}`),
  toggle: (itemId: string, periodKey: string, done: boolean) =>
    request<{ ok: boolean }>('/api/workflow/toggle', send('POST', { itemId, periodKey, done })),
}