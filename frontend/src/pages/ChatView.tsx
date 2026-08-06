import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowLeft,
  DotsThree,
  GearSix,
  MagnifyingGlass,
  Prohibit,
  X,
} from '@phosphor-icons/react'
import Avatar from '../components/Avatar'
import ProfileSheet from '../components/ProfileSheet'
import MessageBubble from '../components/MessageBubble'
import Composer from '../components/Composer'
import TypingBubble from '../components/TypingBubble'
import { useChat } from '../store/chat'
import { getSocket } from '../lib/socket'
import { formatDayDivider, formatTime, isSameDay, isSameGroup, lastSeenText } from '../lib/time'
import { getWallpaperId, wallpaperClass } from '../lib/wallpapers'
import type { ClientMessage } from '../store/chat'
import type { Message } from '../lib/types'

const EMPTY_MESSAGES: ClientMessage[] = []
const EMPTY_TYPING: string[] = []

export default function ChatView() {
  const { conversationId = '' } = useParams()
  const navigate = useNavigate()
  const conversations = useChat((s) => s.conversations)
  const messages = useChat((s) => s.messages[conversationId] ?? EMPTY_MESSAGES)
  const hasMore = useChat((s) => s.hasMore[conversationId] ?? false)
  const loadingMessages = useChat((s) => s.loadingMessages[conversationId] ?? false)
  const loadingConversations = useChat((s) => !s.ready)
  const socketReady = useChat((s) => s.socketReady)
  const onlineMap = useChat((s) => s.online)
  const lastSeenMap = useChat((s) => s.lastSeen)
  const typing = useChat((s) => s.typing[conversationId] ?? EMPTY_TYPING)
  const meId = useChat((s) => s.meId)
  const openConversationById = useChat((s) => s.openConversationById)
  const loadMore = useChat((s) => s.loadMore)
  const sendText = useChat((s) => s.sendText)
  const sendImage = useChat((s) => s.sendImage)
  const sendVoice = useChat((s) => s.sendVoice)
  const setTyping = useChat((s) => s.setTyping)
  const searchMessages = useChat((s) => s.searchMessages)
  const getUserProfile = useChat((s) => s.getUserProfile)
  const blockUser = useChat((s) => s.blockUser)
  const unblockUser = useChat((s) => s.unblockUser)

  const [profileOpen, setProfileOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [showJump, setShowJump] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<Message[]>([])
  const [searched, setSearched] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [replyingTo, setReplyingTo] = useState<ClientMessage | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const didInitScroll = useRef(false)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const convo = conversations.find((c) => c.id === conversationId)
  const peer = convo?.peer
  const online = peer ? (onlineMap[peer.id] ?? peer.online) : false
  const lastSeen = peer ? (lastSeenMap[peer.id] ?? peer.lastSeen) : null
  const isTyping = typing.length > 0

  // messenger-style "Seen" / "Delivered" state for the last outgoing message
  const lastOutgoing = [...messages].reverse().find((m) => m.senderId === meId && !m.pending && !m.failed)
  const headerSubtitle = isTyping
    ? 'typing…'
    : lastOutgoing && peer
      ? lastOutgoing.readBy.includes(peer.id)
        ? 'Seen'
        : 'Delivered'
      : lastSeenText(lastSeen, online)

  // index of the first unread incoming message (divider pill), when the
  // conversation was read before
  const unreadStart = useMemo(() => {
    const readAt = convo?.lastReadAt
    if (!readAt) return -1
    return messages.findIndex(
      (m) => m.senderId !== meId && new Date(m.createdAt).getTime() > new Date(readAt).getTime()
    )
  }, [messages, convo?.lastReadAt, meId])

  // Esc closes the search panel
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

  useEffect(() => {
    if (conversationId) void openConversationById(conversationId)
  }, [conversationId, openConversationById])

  // re-join the conversation room after a socket reconnect
  useEffect(() => {
    if (socketReady && conversationId) {
      getSocket()?.emit('conversation:join', { conversationId })
    }
  }, [socketReady, conversationId])

  // close menus on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [])

  // fetch block state when the header menu opens
  useEffect(() => {
    if (!menuOpen || !peer) return
    void getUserProfile(peer.id)
      .then((p) => setBlocked(!!p.blocked))
      .catch(() => {})
  }, [menuOpen, peer, getUserProfile])

  // scroll management
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const last = messages[messages.length - 1]
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140
    if (!didInitScroll.current) {
      el.scrollTop = el.scrollHeight
      didInitScroll.current = true
    } else if (last && last.senderId === useChat.getState().meId) {
      el.scrollTop = el.scrollHeight
    } else if (nearBottom) {
      el.scrollTop = el.scrollHeight
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, conversationId])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const atTop = el.scrollTop < 60
    setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 160)
    if (atTop && hasMore && !loadingMessages) {
      const prev = el.scrollHeight
      void loadMore(conversationId).then(() => {
        if (el) el.scrollTop = el.scrollHeight - prev
      })
    }
  }, [conversationId, hasMore, loadingMessages, loadMore])

  const jumpToBottom = () => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  // typing indicator (debounced)
  const notifyTyping = (typingNow: boolean) => {
    if (typingTimer.current) {
      clearTimeout(typingTimer.current)
      typingTimer.current = null
    }
    if (typingNow) setTyping({ conversationId }, true)
    typingTimer.current = setTimeout(() => setTyping({ conversationId }, false), 2200)
  }

  const submitText = async () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    notifyTyping(false)
    const replyId = replyingTo?.id
    setReplyingTo(null)
    await sendText({ conversationId }, text, replyId)
  }

  const pickImage = (source: 'camera' | 'gallery') => {
    ;(source === 'camera' ? cameraRef : galleryRef).current?.click()
  }

  const onImageChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) {
      const replyId = replyingTo?.id
      setReplyingTo(null)
      void sendImage({ conversationId }, file, replyId)
    }
  }

  // One-line preview of a message for the composer reply chip.
  const replyPreview = (m: ClientMessage): string => {
    if (m.type === 'image') return 'Photo'
    if (m.type === 'voice') return 'Voice message'
    return (m.body || m.replyTo?.body || '').trim() || 'Message deleted'
  }

  // in-conversation search (debounced)
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
      const results = await searchMessages(conversationId, term).catch(() => [])
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

  const toggleBlock = async () => {
    if (!peer) return
    setMenuOpen(false)
    try {
      if (blocked) {
        await unblockUser(peer.id)
        setBlocked(false)
      } else {
        await blockUser(peer.id)
        setBlocked(true)
      }
    } catch {
      // toast handles errors
    }
  }

  if (!convo || loadingConversations) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="size-6 animate-spin rounded-full border-2 border-ink-3 border-t-accent" />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header */}
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-4 py-2 lg:gap-3 lg:py-2.5">
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate('/app')}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink lg:hidden"
        >
          <ArrowLeft size={20} weight="bold" />
        </button>
        <button type="button" onClick={() => setProfileOpen(true)} className="rounded-full transition hover:opacity-80">
          <Avatar
            name={peer!.fullName}
            color={peer!.avatarColor}
            src={peer!.avatarUrl}
            size={38}
            online={online}
            className="!size-9 [&_img]:!size-full [&_span:not(.absolute)]:!size-full"
          />
        </button>
        <button type="button" onClick={() => setProfileOpen(true)} className="min-w-0 flex-1 text-left">
          <p className="flex items-center gap-2 truncate text-sm font-bold text-ink">
            <span className="truncate">{peer!.fullName}</span>
            {peer!.status === 'away' && <StatusChip>Away</StatusChip>}
            {peer!.status === 'busy' && <StatusChip>Busy</StatusChip>}
          </p>
          <p className={`truncate text-xs ${isTyping ? 'font-medium text-accent' : 'text-ink-3'}`}>
            {headerSubtitle}
          </p>
        </button>
        <button
          type="button"
          aria-label="Search in conversation"
          onClick={() => setSearchOpen((v) => !v)}
          className="flex size-9 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink"
        >
          <MagnifyingGlass size={19} />
        </button>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label="Conversation menu"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex size-9 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink"
          >
            <DotsThree size={22} weight="bold" />
          </button>
          {menuOpen && (
            <div className="animate-fade-in absolute top-11 right-0 z-30 w-44 overflow-hidden rounded-xl bg-surface shadow-xl ring-1 ring-line">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  navigate('/app/settings')
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-ink transition hover:bg-surface-2 lg:hidden"
              >
                <GearSix size={17} /> Settings
              </button>
              <button
                type="button"
                onClick={() => void toggleBlock()}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-danger transition hover:bg-danger/10"
              >
                <Prohibit size={17} />
                {blocked ? 'Unblock user' : 'Block user'}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* in-conversation search */}
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
          <div className="mt-2 flex max-h-40 flex-col gap-0.5 overflow-y-auto lg:max-h-52">
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
        className={`chat-bg min-h-0 flex-1 overflow-y-auto px-1.5 py-3 sm:px-2 ${wallpaperClass(getWallpaperId())}`}
      >
        {loadingMessages && hasMore && (
          <p className="pb-2 text-center text-xs text-ink-3">Loading older messages…</p>
        )}
        {messages.length === 0 && !hasMore && (
          <p className="py-10 text-center text-sm text-ink-3">
            No messages yet — say hello to {peer!.fullName.split(' ')[0]}
          </p>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const next = messages[i + 1]
          const divider = !prev || !isSameDay(prev.createdAt, m.createdAt)
          const firstInGroup = !prev || !isSameGroup(prev, m)
          const lastInGroup = !next || !isSameGroup(m, next)
          return (
            <div key={m.id} id={`msg-${m.id}`} className={firstInGroup ? 'mt-3' : 'mt-0.5'}>
              {i === unreadStart && (
                <div className="my-3 flex justify-center px-4">
                  <span className="day-divider !border-accent/40 !text-accent">Unread</span>
                </div>
              )}
              {divider && (
                <div className="my-3 flex justify-center px-4">
                  <span className="day-divider">{formatDayDivider(m.createdAt)}</span>
                </div>
              )}
              <MessageBubble
                conversationId={conversationId}
                message={m}
                highlight={highlightId === m.id}
                isLastInGroup={lastInGroup}
                roomMode
                avatar={
                  m.senderId !== peer!.id
                    ? { name: peer!.fullName, color: peer!.avatarColor, src: peer!.avatarUrl }
                    : null
                }
                onReply={setReplyingTo}
                onJumpToReply={jumpToMessage}
              />
            </div>
          )
        })}
        {isTyping && <TypingBubble />}
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
        onPickImage={pickImage}
        onSendVoice={async (blob, durationSec) => {
          const replyId = replyingTo?.id
          setReplyingTo(null)
          await sendVoice({ conversationId }, blob, durationSec, replyId)
        }}
        replyingTo={
          replyingTo
            ? {
                senderName: replyingTo.senderId === meId ? 'You' : (peer?.fullName ?? 'Unknown'),
                body: replyPreview(replyingTo),
              }
            : null
        }
        onCancelReply={() => setReplyingTo(null)}
      />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onImageChosen} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={onImageChosen} />

      <ProfileSheet userId={profileOpen ? peer!.id : null} onClose={() => setProfileOpen(false)} />
    </div>
  )
}

function StatusChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-2">
      {children}
    </span>
  )
}
