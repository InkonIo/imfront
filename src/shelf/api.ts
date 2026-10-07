import { request, send } from '../api'

export interface Rule {
  id: number
  kind: 'SHELF' | 'THAW' | 'HOLD' | 'WASH' | 'DRY'
  place: string
  term: string
  durationMin: number | null
  zone: 'ROOM' | 'COLD' | 'FREEZER' | 'WATER' | null
  hit?: boolean
}
export interface Product { id: number; name: string; note: string | null; rules: Rule[] }
export interface Section { id: number; title: string; note: string | null; products: Product[] }
export interface Zone { code: string; label: string; tempText: string }
export interface ShelfData {
  doc: { title: string; version: number; docDate: string | null; notice: string | null }
  zones: Zone[]
  sections: Section[]
  total: number
  query: string
}

const P = '/api/shelf-life'

export const shelfApi = {
  list: (q: string, zone: string, sectionId: number | null) => {
    const p = new URLSearchParams()
    if (q.trim()) p.set('q', q.trim())
    if (zone) p.set('zone', zone)
    if (sectionId) p.set('sectionId', String(sectionId))
    const s = p.toString()
    return request<ShelfData>(`${P}${s ? '?' + s : ''}`)
  },
  updateDoc: (b: { version: number; docDate: string | null; notice: string | null }) =>
    request<void>(`${P}/admin/doc`, send('PUT', b)),
  createProduct: (b: { sectionId: number; name: string; note: string | null }) =>
    request<{ id: number }>(`${P}/admin/products`, send('POST', b)),
  updateProduct: (id: number, b: { sectionId: number | null; name: string; note: string | null }) =>
    request<void>(`${P}/admin/products/${id}`, send('PUT', b)),
  deleteProduct: (id: number) => request<void>(`${P}/admin/products/${id}`, send('DELETE')),
  createRule: (productId: number, b: RuleBody) =>
    request<{ id: number }>(`${P}/admin/products/${productId}/rules`, send('POST', b)),
  updateRule: (id: number, b: RuleBody) => request<void>(`${P}/admin/rules/${id}`, send('PUT', b)),
  deleteRule: (id: number) => request<void>(`${P}/admin/rules/${id}`, send('DELETE')),
}
export interface RuleBody { kind: string; place: string; term: string; zone: string | null }
