export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

let sessionReady: Promise<void> | undefined
function ensureLocalSession(): Promise<void> {
  if (sessionReady) return sessionReady
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  const token = fragment.get('local_session')
  if (!token) return Promise.resolve()
  sessionReady = fetch('/api/session', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    .then(response => {
      if (!response.ok) throw new ApiError('本地身份验证失败，请重新打开App', response.status)
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }).catch(error => { sessionReady = undefined; throw error })
  return sessionReady
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  await ensureLocalSession()
  const response = await fetch(path, { signal })
  return parseResponse<T>(response)
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  await ensureLocalSession()
  const response = await fetch(path, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return parseResponse<T>(response)
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  await ensureLocalSession()
  const response = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseResponse<T>(response)
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new ApiError(payload.detail || '请求失败，请稍后再试', response.status)
  }
  return response.json() as Promise<T>
}
