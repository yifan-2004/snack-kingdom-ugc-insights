import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'
import type { DatabaseStats } from '../lib/types'

export function useDbStats(active: boolean, revision = 0) {
  const [data, setData] = useState<DatabaseStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    setError(null)
    apiGet<DatabaseStats>('/api/admin/db-stats', controller.signal)
      .then(setData)
      .catch((reason) => { if (!controller.signal.aborted) setError((reason as Error).message) })
    return () => controller.abort()
  }, [active, revision])

  return { data, error }
}
