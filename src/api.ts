import type {
    ShiftReport,
    ShiftSummary,
  AuditPage,
  AuditQuery,
  Checklist,
  City,
  CityBody,
  CreateUserBody,
  LoginResponse,
  Outlet,
  OutletBody,
  RunItemStatus,
  Shift,
  StartShiftBody,
  UpdateUserBody,
  User,
  UserWithPassword,
} from './types'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'
const TOKEN_KEY = 'im_token'
const DEVICE_KEY = 'im_device'

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

/** Постоянный ID этого браузера/телефона, чтобы в аудите было видно, с какого устройства действие. */
function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (!(init.body instanceof FormData)) headers['Content-Type'] = 'application/json'
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  headers['X-Device-Id'] = deviceId()

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, 'Нет связи с сервером')
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { error: text }
  }

  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized()
    const message = (data as { error?: string } | null)?.error || `Ошибка ${res.status}`
    throw new ApiError(res.status, message)
  }
  return data as T
}

export const send = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
})

export const api = {
  // ---------- auth ----------
  login: (login: string, password: string) =>
    request<LoginResponse>('/api/auth/login', send('POST', { login, password })),
  logout: () => request<void>('/api/auth/logout', send('POST')),
  me: () => request<User>('/api/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    request<void>('/api/auth/change-password', send('POST', { oldPassword, newPassword })),

  // ---------- shifts ----------
  currentShift: () => request<Shift | undefined>('/api/shifts/current'),
  startShift: (body: StartShiftBody) => request<Shift>('/api/shifts/start', send('POST', body)),
  finishShift: () => request<Shift>('/api/shifts/finish', send('POST')),
  ping: () => request<void>('/api/activity/ping', send('POST')),

  // ---------- checklist ----------
  checklistCurrent: () => request<Checklist | undefined>('/api/checklist/current'),
  startRunItem: (id: number) => request<Checklist>(`/api/checklist/items/${id}/start`, send('POST')),
  updateRunItem: (id: number, status: RunItemStatus, comment?: string) =>
    request<Checklist>(`/api/checklist/items/${id}`, send('PUT', { status, comment: comment ?? null })),
    uploadPhoto: (id: number, file: Blob, fileName: string, takenAt?: number) => {
    const body = new FormData()
    body.append('file', file, fileName)
    if (takenAt !== undefined) body.append('takenAt', String(Math.round(takenAt)))
    return request<Checklist>(`/api/checklist/items/${id}/photos`, { method: 'POST', body })
  },
  deletePhoto: (photoId: number) => request<Checklist>(`/api/checklist/photos/${photoId}`, send('DELETE')),

    // ---------- audit ----------
  auditEvents: (q: AuditQuery) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(q)) {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
    }
    return request<AuditPage>(`/api/audit/events?${params}`)
  },
    auditShifts: (date: string) => request<ShiftSummary[]>(`/api/audit/shifts?date=${date}`),
  auditShift: (id: number) => request<ShiftReport>(`/api/audit/shifts/${id}`),

  // ---------- admin: cities ----------
  adminCities: () => request<City[]>('/api/admin/cities'),
  createCity: (body: CityBody) => request<City>('/api/admin/cities', send('POST', body)),
  updateCity: (id: number, body: CityBody) => request<City>(`/api/admin/cities/${id}`, send('PUT', body)),
  deleteCity: (id: number) => request<void>(`/api/admin/cities/${id}`, send('DELETE')),

  // ---------- admin: outlets ----------
  adminOutlets: () => request<Outlet[]>('/api/admin/outlets'),
  createOutlet: (body: OutletBody) => request<Outlet>('/api/admin/outlets', send('POST', body)),
  updateOutlet: (id: number, body: OutletBody) =>
    request<Outlet>(`/api/admin/outlets/${id}`, send('PUT', body)),
  deleteOutlet: (id: number) => request<void>(`/api/admin/outlets/${id}`, send('DELETE')),

  // ---------- admin: users ----------
  adminUsers: () => request<User[]>('/api/admin/users'),
  createUser: (body: CreateUserBody) =>
    request<UserWithPassword>('/api/admin/users', send('POST', body)),
  updateUser: (id: number, body: UpdateUserBody) =>
    request<User>(`/api/admin/users/${id}`, send('PUT', body)),
  resetPassword: (id: number) =>
    request<UserWithPassword>(`/api/admin/users/${id}/reset-password`, send('POST')),
  deleteUser: (id: number) => request<void>(`/api/admin/users/${id}`, send('DELETE')),
}

/** Фото отдаются только с токеном, поэтому грузим blob и делаем object URL. */
export async function fetchPhotoUrl(path: string): Promise<string> {
  const token = tokenStore.get()
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Device-Id': deviceId(),
    },
  })
  if (!res.ok) throw new ApiError(res.status, 'Не удалось загрузить фото')
  return URL.createObjectURL(await res.blob())
}