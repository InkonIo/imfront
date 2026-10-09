import { useCallback, useEffect, useState } from 'react'
import { schedApi } from './api'
import type { Caps } from './api'

/** Что можно показывать этому пользователю. Решение о доступе всё равно принимает сервер. */
export function useCaps(enabled: boolean, userId: number | string | undefined) {
  const [caps, setCaps] = useState<Caps | null>(null)
  const refresh = useCallback(async () => {
    try {
      setCaps(await schedApi.caps())
    } catch {
      setCaps({ role: '', canManageSchedule: false, pending: 0 })
    }
  }, [])
  useEffect(() => {
    if (!enabled) return
    void refresh()
    const t = setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 60_000)
    return () => clearInterval(t)
  }, [enabled, userId, refresh])
  return { caps, refresh }
}
