import { request, send } from '../api'

export interface Sheet {
  id: number
  outletId: number
  outletName: string
  date: string
  morningName: string | null
  eveningName: string | null
  editable: boolean
  values: Record<string, string>
}

export const sheetApi = {
  current: () => request<Sheet>('/api/sheets/current'),
  get: (id: number) => request<Sheet>(`/api/sheets/${id}`),
  save: (id: number, values: Record<string, string | null>) =>
    request<{ updatedAt: string }>(`/api/sheets/${id}/values`, send('PUT', { values })),
}