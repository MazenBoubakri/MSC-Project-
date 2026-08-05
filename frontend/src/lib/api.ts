// Thin fetch wrapper. Bearer token from localStorage; throws ApiError with the
// backend's `{ error: string }` message for inline display.

const TOKEN_KEY = 'mazentalk.token'

// Same-origin by default (Vite proxy in dev, backend static serving in prod).
// Override with VITE_API_URL in frontend/.env.
export const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '/api').replace(/\/+$/, '')

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  token?: string | null
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const authToken = token === undefined ? getToken() : token
  if (authToken) headers.Authorization = `Bearer ${authToken}`

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const data = await res.json()
      if (typeof data?.error === 'string') message = data.error
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, message)
  }

  return res.json() as Promise<T>
}

export async function uploadFile(file: File, field = 'file'): Promise<{ url: string }> {
  const form = new FormData()
  form.append(field, file)
  const token = getToken()
  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  })
  if (!res.ok) {
    let message = 'Upload failed'
    try {
      const data = await res.json()
      if (typeof data?.error === 'string') message = data.error
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message)
  }
  return res.json()
}
