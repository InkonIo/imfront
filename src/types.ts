export type AccountRole = 'SUPER_ADMIN' | 'DIRECTOR' | 'MANAGER'
export type ShiftRole = 'INSIDE' | 'PRODUCTION_MANAGER' | 'SERVICE_MANAGER'
export type DayPart = 'MORNING' | 'EVENING'

export interface Outlet {
  id: number
  cityId: number
  cityName: string
  name: string
  address: string | null
  active: boolean
}

export interface User {
  id: number
  login: string
  fullName: string
  accountRole: AccountRole
  active: boolean
  mustChangePassword: boolean
  outlets: Outlet[]
}

export interface LoginResponse {
  token: string
  user: User
}

export interface Shift {
  id: number
  outletId: number
  outletName: string
  shiftRole: ShiftRole
  dayPart: DayPart
  shiftDate: string
  startedAt: string
  finishedAt: string | null
}

export interface StartShiftBody {
  outletId: number
  shiftRole: ShiftRole
  dayPart: DayPart
}

export const SHIFT_ROLE_LABEL: Record<ShiftRole, string> = {
  INSIDE: 'Инсайд',
  PRODUCTION_MANAGER: 'Менеджер производства',
  SERVICE_MANAGER: 'Менеджер обслуживания',
}

export const DAY_PART_LABEL: Record<DayPart, string> = {
  MORNING: 'Утро',
  EVENING: 'Вечер',
}

export interface City {
  id: number
  name: string
}

export interface CityBody {
  name: string
}

export interface OutletBody {
  cityId: number
  name: string
  address: string | null
  active: boolean
}

export interface CreateUserBody {
  login: string
  fullName: string
  accountRole: AccountRole
  outletIds: number[]
}

export interface UpdateUserBody {
  fullName?: string
  accountRole?: AccountRole
  active?: boolean
  outletIds?: number[]
}

export interface UserWithPassword {
  user: User
  temporaryPassword: string
}

export const ACCOUNT_ROLE_LABEL: Record<AccountRole, string> = {
  SUPER_ADMIN: 'Суперадмин',
  DIRECTOR: 'Директор',
  MANAGER: 'Менеджер',
}

export type PhotoMode = 'NONE' | 'REQUIRED' | 'ON_PROBLEM'
export type RunItemStatus = 'PENDING' | 'DONE' | 'PROBLEM' | 'SKIPPED'

export interface ChecklistPhoto {
  id: number
  url: string
  uploadedAt: string
}

export interface RunItem {
  id: number
  sectionOrder: number
  sectionTitle: string
  sortOrder: number
  title: string
  durationMin: number | null
  dueFrom: string | null
  dueTo: string | null
  photoMode: PhotoMode
  directorReview: boolean
  timed: boolean
  status: RunItemStatus
  comment: string | null
  startedAt: string | null
  doneAt: string | null
  reopenUntil: string | null
  photos: ChecklistPhoto[]
}

export interface Checklist {
  runId: number
  shiftId: number
  title: string
  total: number
  completed: number
  problems: number
  items: RunItem[]
}

export type AuditEventType =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGED'
  | 'SHIFT_STARTED'
  | 'SHIFT_FINISHED'
  | 'ITEM_STARTED'
  | 'ITEM_DONE'
  | 'ITEM_PROBLEM'
  | 'ITEM_SKIPPED'
  | 'ITEM_REOPENED'
  | 'PHOTO_UPLOADED'
  | 'PHOTO_DELETED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'USER_PASSWORD_RESET'
  | 'CATALOG_CHANGED'

export interface AuditEvent {
  id: number
  createdAt: string
  type: AuditEventType
  userId: number | null
  userLogin: string | null
  shiftId: number | null
  outletId: number | null
  entityType: string | null
  entityId: number | null
  details: string | null
  ip: string | null
  userAgent: string | null
  deviceId: string | null
}

export interface AuditPage {
  items: AuditEvent[]
  page: number
  size: number
  total: number
}

export interface AuditQuery {
  userId?: number
  shiftId?: number
  outletId?: number
  type?: AuditEventType
  from?: string
  to?: string
  page?: number
  size?: number
}

export const AUDIT_META: Record<AuditEventType, { icon: string; label: string; tone?: 'ok' | 'warn' | 'danger' }> = {
  LOGIN: { icon: '🔑', label: 'Вход', tone: 'ok' },
  LOGIN_FAILED: { icon: '🚫', label: 'Неудачный вход', tone: 'danger' },
  LOGOUT: { icon: '🚪', label: 'Выход' },
  PASSWORD_CHANGED: { icon: '🔐', label: 'Сменил пароль' },
  SHIFT_STARTED: { icon: '🟢', label: 'Начал смену', tone: 'ok' },
  SHIFT_FINISHED: { icon: '🏁', label: 'Завершил смену' },
  ITEM_STARTED: { icon: '▶️', label: 'Начал пункт' },
  ITEM_DONE: { icon: '✅', label: 'Закрыл пункт', tone: 'ok' },
  ITEM_PROBLEM: { icon: '⚠️', label: 'Проблема', tone: 'danger' },
  ITEM_SKIPPED: { icon: '⏭️', label: 'Пропустил', tone: 'warn' },
  ITEM_REOPENED: { icon: '↩️', label: 'Вернул пункт', tone: 'warn' },
  PHOTO_UPLOADED: { icon: '📸', label: 'Фото' },
  PHOTO_DELETED: { icon: '🗑️', label: 'Удалил фото', tone: 'warn' },
  USER_CREATED: { icon: '👤', label: 'Создал пользователя' },
  USER_UPDATED: { icon: '✏️', label: 'Изменил пользователя' },
  USER_DELETED: { icon: '❌', label: 'Удалил пользователя', tone: 'danger' },
  USER_PASSWORD_RESET: { icon: '🔑', label: 'Сбросил пароль', tone: 'warn' },
  CATALOG_CHANGED: { icon: '🏙️', label: 'Изменил справочник' },
}

export type ItemFlag = 'TOO_FAST' | 'SLOW' | 'LATE' | 'SKIPPED' | 'NOT_DONE'

export const FLAG_META: Record<ItemFlag, { icon: string; label: string; tone: 'danger' | 'warn' }> = {
  TOO_FAST: { icon: '⚡', label: 'досрочно', tone: 'danger' },
  SLOW: { icon: '🐢', label: 'дольше нормы', tone: 'warn' },
  LATE: { icon: '⏰', label: 'опоздание', tone: 'warn' },
  SKIPPED: { icon: '⏭️', label: 'пропущен', tone: 'warn' },
  NOT_DONE: { icon: '❌', label: 'не выполнен', tone: 'danger' },
}

export interface ShiftSummary {
  shiftId: number
  userId: number
  userName: string
  userLogin: string
  outletId: number
  outletName: string
  shiftRole: ShiftRole
  dayPart: DayPart
  shiftDate: string
  startedAt: string
  finishedAt: string | null
  total: number
  completed: number
  problems: number
  photos: number
  flagged: number
}

export interface ItemReport {
  id: number
  sectionOrder: number
  sectionTitle: string
  title: string
  status: RunItemStatus
  normMin: number | null
  actualMin: number | null
  dueFrom: string | null
  dueTo: string | null
  lateMin: number | null
  startedAt: string | null
  doneAt: string | null
  comment: string | null
  photoMode: PhotoMode
  directorReview: boolean
  flags: ItemFlag[]
  photos: ChecklistPhoto[]
}

export interface ShiftReport {
  shift: ShiftSummary
  items: ItemReport[]
}