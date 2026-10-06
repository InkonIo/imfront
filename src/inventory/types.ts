export type CountStatus = 'DRAFT' | 'SUBMITTED'

export interface InvLine {
  id: number
  zone: string
  sortOrder: number
  name: string
  packText: string | null
  caseQty: number | null
  sleeveQty: number | null
  unit: string
  decimal: boolean
  cs: number | null
  slv: number | null
  ea: number | null
  none: boolean
  total: number | null
  filled: boolean
  prevCs: number | null
  prevSlv: number | null
  prevEa: number | null
  prevTotal: number | null
  prevDate: string | null
  warning: string | null
  confirmed: boolean
}

export interface InvCount {
  id: number
  listCode: string
  listTitle: string
  outletId: number
  outletName: string
  date: string
  userId: number
  userName: string
  status: CountStatus
  startedAt: string
  submittedAt: string | null
  total: number
  filled: number
  warnings: number
  editable: boolean
  lines: InvLine[]
}

export interface InvSummary {
  id: number
  listTitle: string
  outletName: string
  date: string
  userName: string
  status: CountStatus
  submittedAt: string | null
  total: number
  filled: number
  recounted: number
}

export interface LineBody {
  cs: number | null
  slv: number | null
  ea: number | null
  none: boolean
  confirmed: boolean
}