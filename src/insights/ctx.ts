import { createContext, useContext } from 'react'
import type { Filters, Row } from './api'

export interface InsightsCtx {
  f: Filters
  outlets: Row[]
  openManager: (id: number) => void
  openShift: (id: number) => void
  openCount: (id: number) => void
  openProduct: (id: number, name: string) => void
  compareWith: (ids: number[]) => void
}
export const Ctx = createContext<InsightsCtx>(null as unknown as InsightsCtx)
export const useIns = () => useContext(Ctx)
