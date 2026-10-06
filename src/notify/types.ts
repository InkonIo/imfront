export type NotificationType = 'VIOLATION' | 'ITEM_REJECTED' | 'ITEM_APPROVED' | 'SCHEDULE'

export interface AppNotification {
  id: number
  type: NotificationType
  title: string
  body: string | null
  shiftId: number | null
  runItemId: number | null
  flagId: number | null
  createdAt: string
  readAt: string | null
}

export interface NotificationList {
  items: AppNotification[]
  unread: number
}