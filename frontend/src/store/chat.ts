import { create } from 'zustand'
import { api, uploadFile } from '../lib/api'
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket'
import { playMessageSound } from '../lib/sound'
import { notifyMessage } from '../lib/notify'
import { useAuth } from './auth'
import type {
  ConversationListItem,
  FriendsPayload,
  FriendRequestDTO,
  Message,
  NotifMessage,
  PublicUser,
  Room,
  RoomDetail,
  SearchResult,
  Story,
  StoryGroup,
  UserProfile,
} from '../lib/types'

let listenersAttached = false

export interface ClientMessage extends Message {
  pending?: boolean
  failed?: boolean
  /** reason the send failed, e.g. "Message blocked" */
  error?: string
}

/** A message target: a direct conversation OR a chat room. */
export type MessageTarget = { conversationId?: string; roomId?: string }

function targetKey(t: MessageTarget): string {
  return t.conversationId ?? t.roomId ?? ''
}

export interface Toast {
  id: string
  title: string
  body?: string
  kind: 'message' | 'friend' | 'system'
  payload?: { conversationId?: string; userId?: string }
}

interface ChatState {
  ready: boolean
  socketReady: boolean
  meId: string
  conversations: ConversationListItem[]
  rooms: Room[]
  messages: Record<string, ClientMessage[]>
  hasMore: Record<string, boolean>
  loadingMessages: Record<string, boolean>
  online: Record<string, boolean>
  lastSeen: Record<string, string | null>
  typing: Record<string, string[]>
  friends: PublicUser[]
  friendsTotal: number
  friendsOnline: number
  incoming: FriendRequestDTO[]
  stories: StoryGroup[]
  toasts: Toast[]
  peers: Record<string, PublicUser>

  initSocket: () => void
  destroySocket: () => void
  reset: () => void

  loadConversations: () => Promise<void>
  openConversation: (peerId: string) => Promise<string | null>
  openConversationById: (conversationId: string) => Promise<void>
  loadMore: (conversationId: string) => Promise<void>

  loadRooms: () => Promise<void>
  createRoom: (name: string, description: string, avatarColor?: string) => Promise<Room | null>
  updateRoom: (
    roomId: string,
    patch: { name?: string; description?: string; avatarColor?: string }
  ) => Promise<void>
  joinRoom: (roomId: string) => Promise<void>
  leaveRoom: (roomId: string) => Promise<void>
  deleteRoom: (roomId: string) => Promise<void>
  getRoomDetail: (roomId: string) => Promise<RoomDetail>
  openRoom: (roomId: string) => Promise<void>
  loadMoreRoom: (roomId: string) => Promise<void>

  sendText: (target: MessageTarget, body: string, replyToId?: string) => Promise<void>
  sendImage: (target: MessageTarget, file: File, replyToId?: string) => Promise<void>
  sendVoice: (target: MessageTarget, blob: Blob, durationSec: number, replyToId?: string) => Promise<void>
  retryMessage: (target: MessageTarget, messageId: string) => Promise<void>
  editMessage: (target: MessageTarget, messageId: string, body: string) => Promise<boolean>
  deleteMessage: (target: MessageTarget, messageId: string) => Promise<boolean>
  searchMessages: (conversationId: string, q: string) => Promise<Message[]>
  toggleReaction: (target: MessageTarget, messageId: string, emoji: string) => void
  markRead: (target: MessageTarget, upToMessageId?: string) => void
  setTyping: (target: MessageTarget, isTyping: boolean) => void

  emitSend: (
    target: MessageTarget,
    payload: Record<string, unknown>,
    tempId: string
  ) => Promise<{ ok: boolean; message?: Message; error?: string }>
  appendMessage: (target: MessageTarget, message: ClientMessage) => void
  settleMessage: (
    target: MessageTarget,
    tempId: string,
    ack: { ok: boolean; message?: Message; error?: string }
  ) => void

  searchUsers: (q: string) => Promise<PublicUser[]>
  getUserProfile: (id: string) => Promise<UserProfile>
  sendFriendRequest: (userId: string) => Promise<void>
  acceptRequest: (requestId: string) => Promise<void>
  declineRequest: (requestId: string) => Promise<void>
  removeFriend: (userId: string) => Promise<void>
  blockUser: (userId: string) => Promise<void>
  unblockUser: (userId: string) => Promise<void>
  loadFriends: () => Promise<void>

  loadStories: () => Promise<void>
  createStory: (mediaUrl: string, caption: string) => Promise<Story | null>
  deleteStory: (storyId: string) => Promise<void>
  markStorySeen: (storyId: string) => void

  pushToast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
}

function sortByActivity(a: ConversationListItem, b: ConversationListItem) {
  return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
}

function sortRooms(a: Room, b: Room) {
  const at = (r: Room) => new Date(r.lastMessageAt ?? r.createdAt).getTime()
  return at(b) - at(a)
}

function meId(): string {
  return useAuth.getState().user?.id ?? ''
}

export const useChat = create<ChatState>((set, get) => ({
  ready: false,
  socketReady: false,
  meId: '',
  conversations: [],
  rooms: [],
  messages: {},
  hasMore: {},
  loadingMessages: {},
  online: {},
  lastSeen: {},
  typing: {},
  friends: [],
  friendsTotal: 0,
  friendsOnline: 0,
  incoming: [],
  stories: [],
  toasts: [],
  peers: {},

  reset: () =>
    set({
      ready: false,
      socketReady: false,
      meId: '',
      conversations: [],
      rooms: [],
      messages: {},
      hasMore: {},
      loadingMessages: {},
      online: {},
      lastSeen: {},
      typing: {},
      friends: [],
      friendsTotal: 0,
      friendsOnline: 0,
      incoming: [],
      stories: [],
      toasts: [],
      peers: {},
    }),

  pushToast: (t) => set((s) => ({ toasts: [...s.toasts, { ...t, id: crypto.randomUUID() }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  loadConversations: async () => {
    const res = await api<{ conversations: ConversationListItem[] }>('/conversations')
    const conversations = res.conversations.sort(sortByActivity)
    const peers: Record<string, PublicUser> = { ...get().peers }
    for (const c of conversations) peers[c.peer.id] = c.peer
    set({ conversations, peers, ready: true })
  },

  openConversation: async (peerId) => {
    const res = await api<{ conversation: ConversationListItem }>('/conversations', {
      method: 'POST',
      body: { userId: peerId },
    })
    const convo = res.conversation
    const socket = getSocket()
    socket?.emit('conversation:join', { conversationId: convo.id })

    set((s) => {
      const existing = s.conversations.find((c) => c.id === convo.id)
      return {
        conversations: existing ? s.conversations : [convo, ...s.conversations],
        peers: { ...s.peers, [peerId]: { ...convo.peer, online: s.online[peerId] ?? convo.peer.online } },
      }
    })

    const got = get().messages[convo.id]
    if (!got || got.length === 0) {
      set((s) => ({ loadingMessages: { ...s.loadingMessages, [convo.id]: true } }))
      try {
        const page = await api<{ messages: Message[]; hasMore: boolean }>(
          `/conversations/${convo.id}/messages?limit=30`
        )
        set((s) => ({
          messages: { ...s.messages, [convo.id]: page.messages.map((m) => ({ ...m })) },
          hasMore: { ...s.hasMore, [convo.id]: page.hasMore },
        }))
      } finally {
        set((s) => ({ loadingMessages: { ...s.loadingMessages, [convo.id]: false } }))
      }
    }

    // clear unread + send read receipt
    const unread = get().conversations.find((c) => c.id === convo.id)?.unread ?? 0
    if (unread > 0) {
      set((s) => ({
        conversations: s.conversations.map((c) => (c.id === convo.id ? { ...c, unread: 0 } : c)),
      }))
    }
    const msgs = get().messages[convo.id]
    const lastIncoming = [...msgs].reverse().find((m) => m.senderId !== meId())
    if (lastIncoming && !lastIncoming.readBy.includes(meId())) {
      get().markRead({ conversationId: convo.id }, lastIncoming.id)
    }
    return convo.id
  },

  openConversationById: async (conversationId) => {
    let convo = get().conversations.find((c) => c.id === conversationId)
    if (!convo) {
      await get().loadConversations()
      convo = get().conversations.find((c) => c.id === conversationId)
    }
    if (!convo) return

    getSocket()?.emit('conversation:join', { conversationId })

    if (!get().messages[conversationId]) {
      set((s) => ({ loadingMessages: { ...s.loadingMessages, [conversationId]: true } }))
      try {
        const page = await api<{ messages: Message[]; hasMore: boolean }>(
          `/conversations/${conversationId}/messages?limit=30`
        )
        set((s) => ({
          messages: { ...s.messages, [conversationId]: page.messages.map((m) => ({ ...m })) },
          hasMore: { ...s.hasMore, [conversationId]: page.hasMore },
        }))
      } finally {
        set((s) => ({ loadingMessages: { ...s.loadingMessages, [conversationId]: false } }))
      }
    }

    if (convo.unread > 0) {
      set((s) => ({
        conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)),
      }))
    }
    const msgs = get().messages[conversationId]
    const lastIncoming = [...(msgs ?? [])].reverse().find((m) => m.senderId !== meId())
    if (lastIncoming && !lastIncoming.readBy.includes(meId())) {
      get().markRead({ conversationId }, lastIncoming.id)
    }
  },

  loadRooms: async () => {
    const res = await api<{ rooms: Room[] }>('/rooms')
    set({ rooms: res.rooms.sort(sortRooms) })
  },

  createRoom: async (name, description, avatarColor) => {
    const res = await api<{ room: Room }>('/rooms', { method: 'POST', body: { name, description, avatarColor } })
    const room = res.room
    set((s) => {
      const exists = s.rooms.some((r) => r.id === room.id)
      return { rooms: exists ? s.rooms : [room, ...s.rooms].sort(sortRooms) }
    })
    getSocket()?.emit('room:join', { roomId: room.id })
    return room
  },

  updateRoom: async (roomId, patch) => {
    const res = await api<{ room: Room }>(`/rooms/${roomId}`, { method: 'PATCH', body: patch })
    const room = res.room
    set((s) => ({
      rooms: s.rooms.map((r) => (r.id === roomId ? room : r)).sort(sortRooms),
    }))
  },

  joinRoom: async (roomId) => {
    const res = await api<{ room: Room }>(`/rooms/${roomId}/join`, { method: 'POST' })
    set((s) => ({
      rooms: s.rooms.map((r) => (r.id === roomId ? res.room : r)),
    }))
    getSocket()?.emit('room:join', { roomId })
  },

  leaveRoom: async (roomId) => {
    const res = await api<{ room?: Room; deleted?: boolean }>(`/rooms/${roomId}/leave`, { method: 'POST' })
    getSocket()?.emit('room:leave', { roomId })
    set((s) => {
      if (res.deleted) {
        const { [roomId]: _removed, ...rest } = s.messages
        return { rooms: s.rooms.filter((r) => r.id !== roomId), messages: rest, hasMore: { ...s.hasMore, [roomId]: false } }
      }
      return {
        rooms: s.rooms.map((r) => (r.id === roomId && res.room ? res.room : r)),
      }
    })
  },

  deleteRoom: async (roomId) => {
    await api(`/rooms/${roomId}`, { method: 'DELETE' })
    set((s) => {
      const { [roomId]: _removed, ...rest } = s.messages
      return { rooms: s.rooms.filter((r) => r.id !== roomId), messages: rest, hasMore: { ...s.hasMore, [roomId]: false } }
    })
  },

  getRoomDetail: async (roomId) => {
    const res = await api<{ room: RoomDetail }>(`/rooms/${roomId}`)
    return res.room
  },

  openRoom: async (roomId) => {
    getSocket()?.emit('room:join', { roomId })

    if (!get().messages[roomId]) {
      set((s) => ({ loadingMessages: { ...s.loadingMessages, [roomId]: true } }))
      try {
        const page = await api<{ messages: Message[]; hasMore: boolean }>(
          `/rooms/${roomId}/messages?limit=30`
        )
        set((s) => ({
          messages: { ...s.messages, [roomId]: page.messages.map((m) => ({ ...m })) },
          hasMore: { ...s.hasMore, [roomId]: page.hasMore },
        }))
      } finally {
        set((s) => ({ loadingMessages: { ...s.loadingMessages, [roomId]: false } }))
      }
    }

    const room = get().rooms.find((r) => r.id === roomId)
    if (room && room.unread > 0) {
      set((s) => ({ rooms: s.rooms.map((r) => (r.id === roomId ? { ...r, unread: 0 } : r)) }))
    }
    const msgs = get().messages[roomId]
    const lastIncoming = [...(msgs ?? [])].reverse().find((m) => m.senderId !== meId())
    if (lastIncoming && !lastIncoming.readBy.includes(meId())) {
      get().markRead({ roomId }, lastIncoming.id)
    }
  },

  loadMoreRoom: async (roomId) => {
    const { hasMore, loadingMessages, messages } = get()
    if (!hasMore[roomId] || loadingMessages[roomId]) return
    const list = messages[roomId] ?? []
    const oldest = list.find((m) => !m.pending)
    if (!oldest) return

    set((s) => ({ loadingMessages: { ...s.loadingMessages, [roomId]: true } }))
    try {
      const page = await api<{ messages: Message[]; hasMore: boolean }>(
        `/rooms/${roomId}/messages?limit=30&before=${oldest.id}`
      )
      set((s) => ({
        messages: { ...s.messages, [roomId]: [...page.messages, ...list] },
        hasMore: { ...s.hasMore, [roomId]: page.hasMore },
      }))
    } finally {
      set((s) => ({ loadingMessages: { ...s.loadingMessages, [roomId]: false } }))
    }
  },

  loadMore: async (conversationId) => {
    const { hasMore, loadingMessages, messages } = get()
    if (!hasMore[conversationId] || loadingMessages[conversationId]) return
    const list = messages[conversationId] ?? []
    const oldest = list.find((m) => !m.pending)
    if (!oldest) return

    set((s) => ({ loadingMessages: { ...s.loadingMessages, [conversationId]: true } }))
    try {
      const page = await api<{ messages: Message[]; hasMore: boolean }>(
        `/conversations/${conversationId}/messages?limit=30&before=${oldest.id}`
      )
      set((s) => ({
        messages: { ...s.messages, [conversationId]: [...page.messages, ...list] },
        hasMore: { ...s.hasMore, [conversationId]: page.hasMore },
      }))
    } finally {
      set((s) => ({ loadingMessages: { ...s.loadingMessages, [conversationId]: false } }))
    }
  },

  emitSend: (target, payload, tempId) => {
    return new Promise<{ ok: boolean; message?: Message; error?: string }>((resolve) => {
      const socket = getSocket()
      if (!socket) return resolve({ ok: false, error: 'Socket disconnected' })
      const targetPayload = target.conversationId ? { conversationId: target.conversationId } : { roomId: target.roomId }
      socket.emit('message:send', { ...targetPayload, ...payload, tempId }, (ack: unknown) => {
        const result = (ack as { ok?: boolean; message?: Message; error?: string } | null) ?? {}
        resolve({ ok: result.ok === true, ...result })
      })
    })
  },

  sendText: async (target, body, replyToId) => {
    const text = body.trim()
    if (!text) return
    const tempId = crypto.randomUUID()
    const me = meId()
    const now = new Date().toISOString()
    const temp: ClientMessage = {
      id: tempId,
      conversationId: target.conversationId ?? null,
      roomId: target.roomId ?? null,
      senderId: me,
      type: 'text',
      body: text,
      mediaUrl: null,
      duration: null,
      reactions: [],
      readBy: [],
      createdAt: now,
      pending: true,
      tempId,
      // optimistic row never carries the snapshot; the ack replaces it
      replyTo: null,
    }
    get().appendMessage(target, temp)
    const ack = await get().emitSend(target, { type: 'text', body: text, ...(replyToId ? { replyToId } : {}) }, tempId)
    get().settleMessage(target, tempId, ack)
  },

  sendImage: async (target, file, replyToId) => {
    const tempId = crypto.randomUUID()
    const me = meId()
    const now = new Date().toISOString()
    const temp: ClientMessage = {
      id: tempId,
      conversationId: target.conversationId ?? null,
      roomId: target.roomId ?? null,
      senderId: me,
      type: 'image',
      body: '',
      mediaUrl: null,
      duration: null,
      reactions: [],
      readBy: [],
      createdAt: now,
      pending: true,
      tempId,
      replyTo: null,
    }
    get().appendMessage(target, temp)
    try {
      const { url } = await uploadFile(file)
      const ack = await get().emitSend(
        target,
        { type: 'image', mediaUrl: url, ...(replyToId ? { replyToId } : {}) },
        tempId
      )
      get().settleMessage(target, tempId, ack)
    } catch (err) {
      get().settleMessage(target, tempId, {
        ok: false,
        error: err instanceof Error ? err.message : 'Upload failed',
      })
    }
  },

  sendVoice: async (target, blob, durationSec, replyToId) => {
    const tempId = crypto.randomUUID()
    const me = meId()
    const now = new Date().toISOString()
    const temp: ClientMessage = {
      id: tempId,
      conversationId: target.conversationId ?? null,
      roomId: target.roomId ?? null,
      senderId: me,
      type: 'voice',
      body: '',
      mediaUrl: null,
      duration: Math.round(durationSec),
      reactions: [],
      readBy: [],
      createdAt: now,
      pending: true,
      tempId,
      replyTo: null,
    }
    get().appendMessage(target, temp)
    try {
      const file = new File([blob], 'voice.webm', { type: blob.type || 'audio/webm' })
      const { url } = await uploadFile(file)
      const ack = await get().emitSend(
        target,
        { type: 'voice', mediaUrl: url, duration: Math.round(durationSec), ...(replyToId ? { replyToId } : {}) },
        tempId
      )
      get().settleMessage(target, tempId, ack)
    } catch (err) {
      get().settleMessage(target, tempId, {
        ok: false,
        error: err instanceof Error ? err.message : 'Upload failed',
      })
    }
  },

  retryMessage: async (target, messageId) => {
    const key = targetKey(target)
    const list = get().messages[key] ?? []
    const msg = list.find((m) => m.id === messageId)
    if (!msg) return
    set((s) => ({
      messages: {
        ...s.messages,
        [key]: list.map((m) => (m.id === messageId ? { ...m, pending: true, failed: false } : m)),
      },
    }))
    const payload =
      msg.type === 'text'
        ? { type: 'text', body: msg.body ?? '' }
        : { type: msg.type, mediaUrl: msg.mediaUrl, duration: msg.duration }
    const ack = await get().emitSend(target, payload, messageId)
    get().settleMessage(target, messageId, ack)
  },

  editMessage: async (target, messageId, body) => {
    const key = targetKey(target)
    const text = body.trim()
    if (!text) return false
    const socket = getSocket()
    const ok = await new Promise<boolean>((resolve) => {
      const payload = target.conversationId
        ? { conversationId: target.conversationId, messageId, body: text }
        : { roomId: target.roomId, messageId, body: text }
      socket?.emit('message:edit', payload, (r: { ok?: boolean } | null) => {
        resolve(r?.ok === true)
      })
    })
    if (!ok) return false
    set((s) => ({
      messages: {
        ...s.messages,
        [key]: (s.messages[key] ?? []).map((m) =>
          m.id === messageId ? { ...m, body: text, editedAt: new Date().toISOString() } : m
        ),
      },
    }))
    return true
  },

  deleteMessage: async (target, messageId) => {
    const key = targetKey(target)
    const socket = getSocket()
    const ok = await new Promise<boolean>((resolve) => {
      const payload = target.conversationId
        ? { conversationId: target.conversationId, messageId }
        : { roomId: target.roomId, messageId }
      socket?.emit('message:delete', payload, (r: { ok?: boolean } | null) => {
        resolve(r?.ok === true)
      })
    })
    if (!ok) return false
    set((s) => ({
      messages: {
        ...s.messages,
        [key]: (s.messages[key] ?? []).map((m) =>
          m.id === messageId ? { ...m, deleted: true, body: null, mediaUrl: null, reactions: [] } : m
        ),
      },
    }))
    return true
  },

  searchMessages: async (conversationId, q) => {
    const term = q.trim()
    if (term.length < 2) return []
    const res = await api<{ messages: Message[] }>(
      `/conversations/${conversationId}/messages/search?q=${encodeURIComponent(term)}`
    )
    return res.messages
  },

  appendMessage: (target, message) => {
    const key = targetKey(target)
    set((s) => {
      const list = s.messages[key] ?? []
      if (list.some((m) => m.id === message.id)) return {}
      const now = new Date().toISOString()
      return {
        messages: { ...s.messages, [key]: [...list, message] },
        conversations: s.conversations
          .map((c) =>
            c.id === key
              ? {
                  ...c,
                  lastMessageAt: now,
                  lastMessagePreview: previewFor(message),
                  lastMessageType: message.type,
                }
              : c
          )
          .sort(sortByActivity),
      }
    })
  },

  settleMessage: (target, tempId, ack) => {
    const key = targetKey(target)
    set((s) => {
      const list = s.messages[key] ?? []
      return {
        messages: {
          ...s.messages,
          [key]: list.map((m) => {
            if (m.id !== tempId) return m
            if (ack.ok && ack.message) return { ...ack.message, tempId }
            return { ...m, pending: false, failed: true, error: ack.error }
          }),
        },
      }
    })
  },

  toggleReaction: (target, messageId, emoji) => {
    const key = targetKey(target)
    const socket = getSocket()
    const payload = target.conversationId
      ? { conversationId: target.conversationId, messageId, emoji }
      : { roomId: target.roomId, messageId, emoji }
    socket?.emit('message:react', payload)
    // optimistic
    set((s) => {
      const list = s.messages[key] ?? []
      const me = meId()
      return {
        messages: {
          ...s.messages,
          [key]: list.map((m) => {
            if (m.id !== messageId) return m
            const existing = m.reactions.find((r) => r.user === me && r.emoji === emoji)
            const reactions = existing
              ? m.reactions.filter((r) => r !== existing)
              : [...m.reactions.filter((r) => r.user !== me || r.emoji !== emoji), { emoji, user: me, createdAt: new Date().toISOString() }]
            return { ...m, reactions }
          }),
        },
      }
    })
  },

  markRead: (target, upToMessageId) => {
    const payload = target.conversationId
      ? { conversationId: target.conversationId, upToMessageId }
      : { roomId: target.roomId, upToMessageId }
    getSocket()?.emit('message:read', payload)
  },

  setTyping: (target, isTyping) => {
    const payload = target.conversationId
      ? { conversationId: target.conversationId }
      : { roomId: target.roomId }
    getSocket()?.emit(isTyping ? 'typing:start' : 'typing:stop', payload)
  },

  searchUsers: async (q) => {
    const res = await api<SearchResult>(`/users/search?q=${encodeURIComponent(q)}`)
    return res.users
  },

  getUserProfile: async (id) => {
    const res = await api<{ user: UserProfile }>(`/users/${id}`)
    return res.user
  },

  sendFriendRequest: async (userId) => {
    await api('/friends/requests', { method: 'POST', body: { userId } })
    await get().loadFriends()
  },

  acceptRequest: async (userId) => {
    const req = get().incoming.find((r) => r.from?.id === userId)
    if (!req) return
    await api(`/friends/requests/${req.id}/accept`, { method: 'POST' })
    await Promise.all([get().loadFriends(), get().loadConversations()])
  },

  declineRequest: async (requestId) => {
    await api(`/friends/requests/${requestId}/decline`, { method: 'POST' })
    set((s) => ({ incoming: s.incoming.filter((r) => r.id !== requestId) }))
  },

  removeFriend: async (userId) => {
    await api('/friends/remove', { method: 'POST', body: { userId } })
    await get().loadFriends()
  },

  blockUser: async (userId) => {
    await api(`/users/${userId}/block`, { method: 'POST' })
  },

  unblockUser: async (userId) => {
    await api(`/users/${userId}/block`, { method: 'DELETE' })
  },

  loadFriends: async () => {
    const res = await api<FriendsPayload>('/friends')
    set({ friends: res.friends, friendsTotal: res.total, friendsOnline: res.onlineCount, incoming: res.incoming })
  },

  loadStories: async () => {
    const res = await api<{ groups: StoryGroup[] }>('/stories')
    set({ stories: res.groups })
  },

  createStory: async (mediaUrl, caption) => {
    const res = await api<{ story: Story }>('/stories', { method: 'POST', body: { mediaUrl, caption } })
    await get().loadStories()
    return res.story
  },

  deleteStory: async (storyId) => {
    await api(`/stories/${storyId}`, { method: 'DELETE' })
    set((s) => ({
      stories: s.stories
        .map((g) => ({ ...g, stories: g.stories.filter((st) => st.id !== storyId) }))
        .filter((g) => g.stories.length > 0),
    }))
  },

  markStorySeen: (storyId) => {
    set((s) => ({
      stories: s.stories.map((g) => ({
        ...g,
        stories: g.stories.map((st) => (st.id === storyId ? { ...st, viewed: true } : st)),
      })),
    }))
    void api(`/stories/${storyId}/seen`, { method: 'POST' }).then((res) => {
      const story = (res as { story: Story }).story
      set((s) => ({
        stories: s.stories.map((g) => ({
          ...g,
          stories: g.stories.map((st) => (st.id === story.id ? { ...st, viewCount: story.viewCount } : st)),
        })),
      }))
    })
  },

  initSocket: () => {
    const socket = connectSocket()
    set({ meId: useAuth.getState().user?.id ?? '' })
    if (listenersAttached) return
    listenersAttached = true

    const upsertConvoFromNotif = (notif: NotifMessage) => {
      const s = get()
      const existing = s.conversations.find((c) => c.id === notif.conversationId)
      if (existing) {
        set({
          conversations: s.conversations
            .map((c) =>
              c.id === notif.conversationId
                ? {
                    ...c,
                    lastMessageAt: notif.at,
                    lastMessagePreview: notif.preview ?? c.lastMessagePreview,
                    lastMessageType: notif.type,
                    unread: c.unread + 1,
                  }
                : c
            )
            .sort(sortByActivity),
        })
      } else {
        void get().loadConversations()
      }
    }

    const bumpRoomPreview = (roomId: string, message: Message) => {
      set((s) => ({
        rooms: s.rooms
          .map((r) =>
            r.id === roomId
              ? {
                  ...r,
                  lastMessageAt: message.createdAt,
                  lastMessagePreview: previewFor(message),
                  lastMessageType: message.type,
                  unread: r.member ? r.unread + 1 : r.unread,
                }
              : r
          )
          .sort(sortRooms),
      }))
    }

    socket.on('connect', () => {
      set({ socketReady: true })
      // re-sync after a reconnect (restart, network blip)
      void get().loadConversations().catch(() => {})
      void get().loadFriends().catch(() => {})
      void get().loadRooms().catch(() => {})
    })
    socket.on('disconnect', () => set({ socketReady: false }))

    socket.on(
      'message:new',
      (data: { message: Message; conversation?: ConversationListItem; room?: Room }) => {
        const { message } = data
        const key = message.roomId ?? message.conversationId
        if (!key) return
        const s = get()
        const list = s.messages[key]
        const isActive = list !== undefined

        if (message.senderId !== meId() && (document.hidden || !isActive)) {
          playMessageSound()
          if (message.roomId) {
            notifyMessage(data.room?.name ?? 'Room', previewFor(message) ?? 'New message')
          }
        }

        if (message.roomId) {
          // chat room message
          if (isActive) {
            set((st) => {
              const l = st.messages[key] ?? []
              if (l.some((m) => m.id === message.id)) return {}
              const replaced = l.map((m) => (m.tempId === message.tempId && m.pending ? message : m))
              return {
                messages: {
                  ...st.messages,
                  [key]: replaced.some((m) => m.id === message.id) ? replaced : [...replaced, message],
                },
              }
            })
            if (message.senderId !== meId()) get().markRead({ roomId: message.roomId! }, message.id)
          } else {
            bumpRoomPreview(message.roomId, message)
          }
          return
        }

        // direct message
        if (isActive) {
          set((st) => {
            const l = st.messages[key] ?? []
            if (l.some((m) => m.id === message.id)) return {}
            const replaced = l.map((m) => (m.tempId === message.tempId && m.pending ? message : m))
            return {
              messages: { ...st.messages, [key]: replaced.some((m) => m.id === message.id) ? replaced : [...replaced, message] },
            }
          })
          // auto mark-read incoming while open
          if (message.senderId !== meId()) get().markRead({ conversationId: key }, message.id)
        } else {
          upsertConvoFromNotif({
            conversationId: message.conversationId!,
            sender: { id: message.senderId, fullName: '', avatarUrl: null },
            type: message.type,
            body: message.body,
            preview: data.conversation?.lastMessagePreview ?? null,
            at: message.createdAt,
          })
        }
        void get().loadConversations()
      }
    )

    socket.on(
      'message:read',
      (data: { conversationId?: string; roomId?: string; readerId: string; upTo: string }) => {
        const { conversationId, roomId, readerId, upTo } = data
        const key = roomId ?? conversationId
        if (!key) return
        set((s) => ({
          messages: {
            ...s.messages,
            [key]: (s.messages[key] ?? []).map((m) => {
              if (m.senderId === readerId) return m
              if (new Date(m.createdAt).getTime() > new Date(upTo).getTime()) return m
              return m.readBy.includes(readerId) ? m : { ...m, readBy: [...m.readBy, readerId] }
            }),
          },
        }))
      }
    )

    socket.on(
      'message:reaction',
      (data: { messageId: string; conversationId?: string; roomId?: string; reactions: Message['reactions'] }) => {
        const { messageId, conversationId, roomId, reactions } = data
        const key = roomId ?? conversationId
        if (!key) return
        set((s) => ({
          messages: {
            ...s.messages,
            [key]: (s.messages[key] ?? []).map((m) =>
              m.id === messageId ? { ...m, reactions } : m
            ),
          },
        }))
      }
    )

    socket.on(
      'typing',
      (data: { conversationId?: string; roomId?: string; userId: string; isTyping: boolean }) => {
        const { conversationId, roomId, userId, isTyping } = data
        const key = roomId ?? conversationId
        if (!key) return
        set((s) => {
          const current = s.typing[key] ?? []
          if (isTyping && !current.includes(userId)) {
            return { typing: { ...s.typing, [key]: [...current, userId] } }
          }
          if (!isTyping && current.includes(userId)) {
            return { typing: { ...s.typing, [key]: current.filter((u) => u !== userId) } }
          }
          return {}
        })
      }
    )

    socket.on(
      'message:edited',
      (data: { conversationId?: string; roomId?: string; messageId: string; body: string; editedAt: string }) => {
        const { conversationId, roomId, messageId, body, editedAt } = data
        const key = roomId ?? conversationId
        if (!key) return
        set((s) => ({
          messages: {
            ...s.messages,
            [key]: (s.messages[key] ?? []).map((m) =>
              m.id === messageId ? { ...m, body, editedAt } : m
            ),
          },
        }))
      }
    )

    socket.on(
      'message:deleted',
      (data: { conversationId?: string; roomId?: string; messageId: string }) => {
        const { conversationId, roomId, messageId } = data
        const key = roomId ?? conversationId
        if (!key) return
        set((s) => ({
          messages: {
            ...s.messages,
            [key]: (s.messages[key] ?? []).map((m) =>
              m.id === messageId ? { ...m, deleted: true, body: null, mediaUrl: null, reactions: [] } : m
            ),
          },
        }))
      }
    )

    socket.on('presence:update', (data: { userId: string; online: boolean; lastSeen: string | null }) => {
      const { userId, online, lastSeen } = data
      set((s) => ({
        online: { ...s.online, [userId]: online },
        lastSeen: { ...s.lastSeen, [userId]: lastSeen },
        conversations: s.conversations.map((c) =>
          c.peer.id === userId ? { ...c, peer: { ...c.peer, online } } : c
        ),
      }))
    })

    // ---- chat rooms ----

    // A new room was created somewhere: appear in the "available rooms" list.
    socket.on('room:created', (data: { room: Room }) => {
      set((s) => {
        const exists = s.rooms.some((r) => r.id === data.room.id)
        return { rooms: exists ? s.rooms : [data.room, ...s.rooms].sort(sortRooms) }
      })
    })

    socket.on('room:member:joined', (data: { roomId: string; member: PublicUser; memberCount: number }) => {
      const { roomId, member, memberCount } = data
      const me = meId()
      set((s) => ({
        rooms: s.rooms.map((r) =>
          r.id === roomId
            ? { ...r, memberCount, member: r.member || member.id === me }
            : r
        ),
      }))
      if (member.id !== me) {
        get().pushToast({ kind: 'system', title: `${member.fullName} joined a room`, body: 'Someone joined the chat room' })
      }
    })

    socket.on(
      'room:member:left',
      (data: { roomId: string; memberId: string; memberCount: number; ownerId: string }) => {
        const { roomId, memberId, memberCount, ownerId } = data
        const s = get()
        set({
          rooms: s.rooms.map((r) =>
            r.id === roomId
              ? { ...r, memberCount, member: r.member && memberId !== s.meId, ownerId }
              : r
          ),
        })
        // left members stop receiving this room's events
        if (memberId === s.meId) getSocket()?.emit('room:leave', { roomId })
      }
    )

    socket.on('room:deleted', (data: { roomId: string }) => {
      set((s) => {
        const { [data.roomId]: _removed, ...rest } = s.messages
        return {
          rooms: s.rooms.filter((r) => r.id !== data.roomId),
          messages: rest,
          hasMore: { ...s.hasMore, [data.roomId]: false },
        }
      })
    })

    socket.on('notification:message', (notif: NotifMessage) => {
      const list = get().messages[notif.conversationId]
      if (list !== undefined) return // already live
      playMessageSound()
      upsertConvoFromNotif(notif)
      const peer = get().peers[notif.sender.id]
      notifyMessage(peer?.fullName ?? 'New message', notif.preview ?? '')
      get().pushToast({
        kind: 'message',
        title: peer?.fullName ?? 'New message',
        body: notif.preview ?? '',
        payload: { conversationId: notif.conversationId },
      })
    })

    socket.on('friend:request:new', () => {
      void get().loadFriends()
      get().pushToast({ kind: 'friend', title: 'New friend request', body: 'Someone wants to chat' })
    })

    socket.on('friend:request:accepted', (data: { user: PublicUser }) => {
      void get().loadFriends()
      get().pushToast({ kind: 'friend', title: 'Friend request accepted', body: data.user.fullName })
    })

    socket.on('story:new', (data: Story & { user?: PublicUser }) => {
      void get().loadStories()
      get().pushToast({ kind: 'friend', title: 'New story', body: data.user?.fullName ?? 'A friend shared a story' })
    })

    socket.on('story:seen', (data: { storyId: string }) => {
      set((s) => ({
        stories: s.stories.map((g) => ({
          ...g,
          stories: g.stories.map((st) => (st.id === data.storyId ? { ...st, viewCount: st.viewCount + 1 } : st)),
        })),
      }))
    })
  },

  destroySocket: () => {
    listenersAttached = false
    disconnectSocket()
    set({ socketReady: false })
  },
}))

function previewFor(m: ClientMessage): string | null {
  if (m.type === 'image') return 'Photo'
  if (m.type === 'voice') return 'Voice message'
  return (m.body ?? '').slice(0, 120)
}
