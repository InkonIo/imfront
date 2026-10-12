import { request, send } from '../api'

export interface PriorityRow {
  id: number
  title: string
  category: string | null
  outletId: number | null
  outletName: string | null
  active: boolean
  sortOrder: number
  global: boolean
}

export interface PriorityIn {
  title: string
  category: string | null
  outletId: number | null
  active: boolean
  sortOrder: number
}

const P = '/api/sheet-priorities'

export const priorityApi = {
  list: () => request<PriorityRow[]>(`${P}/manage`),
  create: (b: PriorityIn) => request<{ id: number }>(P, send('POST', b)),
  update: (id: number, b: PriorityIn) => request<{ ok: boolean }>(`${P}/${id}`, send('PUT', b)),
  remove: (id: number) => request<{ ok: boolean }>(`${P}/${id}`, send('DELETE')),
}