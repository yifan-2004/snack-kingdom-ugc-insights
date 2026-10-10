import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet } from '../lib/api'

interface StatusRecord { status: string }

export function usePollingJobs<T extends StatusRecord>(path: string) {
  const [jobs, setJobs] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)
  const refresh = useCallback(async () => {
    try {
      const next = await apiGet<T[]>(path)
      if (mounted.current) { setJobs(next); setError(null) }
      return next
    } catch (reason) {
      if (mounted.current) setError((reason as Error).message)
      return []
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [path])
  useEffect(() => {
    mounted.current = true
    void refresh()
    return () => { mounted.current = false }
  }, [refresh])
  useEffect(() => {
    if (!jobs.some((job) => job.status === 'pending' || job.status === 'running')) return
    const timer = window.setInterval(() => { void refresh() }, 2000)
    return () => window.clearInterval(timer)
  }, [jobs, refresh])
  return { jobs, loading, error, refresh }
}
