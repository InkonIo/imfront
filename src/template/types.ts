import type { DayPart, PhotoMode, ShiftRole } from '../types'

export interface TemplateSummary {
  id: number
  shiftRole: ShiftRole
  dayPart: DayPart
  outletId: number | null
  outletName: string | null
  title: string
  active: boolean
  sections: number
  items: number
  editable: boolean
}

export interface TemplateItem {
  id: number
  sectionId: number
  title: string
  instructions: string | null
  sortOrder: number
  durationMin: number | null
  dueFrom: string | null
  dueTo: string | null
  photoMode: PhotoMode
  weekday: number | null
  directorReview: boolean
  active: boolean
}

export interface TemplateSection {
  id: number
  title: string
  sortOrder: number
  items: TemplateItem[]
}

export interface TemplateFull {
  summary: TemplateSummary
  sections: TemplateSection[]
}

export interface ItemBody {
  sectionId?: number
  title: string
  instructions: string | null
  durationMin: number | null
  dueFrom: string | null
  dueTo: string | null
  photoMode: PhotoMode
  weekday: number | null
  directorReview: boolean
  active: boolean
}

export interface CreateTemplateBody {
  shiftRole: ShiftRole
  dayPart: DayPart
  outletId: number | null
  title: string
  copyFromId: number | null
}

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']