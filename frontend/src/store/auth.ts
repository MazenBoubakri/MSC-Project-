import { create } from 'zustand'
import { api, getToken, setToken, API_BASE } from '../lib/api'
import type { MeUser } from '../lib/types'

interface AuthState {
  user: MeUser | null
  ready: boolean
  init: () => Promise<void>
  register: (input: {
    username: string
    fullName: string
    password: string
    avatarColor?: string
    avatarUrl?: string
  }) => Promise<void>
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  updateProfile: (patch: {
    fullName?: string
    username?: string
    avatarColor?: string
    bio?: string
    status?: string
  }) => Promise<void>
  uploadAvatar: (file: File) => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,

  init: async () => {
    if (!getToken()) {
      set({ ready: true })
      return
    }
    try {
      const res = await api<{ user: MeUser }>('/auth/me')
      set({ user: res.user, ready: true })
    } catch {
      setToken(null)
      set({ user: null, ready: true })
    }
  },

  register: async ({ username, fullName, password, avatarColor, avatarUrl }) => {
    const res = await api<{ token: string; user: MeUser }>('/auth/register', {
      method: 'POST',
      body: { username, fullName, password, avatarColor, avatarUrl },
      token: null,
    })
    setToken(res.token)
    set({ user: res.user, ready: true })
  },

  login: async (username, password) => {
    const res = await api<{ token: string; user: MeUser }>('/auth/login', {
      method: 'POST',
      body: { username, password },
      token: null,
    })
    setToken(res.token)
    set({ user: res.user, ready: true })
  },

  logout: () => {
    // Best-effort server-side logout (JWT is stateless; token is cleared
    // locally regardless of the response).
    void api('/auth/logout', { method: 'POST' }).catch(() => {})
    setToken(null)
    set({ user: null })
  },

  updateProfile: async (patch) => {
    const res = await api<{ user: MeUser }>('/auth/me', { method: 'PATCH', body: patch })
    set({ user: res.user })
  },

  uploadAvatar: async (file) => {
    const form = new FormData()
    form.append('avatar', file)
    const res = await fetch(`${API_BASE}/auth/me/avatar`, {
      method: 'POST',
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : undefined,
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
      throw new Error(message)
    }
    const json = await res.json()
    set({ user: json.user })
  },
}))
