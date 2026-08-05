import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check,
  ChatsCircle,
  Crown,
  DoorOpen,
  DotsThree,
  GearSix,
  MagnifyingGlass,
  Plus,
  SignOut,
  UserCirclePlus,
  UsersFour,
  UsersThree,
} from '@phosphor-icons/react'
import Avatar from './Avatar'
import EmptyState from './EmptyState'
import NewRoomModal from './NewRoomModal'
import { SidebarListSkeleton } from './Skeletons'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { SearchModal } from './ProfileSheet'
import { formatListTime } from '../lib/time'

type Tab = 'chats' | 'rooms' | 'friends' | 'requests'

export default function Sidebar() {
  const [tab, setTab] = useState<Tab>('chats')
  const [searchOpen, setSearchOpen] = useState(false)
  const [roomModalOpen, setRoomModalOpen] = useState(false)

  const user = useAuth((s) => s.user)
  const navigate = useNavigate()

  const conversations = useChat((s) => s.conversations)
  const chatReady = useChat((s) => s.ready)
  const typing = useChat((s) => s.typing)
  const onlineMap = useChat((s) => s.online)
  const rooms = useChat((s) => s.rooms)
  const friends = useChat((s) => s.friends)
  const friendsOnline = useChat((s) => s.friendsOnline)
  const friendsTotal = useChat((s) => s.friendsTotal)
  const incoming = useChat((s) => s.incoming)
  const openConversation = useChat((s) => s.openConversation)
  const joinRoom = useChat((s) => s.joinRoom)
  const leaveRoom = useChat((s) => s.leaveRoom)
  const acceptRequest = useChat((s) => s.acceptRequest)
  const declineRequest = useChat((s) => s.declineRequest)

  const unreadTotal = conversations.reduce((n, c) => n + c.unread, 0)
  const requestsCount = incoming.length
  const roomUnread = rooms.reduce((n, r) => n + (r.member ? r.unread : 0), 0)

  const chatWith = async (peerId: string) => {
    const convoId = await openConversation(peerId)
    if (convoId) navigate(`/app/c/${convoId}`)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header */}
      <div className="flex items-center gap-2.5 px-4 pt-[calc(env(safe-area-inset-top)+16px)] pb-2 lg:gap-3 lg:pt-4">
        <button
          type="button"
          onClick={() => navigate('/app/profile')}
          title="My profile"
          className="rounded-full transition hover:opacity-80"
        >
          <Avatar name={user?.fullName ?? '?'} color={user?.avatarColor ?? '#2B5CFF'} src={user?.avatarUrl} size={40} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{user?.fullName}</p>
          <p className="truncate text-xs text-ink-2">{friendsTotal} friends</p>
        </div>
        <button
          type="button"
          aria-label="Search"
          onClick={() => setSearchOpen(true)}
          className="flex size-10 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink lg:size-9"
        >
          <MagnifyingGlass size={20} />
        </button>
        <button
          type="button"
          aria-label="Settings"
          onClick={() => navigate('/app/settings')}
          className="flex size-10 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink lg:size-9"
        >
          <GearSix size={20} />
        </button>
      </div>

      {/* search box (desktop quick open) */}
      <div className="px-4 pb-2">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex w-full items-center gap-2 rounded-input bg-surface-2 px-3.5 py-2 text-sm text-ink-3 transition hover:bg-line"
        >
          <MagnifyingGlass size={16} />
          Find people…
        </button>
      </div>

      {/* tabs */}
      <div className="flex gap-1.5 px-3 pb-2.5 lg:gap-2 lg:px-4">
        {(
          [
            ['chats', 'Chats', ChatsCircle, unreadTotal],
            ['rooms', 'Rooms', UsersFour, roomUnread],
            ['friends', 'Friends', UsersThree, friendsTotal],
            ['requests', 'Requests', UserCirclePlus, requestsCount],
          ] as const
        ).map(([key, label, Icon, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full py-2 text-sm font-medium transition active:scale-[0.97] ${
              tab === key ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
            }`}
          >
            <Icon size={17} className="size-[15px] lg:size-[17px]" weight={tab === key ? 'fill' : 'regular'} />
            {label}
            {count > 0 && (
              <span
                className={`flex min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                  tab === key ? 'bg-accent text-accent-ink' : 'bg-ink text-canvas'
                }`}
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* content */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6 lg:pb-4">
        {tab === 'chats' &&
          (chatReady || conversations.length > 0 ? (
            <ConversationList
              items={conversations}
              typing={typing}
              onlineMap={onlineMap}
              onOpen={(id) => navigate(`/app/c/${id}`)}
              onSearch={() => setSearchOpen(true)}
            />
          ) : (
            <SidebarListSkeleton />
          ))}
        {tab === 'rooms' && (
          <RoomList
            rooms={rooms}
            meId={user?.id ?? ''}
            onOpen={(id) => navigate(`/app/r/${id}`)}
            onOpenSettings={(id) => navigate(`/app/r/${id}`, { state: { openSettings: true } })}
            onJoin={(id) => void joinRoom(id).catch(() => {})}
            onLeave={(id) => void leaveRoom(id).catch(() => {})}
            onCreate={() => setRoomModalOpen(true)}
          />
        )}
        {tab === 'friends' && (
          <div className="flex flex-col gap-1">
            <p className="px-2 pt-1 pb-2 text-xs font-medium text-ink-3">
              {friendsOnline} of {friendsTotal} online
            </p>
            {friends.length === 0 && (
              <EmptyState
                icon={UsersThree}
                title="No friends yet"
                body="Send a request to someone you know and start chatting."
                action={<SearchPeopleButton onClick={() => setSearchOpen(true)} />}
              />
            )}
            {friends.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => chatWith(f.id)}
                className="flex min-h-16 items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-surface-2 lg:min-h-0"
              >
                <Avatar name={f.fullName} color={f.avatarColor} src={f.avatarUrl} size={42} online={onlineMap[f.id]} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{f.fullName}</span>
                  <span className="block truncate font-mono text-xs text-ink-3">@{f.username}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {tab === 'requests' && (
          <div className="flex flex-col gap-1">
            {incoming.length === 0 && (
              <EmptyState
                icon={UserCirclePlus}
                title="No pending requests"
                body="Friend requests from people you know will show up here."
              />
            )}
            {incoming.map((r) => (
              <div key={r.id} className="flex min-h-16 items-center gap-3 rounded-xl p-2.5 transition hover:bg-surface-2 lg:min-h-0">
                <Avatar
                  name={r.from?.fullName ?? '?'}
                  color={r.from?.avatarColor ?? '#2B5CFF'}
                  src={r.from?.avatarUrl}
                  size={42}
                  online={r.from ? onlineMap[r.from.id] : undefined}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{r.from?.fullName}</p>
                  <p className="truncate font-mono text-xs text-ink-3">@{r.from?.username}</p>
                </div>
                <button
                  type="button"
                  aria-label="Accept"
                  onClick={() => r.from && acceptRequest(r.from.id)}
                  className="flex size-8 items-center justify-center rounded-full bg-ok/15 text-ok transition hover:bg-ok/25"
                >
                  <Check size={16} weight="bold" />
                </button>
                <button
                  type="button"
                  aria-label="Decline"
                  onClick={() => declineRequest(r.id)}
                  className="flex size-8 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-danger"
                >
                  <SignOut size={16} className="rotate-180" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <NewRoomModal open={roomModalOpen} onClose={() => setRoomModalOpen(false)} />
    </div>
  )
}

// "Available chat rooms" list: join what you want, chat in what you joined.
function SearchPeopleButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong"
    >
      <MagnifyingGlass size={15} weight="bold" /> Search for people
    </button>
  )
}
function RoomList({
  rooms,
  meId,
  onOpen,
  onOpenSettings,
  onJoin,
  onLeave,
  onCreate,
}: {
  rooms: ReturnType<typeof useChat.getState>['rooms']
  meId: string
  onOpen: (roomId: string) => void
  onOpenSettings: (roomId: string) => void
  onJoin: (roomId: string) => void
  onLeave: (roomId: string) => void
  onCreate: () => void
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [])

  if (rooms.length === 0) {
    return (
      <EmptyState
        icon={UsersFour}
        title="No chat rooms yet"
        body="Start a room for a group topic or a weekend plan."
        action={
          <button
            type="button"
            onClick={onCreate}
            className="press flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong"
          >
            <Plus size={15} weight="bold" /> Create a room
          </button>
        }
      />
    )
  }
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={onCreate}
        className="flex min-h-14 items-center gap-2.5 rounded-xl p-2.5 text-left text-sm font-semibold text-accent transition hover:bg-accent-soft lg:min-h-0"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Plus size={16} weight="bold" />
        </span>
        New room
      </button>
      {rooms.map((r) => {
        const member = r.member
        return (
          <div
            key={r.id}
            className="group flex min-h-16 items-center gap-3 rounded-xl p-2.5 transition hover:bg-surface-2 lg:min-h-0"
          >
            <button type="button" onClick={() => member && onOpen(r.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-[14px] text-white"
                style={{ backgroundColor: r.avatarColor || '#2B5CFF' }}
              >
                <span className="text-lg font-bold">{r.name.trim().charAt(0).toUpperCase() || '#'}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-ink">{r.name}</span>
                  {r.ownerId === meId && <Crown size={13} className="shrink-0 text-amber-500" weight="fill" />}
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-ink-2">
                    {r.lastMessageSenderId === meId && r.lastMessagePreview ? 'You: ' : ''}
                    {r.lastMessagePreview || `${r.memberCount} member${r.memberCount === 1 ? '' : 's'}`}
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-3">
                    {r.lastMessageAt ? formatListTime(r.lastMessageAt) : 'New'}
                  </span>
                </span>
              </span>
            </button>
            {member ? (
              <div className="relative shrink-0" ref={menuRef}>
                <button
                  type="button"
                  aria-label="Room menu"
                  onClick={() => setMenuFor(menuFor === r.id ? null : r.id)}
                  className="flex size-8 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink active:scale-95"
                >
                  <DotsThree size={18} weight="bold" />
                </button>
                {menuFor === r.id && (
                  <div className="animate-fade-in absolute top-9 right-0 z-30 w-44 overflow-hidden rounded-xl bg-surface py-1 shadow-xl ring-1 ring-line">
                    {r.ownerId === meId && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuFor(null)
                          onOpenSettings(r.id)
                        }}
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-ink transition hover:bg-surface-2"
                      >
                        <GearSix size={16} /> Room settings
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setMenuFor(null)
                        onLeave(r.id)
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-danger transition hover:bg-danger/10"
                    >
                      <DoorOpen size={16} /> Leave room
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onJoin(r.id)}
                className="flex shrink-0 items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink transition hover:bg-accent-strong"
              >
                <Plus size={13} weight="bold" /> Join
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ConversationList({
  items,
  typing,
  onlineMap,
  onOpen,
  onSearch,
}: {
  items: ReturnType<typeof useChat.getState>['conversations']
  typing: Record<string, string[]>
  onlineMap: Record<string, boolean>
  onOpen: (conversationId: string) => void
  onSearch: () => void
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={ChatsCircle}
        title="No conversations yet"
        body="Find someone you know and start the first chat."
        action={<SearchPeopleButton onClick={onSearch} />}
      />
    )
  }
  return (
    <div className="flex flex-col gap-0.5">
      {items.map((c) => {
        const isTyping = (typing[c.id] ?? []).length > 0
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onOpen(c.id)}
            className="flex min-h-16 items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-surface-2 lg:min-h-0"
          >
            <Avatar
              name={c.peer.fullName}
              color={c.peer.avatarColor}
              src={c.peer.avatarUrl}
              size={48}
              online={onlineMap[c.peer.id] ?? c.peer.online}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold text-ink">{c.peer.fullName}</span>
                <span className="shrink-0 text-[11px] text-ink-3">{formatListTime(c.lastMessageAt)}</span>
              </span>
              <span className="mt-0.5 flex items-center justify-between gap-2">
                <span
                  className={`truncate text-xs ${isTyping ? 'font-medium text-accent' : 'text-ink-2'}`}
                >
                  {isTyping ? 'typing…' : c.lastMessagePreview ?? 'Say hello'}
                </span>
                {c.unread > 0 && (
                  <span className="flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink">
                    {c.unread > 99 ? '99+' : c.unread}
                  </span>
                )}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
