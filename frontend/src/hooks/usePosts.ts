import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'
import type { Platform, PostListResponse, Sentiment } from '../lib/types'

export interface PostFilters {
  platform: Platform | ''
  sentiment: Sentiment | ''
  query: string
  start_date: string
  end_date: string
}

export function usePosts(jobId: string | undefined, filters: PostFilters, revision = 0) {
  const [data, setData] = useState<PostListResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!jobId) return
    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      const processed = jobId === 'processed'
      const params = new URLSearchParams()
      if (!processed) params.set('job_id', jobId)
      if (filters.platform) params.set('platform', filters.platform)
      if (filters.sentiment) params.set('sentiment', filters.sentiment)
      if (filters.query.trim()) params.set('query', filters.query.trim())
      if (filters.start_date) params.set('start_date', filters.start_date)
      if (filters.end_date) params.set('end_date', filters.end_date)
      try {
        setData(await apiGet<PostListResponse>(`${processed ? '/api/processed-posts' : '/api/posts'}?${params}`, controller.signal))
      } catch (reason) {
        if (!controller.signal.aborted) setError((reason as Error).message)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, filters.query ? 280 : 0)
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [jobId, filters.platform, filters.sentiment, filters.query, filters.start_date, filters.end_date, revision])

  return { data, loading, error }
}
