import { useEffect, useRef, useState } from 'react'
import { ArrowBendUpLeft, ArrowClockwise, Check, PencilSimple, Play, Pause, Trash, X } from '@phosphor-icons/react'
import Modal from './Modal'
import Avatar from './Avatar'
import { useChat, type MessageTarget } from '../store/chat'
import { useAuth } from '../store/auth'
import { formatTime } from '../lib/time'
import type { ClientMessage } from '../store/chat'

const REACTIONS = ['❤️', '😂', '👍', '😮', '😢', '🔥']

let currentAudio: HTMLAudioElement | null = null

function formatDur(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function MessageBubble({
  conversationId,
  roomId,
  message,
  highlight = false,
  senderName,
  onReply,
  onJumpToReply,
  roomMode = false,
  isLastInGroup = true,
  avatar = null,
}: {
  conversationId?: string
  roomId?: string
  message: ClientMessage
  highlight?: boolean
  /** shown above incoming bubbles in multi-member rooms (group-first only) */
  senderName?: string
  /** called when the user picks "Reply" on a message */
  onReply?: (message: ClientMessage) => void
  /** called when the quoted block is tapped; views implement scroll + highlight */
  onJumpToReply?: (messageId: string) => void
  /** room layout: incoming bubbles get a sender-avatar column */
  roomMode?: boolean
  /** only the last bubble of a group keeps the pointed corner */
  isLastInGroup?: boolean
  /** avatar shown next to every incoming message (DM peer or room sender) */
  avatar?: { name: string; color: string; src?: string | null } | null
}) {
  const meId = useChat((s) => s.meId)
  const me = useAuth((s) => s.user)
  const toggleReaction = useChat((s) => s.toggleReaction)
  const retryMessage = useChat((s) => s.retryMessage)
  const editMessage = useChat((s) => s.editMessage)
  const deleteMessage = useChat((s) => s.deleteMessage)
  const target: MessageTarget = roomId ? { roomId } : { conversationId: conversationId ?? '' }
  const mine = message.senderId === meId
  const [lightbox, setLightbox] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.body ?? '')
  const [retrying, setRetrying] = useState(false)

  const peerRead = message.readBy.some((r) => r !== meId)
  const mineReactions = message.reactions.filter((r) => r.user === meId)

  // one pill per emoji, with a counter for 2+ reactions from different people
  const reactionCounts = (() => {
    const counts = new Map<string, { count: number; mine: boolean }>()
    for (const r of message.reactions) {
      const entry = counts.get(r.emoji) ?? { count: 0, mine: false }
      entry.count += 1
      if (r.user === meId) entry.mine = true
      counts.set(r.emoji, entry)
    }
    return [...counts.entries()]
  })()

  // Preview line for the quoted block. Snapshots are frozen at send time, so
  // this shows the stored body ('Message deleted' when the snapshot is empty).
  const replyPreview = (() => {
    const r = message.replyTo
    if (!r) return ''
    if (r.mediaType === 'image') return 'Photo'
    if (r.mediaType === 'voice') return 'Voice message'
    return r.body || 'Message deleted'
  })()

  const retry = async () => {
    setRetrying(true)
    try {
      await retryMessage(target, message.id)
    } finally {
      setRetrying(false)
    }
  }

  const saveEdit = async () => {
    const ok = await editMessage(target, message.id, draft)
    if (ok) setEditing(false)
    setMenuOpen(false)
  }

  const remove = async () => {
    await deleteMessage(target, message.id)
    setMenuOpen(false)
  }

  // Deleted for everyone — tombstone shown to both sides.
  if (message.deleted) {
    return (
      <div className={`flex ${mine ? 'justify-end' : 'justify-start'} px-2`}>
        <div
          className={`rounded-bubble px-3.5 py-2 text-sm italic text-ink-3 ${
            mine ? 'rounded-br-md bg-bubble-out/60' : 'rounded-bl-md bg-bubble-in/60'
          }`}
        >
          Message deleted
          <span className="ml-2 text-[11px] not-italic">{formatTime(message.createdAt)}</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`animate-msg-in flex px-2 ${mine ? 'justify-end' : 'justify-start'} ${
        roomMode ? 'items-end gap-1.5' : ''
      }`}
    >
      {roomMode && !mine &&
        (avatar ? (
          <Avatar
            name={avatar.name}
            color={avatar.color}
            src={avatar.src}
            size={28}
            className="mb-0.5"
          />
        ) : (
          // keep every incoming bubble aligned with the avatar column
          <span className="size-7 shrink-0" />
        ))}
      <div className={`flex min-w-0 max-w-[78%] flex-col sm:max-w-[65%] ${mine ? 'items-end' : 'items-start'}`}>
        {!mine && senderName && (
          <span className="mb-0.5 ml-1.5 text-[11px] font-semibold text-ink-2">{senderName}</span>
        )}
        <div
          className={`relative rounded-bubble px-3.5 py-2 text-[15px] leading-snug shadow-sm ${
            mine
              ? `${isLastInGroup ? 'rounded-br-md' : ''} bg-bubble-out text-bubble-in`
              : `${isLastInGroup ? 'rounded-bl-md' : ''} bg-bubble-in text-ink`
          } ${message.pending ? 'opacity-60' : ''} ${message.failed ? 'ring-2 ring-danger/60' : ''} ${
            highlight ? 'ring-2 ring-accent' : ''
          }`}
          onClick={() => {
            if (mine) setMenuOpen((v) => !v)
            else setPickerOpen((v) => !v)
          }}
        >
          {editing ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                maxLength={160}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                className="field resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditing(false)
                    setMenuOpen(false)
                  }}
                  className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-ink-2 transition hover:bg-line"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!draft.trim()}
                  onClick={(e) => {
                    e.stopPropagation()
                    void saveEdit()
                  }}
                  className="flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-ink transition hover:bg-accent-strong disabled:opacity-60"
                >
                  <Check size={12} weight="bold" /> Save
                </button>
              </div>
            </div>
          ) : (
            <>
              {message.replyTo && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onJumpToReply?.(message.replyTo!.messageId)
                  }}
                  className={`mb-1.5 block w-full max-w-full rounded-md border-l-2 border-accent px-2 py-1.5 text-left transition hover:opacity-85 active:opacity-70 ${
                    mine ? 'bg-bubble-in/15' : 'bg-ink/5'
                  }`}
                >
                  <span
                    className={`block truncate text-[11px] font-semibold ${
                      mine ? 'text-bubble-in/80' : 'text-ink-2'
                    }`}
                  >
                    {message.replyTo.senderName}
                  </span>
                  <span
                    className={`block truncate text-xs ${
                      mine ? 'text-bubble-in/70' : 'text-ink-3'
                    }`}
                  >
                    {replyPreview}
                  </span>
                </button>
              )}

              {message.type === 'text' && message.body && (
                <p className="break-words whitespace-pre-wrap">{message.body}</p>
              )}

              {message.type === 'image' &&
                (message.mediaUrl ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setLightbox(true)
                    }}
                    className="block -m-1 overflow-hidden rounded-[14px]"
                  >
                    <img
                      src={message.mediaUrl}
                      alt="Attachment"
                      className="max-h-56 w-full max-w-72 rounded-[14px] object-cover sm:max-h-72"
                    />
                  </button>
                ) : (
                  <span className="flex h-28 w-52 items-center justify-center gap-2 text-sm opacity-80">
                    <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Uploading…
                  </span>
                ))}

              {message.type === 'voice' &&
                (message.mediaUrl ? (
                  <VoicePlayer src={message.mediaUrl} duration={message.duration ?? 0} mine={mine} />
                ) : (
                  <span className="flex h-10 w-40 items-center justify-center gap-2 text-sm opacity-80">
                    <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Uploading…
                  </span>
                ))}

              {/* reaction picker on tap (incoming) */}
              {pickerOpen && (
                <div
                  className="animate-fade-in absolute -bottom-11 left-0 z-20 flex items-center gap-0.5 rounded-full bg-surface px-1.5 py-1 shadow-lg ring-1 ring-line"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    aria-label="Reply"
                    onClick={() => {
                      onReply?.(message)
                      setPickerOpen(false)
                    }}
                    className="flex size-8 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-accent active:scale-95"
                  >
                    <ArrowBendUpLeft size={15} />
                  </button>
                  {REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        toggleReaction(target, message.id, emoji)
                        setPickerOpen(false)
                      }}
                      className={`flex size-8 items-center justify-center rounded-full text-lg transition hover:bg-surface-2 ${
                        mineReactions.some((r) => r.emoji === emoji) ? 'scale-110' : ''
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {/* action menu (own messages) */}
              {menuOpen && !message.pending && !message.failed && (
                <div
                  className="animate-fade-in absolute -bottom-11 right-0 z-20 flex items-center gap-0.5 rounded-full bg-surface px-1.5 py-1 shadow-lg ring-1 ring-line"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onReply?.(message)
                      setMenuOpen(false)
                    }}
                    className="flex size-8 items-center justify-center gap-1 rounded-full px-2 text-xs font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink active:scale-95"
                  >
                    <ArrowBendUpLeft size={14} /> Reply
                  </button>
                  {message.type === 'text' && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(true)
                        setMenuOpen(false)
                        setDraft(message.body ?? '')
                      }}
                      className="flex size-8 items-center justify-center gap-1 rounded-full px-2 text-xs font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink"
                    >
                      <PencilSimple size={14} /> Edit
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void remove()}
                    className="flex size-8 items-center justify-center gap-1 rounded-full px-2 text-xs font-medium text-danger transition hover:bg-danger/10"
                  >
                    <Trash size={14} /> Delete
                  </button>
                </div>
              )}

              {/* meta */}
              <span
                className={`mt-0.5 flex items-center justify-end gap-1 text-[11px] ${
                  mine ? 'text-bubble-in/70' : 'text-ink-3'
                }`}
              >
                {message.editedAt && <span className="italic">edited</span>}
                {formatTime(message.createdAt)}
                {message.pending && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
                {!message.pending && mine && !message.failed && (
                  <span className={peerRead ? 'font-semibold text-ok/90' : ''}>
                    {peerRead ? '✓✓' : '✓'}
                  </span>
                )}
              </span>
            </>
          )}
        </div>

        {message.failed && !message.pending && (
          <div className="mt-1 flex items-center gap-2 text-xs text-danger">
            <X size={12} weight="bold" />
            {message.error ?? 'Not delivered'}
            {message.type === 'text' && (
              <button
                type="button"
                disabled={retrying}
                onClick={retry}
                className="flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 font-medium transition hover:bg-danger/20 disabled:opacity-60"
              >
                <ArrowClockwise size={12} className={retrying ? 'animate-spin' : ''} /> Retry
              </button>
            )}
          </div>
        )}

        {!message.deleted && reactionCounts.length > 0 && (
          <div className={`mt-1 flex flex-wrap gap-1 ${mine ? 'justify-end' : 'justify-start'}`}>
            {reactionCounts.map(([emoji, { count, mine: mineReacted }]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => toggleReaction(target, message.id, emoji)}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs shadow-sm ring-1 transition ${
                  mineReacted ? 'bg-accent-soft ring-accent/40' : 'bg-surface ring-line hover:bg-surface-2'
                }`}
              >
                {emoji}
                {count > 1 && (
                  <span className={`text-[10px] font-semibold ${mineReacted ? 'text-accent' : 'text-ink-2'}`}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <Modal open={lightbox} onClose={() => setLightbox(false)} width="max-w-2xl">
          {message.mediaUrl && (
            <img
              src={message.mediaUrl}
              alt="Attachment"
              className="max-h-[80dvh] w-full rounded-xl object-contain"
            />
          )}
        </Modal>
      </div>

      {roomMode && mine && me && (
        <Avatar name={me.fullName} color={me.avatarColor} src={me.avatarUrl} size={28} className="mb-0.5" />
      )}
    </div>
  )
}

function VoicePlayer({ src, duration, mine }: { src: string; duration: number; mine: boolean }) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const audio = new Audio(src)
    audio.preload = 'metadata'
    const onTime = () => setProgress(audio.currentTime / (audio.duration || duration || 1))
    const onEnd = () => {
      setPlaying(false)
      setProgress(0)
    }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnd)
    audioRef.current = audio
    return () => {
      audio.pause()
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnd)
    }
  }, [src, duration])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
      return
    }
    if (currentAudio && currentAudio !== audio) {
      currentAudio.pause()
      currentAudio.dispatchEvent(new Event('ended'))
    }
    void audio.play()
    currentAudio = audio
    setPlaying(true)
  }

  return (
    <div className="flex min-w-40 items-center gap-2.5 sm:min-w-52">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className={`flex size-9 shrink-0 items-center justify-center rounded-full transition ${
          mine
            ? 'bg-bubble-in/20 text-bubble-in hover:bg-bubble-in/30'
            : 'bg-accent-soft text-accent hover:bg-accent-soft/70'
        }`}
      >
        {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
          <div
            className={`h-full rounded-full ${mine ? 'bg-bubble-in/70' : 'bg-accent'}`}
            style={{ width: `${Math.max(progress * 100, 4)}%` }}
          />
        </div>
        <p className={`mt-1 text-[11px] ${mine ? 'text-bubble-in/70' : 'text-ink-3'}`}>
          {formatDur(progress * (duration || 0) || duration)}
        </p>
      </div>
    </div>
  )
}
