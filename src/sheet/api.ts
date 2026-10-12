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

export interface SheetListRow {
  id: number
  outletId: number
  outletName: string
  date: string
  morningName: string | null
  eveningName: string | null
  ticks: number
  updatedAt: string | null
}

export interface SheetTriple {
  sales: number
  gc: number
  avgCheck: number
}

export interface SheetAuto {
  mapped: boolean
  pct: number
  prevDate: string
  prev?: SheetTriple | null
  goal?: SheetTriple | null
  basis?: string[]
  hours?: { hour: number; guests: number; sales: number }[]
  planHours?: { hour: number; gc: number; sales: number }[]
  pcts?: Record<string, string>
}

export interface SheetImportResult {
  from: string
  to: string
  days: number
  guests: number
}

export interface PriorityTpl {
  id: number
  title: string
  category: string | null
}

export const sheetApi = {
  current: () => request<Sheet>('/api/sheets/current'),
  get: (id: number) => request<Sheet>(`/api/sheets/${id}`),
  list: (from: string, to: string, outletId: string) =>
    request<SheetListRow[]>(`/api/sheets?from=${from}&to=${to}${outletId ? `&outletId=${outletId}` : ''}`),
  auto: (id: number) => request<SheetAuto>(`/api/sheets/${id}/auto`),
  importSales: (id: number, fileName: string, data: string) =>
    request<SheetImportResult>(`/api/sheets/${id}/sales-import`, send('POST', { fileName, data })),
  priorities: (outletId: number) => request<PriorityTpl[]>(`/api/sheet-priorities?outletId=${outletId}`),
  save: (id: number, values: Record<string, string | null>) =>
    request<{ updatedAt: string }>(`/api/sheets/${id}/values`, send('PUT', { values })),
}