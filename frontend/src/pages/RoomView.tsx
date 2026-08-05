import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, Crown, DoorOpen, DotsThree, GearSix, MagnifyingGlass, Trash, UsersFour, X } from '@phosphor-icons/react'
import Avatar from '../components/Avatar'
import MessageBubble from '../components/MessageBubble'
import Composer from '../components/Composer'
import TypingBubble from '../components/TypingBubble'
import Modal from '../components/Modal'
import { useChat } from '../store/chat'
import { getSocket } from '../lib/socket'
import { api } from '../lib/api'
import { formatDayDivider, formatTime, isSameDay, isSameGroup } from '../lib/time'
import { getWallpaperId, wallpaperClass } from '../lib/wallpapers'
import { DEFAULT_ROOM_COLOR, ROOM_COLORS } from '../lib/colors'
import type { Message, PublicUser, RoomDetail } from '../lib/types'
import type { ClientMessage } from '../store/chat'

const EMPTY_MESSAGES: never[] = []
const EMPTY_TYPING: string[] = []

export default function RoomView() {
  const { roomId = '' } = useParams()
  const navigate = useNavigate()
  const meId = useChat((s) => s.meId)
  const rooms = useChat((s) => s.rooms)
  const messages = useChat((s) => s.messages[roomId] ?? EMPTY_MESSAGES)
  const hasMore = useChat((s) => s.hasMore[roomId] ?? false)
  const loadingMessages = useChat((s) => s.loadingMessages[roomId] ?? false)
  const loadingRooms = useChat((s) => !s.ready)
  const socketReady = useChat((s) => s.socketReady)
  const onlineMap = useChat((s) => s.online)
  const typing = useChat((s) => s.typing[roomId] ?? EMPTY_TYPING)
  const loadRooms = useChat((s) => s.loadRooms)
  const openRoom = useChat((s) => s.openRoom)
  const loadMoreRoom = useChat((s) => s.loadMoreRoom)
  const joinRoom = useChat((s) => s.joinRoom)
  const leaveRoom = useChat((s) => s.leaveRoom)
  const deleteRoom = useChat((s) => s.deleteRoom)
  const updateRoom = useChat((s) => s.updateRoom)
  const getRoomDetail = useChat((s) => s.getRoomDetail)
  const sendText = useChat((s) => s.sendText)
  const sendImage = useChat((s) => s.sendImage)
  const sendVoice = useChat((s) => s.sendVoice)
  const setTyping = useChat((s) => s.setTyping)

  const [draft, setDraft] = useState('')
  const [showJump, setShowJump] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [detail, setDetail] = useState<RoomDetail | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<Message[]>([])
  const [searched, setSearched] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [replyingTo, setReplyingTo] = useState<ClientMessage | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const headerMenuRef = useRef<HTMLDivElement>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editColor, setEditColor] = useState(DEFAULT_ROOM_COLOR)
  const [saving, setSaving] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const didInitScroll = useRef(false)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const room = rooms.find((r) => r.id === roomId)
  const member = room?.member ?? false
  const isTyping = typing.length > 0

  useEffect(() => {
    if (rooms.length === 0 && !loadingRooms) void loadRooms().catch(() => {})
  }, [rooms.length, loadingRooms, loadRooms])

  useEffect(() => {
    if (roomId && member) void openRoom(roomId).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, member, openRoom])

  // re-join the room socket room after a reconnect
  useEffect(() => {
    if (socketReady && roomId && member) getSocket()?.emit('room:join', { roomId })
  }, [socketReady, roomId, member])

  // member detail: fetched on mount so group avatars render, refreshed when
  // the members modal opens (live presence comes from the socket anyway)
  useEffect(() => {
    if (!roomId) return
    void getRoomDetail(roomId)
      .then(setDetail)
      .catch(() => {})
  }, [roomId, getRoomDetail])

  // close the header overflow menu on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [])

  // Esc closes the in-room search panel
  useEffect(() => {
    if (!searchOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchOpen(false)
        setSearchQ('')
        setSearchResults([])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchOpen])

  // scroll management (same as ChatView)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const last = messages[messages.length - 1]
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140
    if (!didInitScroll.current) {
      el.scrollTop = el.scrollHeight
      didInitScroll.current = true
    } else if (last && last.senderId === meId) {
      el.scrollTop = el.scrollHeight
    } else if (nearBottom) {
      el.scrollTop = el.scrollHeight
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, roomId])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const atTop = el.scrollTop < 60
    setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 160)
    if (atTop && hasMore && !loadingMessages) {
      const prev = el.scrollHeight
      void loadMoreRoom(roomId).then(() => {
        if (el) el.scrollTop = el.scrollHeight - prev
      })
    }
  }, [roomId, hasMore, loadingMessages, loadMoreRoom])

  const jumpToBottom = () => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  const notifyTyping = (typingNow: boolean) => {
    if (typingTimer.current) {
      clearTimeout(typingTimer.current)
      typingTimer.current = null
    }
    if (typingNow) setTyping({ roomId }, true)
    typingTimer.current = setTimeout(() => setTyping({ roomId }, false), 2200)
  }

  const submitText = async () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    notifyTyping(false)
    const replyId = replyingTo?.id
    setReplyingTo(null)
    await sendText({ roomId }, text, replyId)
  }

  const onImageChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) {
      const replyId = replyingTo?.id
      setReplyingTo(null)
      void sendImage({ roomId }, file, replyId)
    }
  }

  const doJoin = async () => {
    setBusy(true)
    setError('')
    try {
      await joinRoom(roomId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setBusy(false)
    }
  }

  const doLeave = async () => {
    if (leaving) return
    setLeaving(true)
    try {
      await leaveRoom(roomId)
      navigate('/app')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave')
    } finally {
      setLeaving(false)
    }
  }

  const doDelete = async () => {
    setBusy(true)
    try {
      await deleteRoom(roomId)
      navigate('/app')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete room')
    } finally {
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  // in-room message search (debounced, mirrors ChatView)
  const searchRoomMessages = async (q: string): Promise<Message[]> => {
    const term = q.trim()
    if (term.length < 2) return []
    const res = await api<{ messages: Message[] }>(
      `/rooms/${roomId}/messages/search?q=${encodeURIComponent(term)}`
    )
    return res.messages
  }

  const onSearch = (q: string) => {
    setSearchQ(q)
    setSearched(false)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    const term = q.trim()
    if (term.length < 2) {
      setSearchResults([])
      setSearched(true)
      return
    }
    searchTimer.current = setTimeout(async () => {
      const results = await searchRoomMessages(term).catch(() => [])
      setSearchResults(results)
      setSearched(true)
    }, 300)
  }

  const jumpToMessage = (id: string) => {
    setHighlightId(id)
    document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => setHighlightId(null), 2500)
    setSearchOpen(false)
    setSearchQ('')
    setSearchResults([])
  }

  const openSettings = () => {
    setEditName(room?.name ?? '')
    setEditDescription(room?.description ?? '')
    setEditColor(room?.avatarColor ?? DEFAULT_ROOM_COLOR)
    setSettingsError('')
    setSettingsOpen(true)
  }

  // Room settings can be requested from the sidebar room menu (navigation
  // state) — open the modal and clear the flag so it does not reopen later.
  const location = useLocation()
  const openedFromState = useRef(false)
  useEffect(() => {
    if (openedFromState.current) return
    if (location.state?.openSettings) {
      openedFromState.current = true
      openSettings()
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  const saveSettings = async () => {
    const name = editName.trim()
    if (name.length < 1) {
      setSettingsError('Room name is required')
      return
    }
    setSaving(true)
    setSettingsError('')
    try {
      await updateRoom(roomId, {
        name,
        description: editDescription.trim(),
        avatarColor: editColor,
      })
      setSettingsOpen(false)
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to save room settings')
    } finally {
      setSaving(false)
    }
  }

  // Not a member → landing/join screen.
  if (room && !member) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
          <span
            className="flex size-20 items-center justify-center rounded-3xl text-white"
            style={{ backgroundColor: room.avatarColor || '#2B5CFF' }}
          >
            <span className="text-4xl font-bold">{room.name.trim().charAt(0).toUpperCase() || '#'}</span>
          </span>
          <div>
            <h2 className="flex items-center justify-center gap-2 text-xl font-bold text-ink">
              {room.name}
              {room.ownerId === meId && <Crown size={16} className="text-amber-500" weight="fill" />}
            </h2>
            {room.description && <p className="mt-1 text-sm text-ink-2">{room.description}</p>}
            <p className="mt-2 text-xs text-ink-3">
              {room.memberCount} member{room.memberCount === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void doJoin()}
            className="flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong disabled:opacity-60"
          >
            <UsersFour size={17} /> Join room
          </button>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      </div>
    )
  }

  if (!room || loadingRooms) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="size-6 animate-spin rounded-full border-2 border-ink-3 border-t-accent" />
      </div>
    )
  }

  const memberName = (id: string): string | undefined => {
    if (id === meId) return undefined
    return detail?.members.find((m) => m.id === id)?.fullName
  }
  const memberById = (id: string): PublicUser | undefined => detail?.members.find((m) => m.id === id)
  // Reply-chip sender name: "You" for own messages, member name when the
  // members list is loaded, otherwise a short id fragment.
  const replySenderName = (m: ClientMessage): string => {
    if (m.senderId === meId) return 'You'
    return detail?.members.find((x) => x.id === m.senderId)?.fullName ?? `#${m.senderId.slice(0, 6)}`
  }
  // One-line preview of a message for the composer reply chip.
  const replyPreview = (m: ClientMessage): string => {
    if (m.type === 'image') return 'Photo'
    if (m.type === 'voice') return 'Voice message'
    return (m.body || m.replyTo?.body || '').trim() || 'Message deleted'
  }
  const isOwner = room.ownerId === meId

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header */}
      <header className="flex shrink-0 items-center gap-2.5 border-b border-line bg-surface px-3 py-2.5 lg:gap-3 lg:px-4">
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate('/app')}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink lg:hidden"
        >
          <ArrowLeft size={20} />
        </button>
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-[14px] text-white lg:size-10"
          style={{ backgroundColor: room.avatarColor || '#2B5CFF' }}
        >
          <span className="text-base font-bold">{room.name.trim().charAt(0).toUpperCase() || '#'}</span>
        </span>
        <button type="button" onClick={() => setMembersOpen(true)} className="min-w-0 flex-1 text-left">
          <p className="flex items-center gap-2 truncate text-sm font-bold text-ink">
            <span className="truncate">{room.name}</span>
            {isOwner && <Crown size={14} className="shrink-0 text-amber-500" weight="fill" />}
          </p>
          <p className={`truncate text-xs ${isTyping ? 'font-medium text-accent' : 'text-ink-3'}`}>
            {isTyping
              ? 'someone is typing…'
              : `${room.memberCount} member${room.memberCount === 1 ? '' : 's'} — tap for details`}
          </p>
        </button>
        <button
          type="button"
          aria-label="Search in room"
          onClick={() => setSearchOpen((v) => !v)}
          className="press flex size-9 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink"
        >
          <MagnifyingGlass size={19} />
        </button>
        <button
          type="button"
          aria-label="Room members"
          onClick={() => setMembersOpen(true)}
          className="flex size-9 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink"
        >
          <UsersFour size={19} />
        </button>
        <div className="relative" ref={headerMenuRef}>
          <button
            type="button"
            aria-label="Room menu"
            onClick={() => setHeaderMenuOpen((v) => !v)}
            className="flex size-9 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink"
          >
            <DotsThree size={22} weight="bold" />
          </button>
          {headerMenuOpen && (
            <div className="animate-fade-in absolute top-11 right-0 z-30 w-48 overflow-hidden rounded-xl bg-surface shadow-xl ring-1 ring-line">
              <button
                type="button"
                onClick={() => {
                  setHeaderMenuOpen(false)
                  navigate('/app/settings')
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-ink transition hover:bg-surface-2 lg:hidden"
              >
                <GearSix size={17} /> Settings
              </button>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => {
                    openSettings()
                    setHeaderMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-ink transition hover:bg-surface-2"
                >
                  <GearSix size={17} /> Room settings
                </button>
              )}
              {isOwner ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDelete(true)
                    setHeaderMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-danger transition hover:bg-danger/10"
                >
                  <Trash size={17} /> Delete room
                </button>
              ) : (
                <button
                  type="button"
                  disabled={leaving}
                  onClick={() => void doLeave()}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-danger transition hover:bg-danger/10 disabled:opacity-50"
                >
                  <DoorOpen size={17} /> Leave room
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* in-room search */}
      {searchOpen && (
        <div className="animate-fade-in shrink-0 border-b border-line bg-surface px-4 py-2.5">
          <div className="relative">
            <MagnifyingGlass size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
            <input
              value={searchQ}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search messages…"
              autoFocus
              className="field !py-2 !pl-9 pr-9"
            />
            <button
              type="button"
              aria-label="Close search"
              onClick={() => {
                setSearchOpen(false)
                setSearchQ('')
                setSearchResults([])
              }}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-3 transition hover:text-ink"
            >
              <X size={15} />
            </button>
          </div>
          <div className="mt-2 flex max-h-52 flex-col gap-0.5 overflow-y-auto">
            {searched && searchResults.length === 0 && (
              <p className="py-4 text-center text-xs text-ink-3">No matching messages</p>
            )}
            {searchResults.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => jumpToMessage(m.id)}
                className="flex items-baseline gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{m.body}</span>
                <span className="shrink-0 text-[11px] text-ink-3">{formatTime(m.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* messages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={`chat-bg min-h-0 flex-1 overflow-y-auto py-3 ${wallpaperClass(getWallpaperId())}`}
      >
        {loadingMessages && hasMore && (
          <p className="pb-2 text-center text-xs text-ink-3">Loading older messages…</p>
        )}
        {messages.length === 0 && !hasMore && (
          <p className="py-10 text-center text-sm text-ink-3">No messages yet — say hello</p>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const next = messages[i + 1]
          const divider = !prev || !isSameDay(prev.createdAt, m.createdAt)
          const firstInGroup = !prev || !isSameGroup(prev, m)
          const lastInGroup = !next || !isSameGroup(m, next)
          const sender = m.senderId !== meId ? memberById(m.senderId) : null
          return (
            <div key={m.id} id={`msg-${m.id}`} className={`px-1.5 sm:px-2 ${firstInGroup ? 'mt-3' : 'mt-0.5'}`}>
              {divider && (
                <div className="my-3 flex justify-center px-4">
                  <span className="day-divider">{formatDayDivider(m.createdAt)}</span>
                </div>
              )}
              <MessageBubble
                roomId={roomId}
                message={m}
                senderName={firstInGroup ? memberName(m.senderId) : undefined}
                highlight={highlightId === m.id}
                roomMode
                isLastInGroup={lastInGroup}
                avatar={
                  m.senderId === meId || !sender
                    ? null
                    : { name: sender.fullName, color: sender.avatarColor, src: sender.avatarUrl }
                }
                onReply={setReplyingTo}
                onJumpToReply={jumpToMessage}
              />
            </div>
          )
        })}
        {isTyping && <div className="px-1.5 sm:px-2"><TypingBubble /></div>}
      </div>

      {/* jump to bottom */}
      {showJump && (
        <button
          type="button"
          onClick={jumpToBottom}
          aria-label="Jump to latest"
          className="animate-fade-in absolute bottom-24 right-6 z-10 flex size-10 items-center justify-center rounded-full bg-surface text-ink-2 shadow-lg ring-1 ring-line transition hover:text-accent"
        >
          <ArrowDown size={18} />
        </button>
      )}

      {/* composer */}
      <Composer
        draft={draft}
        setDraft={setDraft}
        onSubmit={submitText}
        onTyping={notifyTyping}
        onPickImage={() => fileInputRef.current?.click()}
        onSendVoice={async (blob, durationSec) => {
          const replyId = replyingTo?.id
          setReplyingTo(null)
          await sendVoice({ roomId }, blob, durationSec, replyId)
        }}
        replyingTo={replyingTo ? { senderName: replySenderName(replyingTo), body: replyPreview(replyingTo) } : null}
        onCancelReply={() => setReplyingTo(null)}
      />
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onImageChosen} />

      {/* members modal: the users present in this room */}
      <Modal open={membersOpen} onClose={() => setMembersOpen(false)} title={`Members (${room.memberCount})`}>
        <div className="flex max-h-[55dvh] flex-col gap-1 overflow-y-auto lg:max-h-80">
          {detail?.members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-xl p-2.5 transition hover:bg-surface-2">
              <Avatar
                name={m.fullName}
                color={m.avatarColor}
                src={m.avatarUrl}
                size={40}
                online={onlineMap[m.id] ?? m.online}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-ink">{m.fullName}</span>
                  {m.id === room.ownerId && <Crown size={13} className="shrink-0 text-amber-500" weight="fill" />}
                </span>
                <span className="block truncate font-mono text-xs text-ink-3">@{m.username}</span>
              </span>
            </div>
          ))}
        </div>
      </Modal>

      {/* room settings (owner only) */}
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Room settings">
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-2" htmlFor="room-settings-name">
              Room name
            </label>
            <input
              id="room-settings-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={50}
              className="field"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-2" htmlFor="room-settings-desc">
              Description
            </label>
            <textarea
              id="room-settings-desc"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              maxLength={200}
              rows={2}
              className="field resize-none"
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-2">Room color</p>
            <div className="flex flex-wrap gap-2.5">
              {ROOM_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Room color ${c}`}
                  aria-pressed={editColor === c}
                  onClick={() => setEditColor(c)}
                  className={`size-6 rounded-full transition ${
                    editColor === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          {settingsError && <p className="text-xs text-danger">{settingsError}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="rounded-full bg-surface-2 px-4 py-2 text-sm font-medium text-ink-2 transition hover:bg-line"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveSettings()}
              className="press rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </Modal>

      {/* delete confirmation (owner only) */}
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete room">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-2">
            Delete “{room.name}” for everyone? All messages will be removed. This cannot be undone.
          </p>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-full bg-surface-2 px-4 py-2 text-sm font-medium text-ink-2 transition hover:bg-line"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void doDelete()}
              className="rounded-full bg-danger px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {busy ? 'Deleting…' : 'Delete room'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
