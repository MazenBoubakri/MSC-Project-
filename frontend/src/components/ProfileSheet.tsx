import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChatTeardrop,
  MagnifyingGlass,
  Check,
  Prohibit,
  UserMinus,
  UserPlus,
} from '@phosphor-icons/react'
import Modal from './Modal'
import Avatar from './Avatar'
import { useChat } from '../store/chat'
import { lastSeenText } from '../lib/time'
import type { UserProfile } from '../lib/types'

interface ProfileSheetProps {
  userId: string | null
  onClose: () => void
}

export default function ProfileSheet({ userId, onClose }: ProfileSheetProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const getUserProfile = useChat((s) => s.getUserProfile)
  const sendFriendRequest = useChat((s) => s.sendFriendRequest)
  const acceptRequest = useChat((s) => s.acceptRequest)
  const removeFriend = useChat((s) => s.removeFriend)
  const blockUser = useChat((s) => s.blockUser)
  const unblockUser = useChat((s) => s.unblockUser)
  const openConversation = useChat((s) => s.openConversation)
  const online = useChat((s) => (userId ? s.online[userId] ?? false : false))

  const load = useCallback(async () => {
    if (!userId) return
    setProfile(null)
    try {
      setProfile(await getUserProfile(userId))
    } catch {
      setProfile(null)
    }
  }, [userId, getUserProfile])

  useEffect(() => {
    void load()
  }, [load])

  const sendReq = async () => {
    if (!profile) return
    setBusy(true)
    try {
      await sendFriendRequest(profile.id)
      setProfile({ ...profile, friendStatus: 'sent' })
    } finally {
      setBusy(false)
    }
  }

  const accept = async () => {
    if (!profile) return
    setBusy(true)
    try {
      await acceptRequest(profile.id)
      setProfile({ ...profile, friendStatus: 'friends' })
    } finally {
      setBusy(false)
    }
  }

  const unfriend = async () => {
    if (!profile) return
    setBusy(true)
    try {
      await removeFriend(profile.id)
      setProfile({ ...profile, friendStatus: 'none' })
    } finally {
      setBusy(false)
    }
  }

  const toggleBlock = async () => {
    if (!profile) return
    setBusy(true)
    try {
      if (profile.blocked) {
        await unblockUser(profile.id)
        setProfile({ ...profile, blocked: false })
      } else {
        await blockUser(profile.id)
        setProfile({ ...profile, blocked: true })
      }
    } finally {
      setBusy(false)
    }
  }

  const message = async () => {
    if (!profile) return
    const convoId = await openConversation(profile.id)
    if (convoId) {
      onClose()
      navigate(`/app/c/${convoId}`)
    }
  }

  return (
    <Modal open={!!userId && !!profile} onClose={onClose} width="max-w-sm">
      {profile && (
        <div className="flex flex-col items-center gap-4">
          <Avatar name={profile.fullName} color={profile.avatarColor} src={profile.avatarUrl} size={88} />
          <div className="text-center">
            <h3 className="flex items-center justify-center gap-2 text-lg font-bold text-ink">
              {profile.fullName}
              {profile.status === 'away' && <StatusChip>Away</StatusChip>}
              {profile.status === 'busy' && <StatusChip>Busy</StatusChip>}
            </h3>
            <p className="mt-0.5 font-mono text-xs text-ink-3">@{profile.username}</p>
            <p className="mt-2 text-xs text-ink-2">{lastSeenText(profile.lastSeen, online)}</p>
            {profile.bio && <p className="mx-auto mt-2 max-w-60 text-sm text-ink-2">{profile.bio}</p>}
          </div>

          <div className="flex w-full flex-col gap-2">
            {profile.friendStatus === 'friends' && (
              <button
                type="button"
                onClick={message}
                className="flex items-center justify-center gap-2 rounded-full bg-accent py-2 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong"
              >
                <ChatTeardrop size={17} /> Message
              </button>
            )}
            {profile.friendStatus === 'none' && (
              <button
                type="button"
                disabled={busy}
                onClick={sendReq}
                className="flex items-center justify-center gap-2 rounded-full bg-accent py-2 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong disabled:opacity-60"
              >
                <UserPlus size={17} /> Add friend
              </button>
            )}
            {profile.friendStatus === 'sent' && (
              <p className="flex items-center justify-center gap-2 rounded-full bg-surface-2 py-2 text-sm font-medium text-ink-2">
                <Check size={17} className="text-ok" /> Request sent
              </p>
            )}
            {profile.friendStatus === 'incoming' && (
              <button
                type="button"
                disabled={busy}
                onClick={accept}
                className="flex items-center justify-center gap-2 rounded-full bg-accent py-2 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong disabled:opacity-60"
              >
                <Check size={17} /> Accept request
              </button>
            )}
            {profile.friendStatus === 'friends' && (
              <button
                type="button"
                onClick={unfriend}
                className="flex items-center justify-center gap-2 rounded-full py-2 text-sm font-medium text-danger transition hover:bg-danger/10"
              >
                <UserMinus size={17} /> Remove friend
              </button>
            )}
            {profile.friendStatus !== 'friends' && (
              <button
                type="button"
                onClick={message}
                className="flex items-center justify-center gap-2 rounded-full bg-surface-2 py-2 text-sm font-semibold text-ink transition hover:bg-line"
              >
                <ChatTeardrop size={17} /> Message
              </button>
            )}
            {profile.blocked ? (
              <button
                type="button"
                disabled={busy}
                onClick={toggleBlock}
                className="flex items-center justify-center gap-2 rounded-full py-2 text-sm font-medium text-ink-2 transition hover:bg-surface-2"
              >
                <Check size={17} /> Unblock user
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={toggleBlock}
                className="flex items-center justify-center gap-2 rounded-full py-2 text-sm font-medium text-danger transition hover:bg-danger/10"
              >
                <Prohibit size={17} /> Block user
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

function StatusChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-2">{children}</span>
  )
}

export function SearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<UserProfile[]>([])
  const [searched, setSearched] = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)
  const searchUsers = useChat((s) => s.searchUsers)
  const getUserProfile = useChat((s) => s.getUserProfile)
  const onlineMap = useChat((s) => s.online)

  useEffect(() => {
    if (!open) {
      setQ('')
      setResults([])
      setSearched(false)
      return
    }
  }, [open])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    const t = setTimeout(async () => {
      const users = await searchUsers(term).catch(() => [])
      const withStatus = await Promise.all(
        users.map(async (u): Promise<UserProfile> => {
          try {
            return await getUserProfile(u.id)
          } catch {
            return { ...u, friendStatus: 'none' }
          }
        })
      )
      setResults(withStatus)
      setSearched(true)
    }, 300)
    return () => clearTimeout(t)
  }, [q, searchUsers, getUserProfile])

  return (
    <>
      <Modal open={open} onClose={onClose} title="Find people">
        <div className="relative">
          <MagnifyingGlass size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or username"
            autoFocus
            className="field !pl-9 font-mono"
          />
        </div>
        <div className="mt-3 flex max-h-80 flex-col gap-1 overflow-y-auto">
          {searched && results.length === 0 && (
            <p className="py-8 text-center text-sm text-ink-3">No one found for “{q.trim()}”</p>
          )}
          {results.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setProfileId(u.id)}
              className="flex items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-surface-2"
            >
              <Avatar
                name={u.fullName}
                color={u.avatarColor}
                src={u.avatarUrl}
                size={42}
                online={onlineMap[u.id]}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{u.fullName}</span>
                <span className="block truncate font-mono text-xs text-ink-3">@{u.username}</span>
              </span>
              {u.friendStatus === 'friends' && <ChatTeardrop size={20} className="text-accent" />}
              {u.friendStatus === 'none' && <UserPlus size={20} className="text-ink-2" />}
              {u.friendStatus === 'sent' && <Check size={20} className="text-ok" />}
            </button>
          ))}
        </div>
      </Modal>
      <ProfileSheet userId={profileId} onClose={() => setProfileId(null)} />
    </>
  )
}
