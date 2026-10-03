import type { ChecklistPhoto, DayPart, FlagSeverity, FlagType, RunItemStatus } from '../types'

export type FlagDecision = 'CONFIRM' | 'DISMISS'
export type ItemDecision = 'APPROVED' | 'REJECTED'

export interface QueueFlag {
  flagId: number
  type: FlagType
  severity: FlagSeverity
  details: string | null
  createdAt: string
  shiftId: number
  shiftDate: string
  dayPart: DayPart
  userName: string
  outletName: string
  runItemId: number | null
  itemTitle: string | null
  photos: ChecklistPhoto[]
}

export interface QueueItem {
  runItemId: number
  title: string
  status: RunItemStatus
  comment: string | null
  doneAt: string | null
  shiftId: number
  shiftDate: string
  dayPart: DayPart
  userName: string
  outletName: string
  photos: ChecklistPhoto[]
}

export interface ReviewQueueData {
  items: QueueItem[]
  flags: QueueFlag[]
  openFlags: number
  awaitingItems: number
}

export interface ReviewSummary {
  openFlags: number
  awaitingItems: number
}