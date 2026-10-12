import { request, send } from '../api'

export type NoteStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE'

export interface Note {
  id: number
  outletId: number
  outletName: string
  title: string
  body: string | null
  status: NoteStatus
  createdAt: string
  statusAt: string | null
  createdBy: number
  createdByName: string | null
  responsibleName: string | null
  statusByName: string | null
}

export interface NoteLog {
  status: NoteStatus
  comment: string | null
  userName: string | null
  at: string
}

const P = '/api/outlet-notes'

export const noteApi = {
  list: (outletId?: number | null, all = false) => {
    const q = new URLSearchParams()
    if (outletId) q.set('outletId', String(outletId))
    if (all) q.set('all', 'true')
    const s = q.toString()
    return request<Note[]>(s ? `${P}?${s}` : P)
  },
  create: (b: { outletId: number; title: string; body: string | null }) => request<{ id: number }>(P, send('POST', b)),
  update: (id: number, b: { outletId: number; title: string; body: string | null }) =>
    request<{ ok: boolean }>(`${P}/${id}`, send('PUT', b)),
  setStatus: (id: number, status: NoteStatus, comment: string | null) =>
    request<{ ok: boolean }>(`${P}/${id}/status`, send('POST', { status, comment })),
  log: (id: number) => request<NoteLog[]>(`${P}/${id}/log`),
  remove: (id: number) => request<{ ok: boolean }>(`${P}/${id}`, send('DELETE')),
}