import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, apiGet } from '../lib/api'
import type { Overview } from '../lib/types'

export function useOverview() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)

  const refresh = useCallback(async () => {
    if (pending.current) return
    pending.current = true
    setError(null)
    try {
      setData(await apiGet<Overview>('/api/overview/latest'))
    } catch (reason) {
      setError(reason instanceof ApiError && reason.status === 404 ? null : (reason as Error).message)
    } finally {
      setLoading(false)
      pending.current = false
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { if (!document.hidden) void refresh() }, 15000)
    const focus = () => { if (!document.hidden) void refresh() }
    window.addEventListener('focus', focus)
    window.addEventListener('workbench-data-changed', focus)
    document.addEventListener('visibilitychange', focus)
    return () => { clearInterval(timer); window.removeEventListener('focus', focus); window.removeEventListener('workbench-data-changed', focus); document.removeEventListener('visibilitychange', focus) }
  }, [refresh])

  return { data, loading, error, refresh }
}
