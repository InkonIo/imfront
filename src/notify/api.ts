import { request, send } from '../api'
import type { NotificationList } from './types'

export const notifyApi = {
  list: () => request<NotificationList>('/api/notifications'),
  unread: () => request<{ unread: number }>('/api/notifications/unread'),
  readAll: () => request<{ unread: number }>('/api/notifications/read-all', send('POST')),
}