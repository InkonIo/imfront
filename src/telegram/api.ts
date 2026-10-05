import { request, send } from '../api'

export interface TgStatus {
  botReady: boolean
  linked: boolean
  username: string | null
  botUsername: string | null
}

export const telegramApi = {
  status: () => request<TgStatus>('/api/telegram/status'),
  link: () => request<{ url: string; expiresAt: string }>('/api/telegram/link', send('POST')),
  unlink: () => request<void>('/api/telegram/link', send('DELETE')),
}