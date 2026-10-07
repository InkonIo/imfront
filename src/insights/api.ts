import { request } from '../api'

/** Если ваш request уже добавляет /api — поправьте только эту константу. */
const P = '/api/insights'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>

export interface Filters {
  from: string
  to: string
  outletId: string // '' = все точки
}

type Q = Record<string, string | number | undefined | null>
const qs = (o: Q) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')
  return p.length ? '?' + p.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&') : ''
}
const base = (f: Filters): Q => ({ from: f.from, to: f.to, outletId: f.outletId })

export const ins = {
  outlets: () => request<Row[]>(`${P}/outlets`),
  overview: (f: Filters) => request<Row>(`${P}/overview${qs(base(f))}`),
  managers: (f: Filters) => request<Row>(`${P}/managers${qs(base(f))}`),
  manager: (id: number, f: Filters) => request<Row>(`${P}/managers/${id}${qs(base(f))}`),
  shifts: (f: Filters, userId?: number, limit = 100, offset = 0) =>
    request<Row>(`${P}/shifts${qs({ ...base(f), userId, limit, offset })}`),
  shift: (id: number) => request<Row>(`${P}/shifts/${id}`),
  events: (f: Filters, o: { userId?: number; type?: string; limit?: number; offset?: number }) =>
    request<Row>(`${P}/events${qs({ ...base(f), ...o })}`),
  invCounts: (f: Filters, userId?: number, limit = 100) =>
    request<Row>(`${P}/inventory/counts${qs({ ...base(f), userId, limit })}`),
  invCount: (id: number) => request<Row>(`${P}/inventory/counts/${id}`),
  invProducts: (f: Filters, userId?: number) =>
    request<Row>(`${P}/inventory/products${qs({ ...base(f), userId })}`),
  invProduct: (id: number, f: Filters, userId?: number) =>
    request<Row>(`${P}/inventory/products/${id}${qs({ ...base(f), userId })}`),
  compare: (ids: number[], f: Filters) =>
    request<Row>(`${P}/compare${qs({ ...base(f), ids: ids.join(',') })}`),
  attendance: (f: Filters, userId?: number) =>
    request<Row>(`${P}/attendance${qs({ ...base(f), userId })}`),
}
