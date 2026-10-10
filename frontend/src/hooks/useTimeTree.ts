import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'
import type { TimeTreeResponse } from '../lib/types'

export function useTimeTree(jobId?: string, revision = 0) {
  const [data, setData] = useState<TimeTreeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!jobId) return
    const controller = new AbortController()
    const path = jobId === 'processed' ? '/api/processed-posts/time-tree' : `/api/posts/time-tree?job_id=${encodeURIComponent(jobId)}`
    apiGet<TimeTreeResponse>(path, controller.signal)
      .then(setData)
      .catch((reason) => { if (!controller.signal.aborted) setError((reason as Error).message) })
    return () => controller.abort()
  }, [jobId, revision])
  return { data, error }
}
