import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/** Рендерит содержимое прямо в <body>, вне любых родительских слоёв (sticky, transform, overflow). */
export default function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}