import { request, send } from '../api'
import type { CreateTemplateBody, ItemBody, TemplateFull, TemplateSummary } from './types'

export const templateApi = {
  list: () => request<TemplateSummary[]>('/api/templates'),
  get: (id: number) => request<TemplateFull>(`/api/templates/${id}`),
  create: (body: CreateTemplateBody) => request<TemplateFull>('/api/templates', send('POST', body)),
  update: (id: number, body: { title: string; active: boolean }) =>
    request<TemplateFull>(`/api/templates/${id}`, send('PUT', body)),
  remove: (id: number) => request<void>(`/api/templates/${id}`, send('DELETE')),

  addSection: (id: number, title: string) =>
    request<TemplateFull>(`/api/templates/${id}/sections`, send('POST', { title })),
  renameSection: (sectionId: number, title: string) =>
    request<TemplateFull>(`/api/templates/sections/${sectionId}`, send('PUT', { title })),
  deleteSection: (sectionId: number) =>
    request<TemplateFull>(`/api/templates/sections/${sectionId}`, send('DELETE')),
  orderSections: (id: number, ids: number[]) =>
    request<TemplateFull>(`/api/templates/${id}/sections/order`, send('PUT', { ids })),

  addItem: (sectionId: number, body: ItemBody) =>
    request<TemplateFull>(`/api/templates/sections/${sectionId}/items`, send('POST', body)),
  updateItem: (itemId: number, body: ItemBody) =>
    request<TemplateFull>(`/api/templates/items/${itemId}`, send('PUT', body)),
  deleteItem: (itemId: number) => request<TemplateFull>(`/api/templates/items/${itemId}`, send('DELETE')),
  orderItems: (sectionId: number, ids: number[]) =>
    request<TemplateFull>(`/api/templates/sections/${sectionId}/items/order`, send('PUT', { ids })),
}