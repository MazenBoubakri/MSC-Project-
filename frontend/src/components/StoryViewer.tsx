import { useCallback, useEffect, useRef, useState } from 'react'
import { CaretLeft, CaretRight, Eye, Heart, SpinnerGap, Trash, X } from '@phosphor-icons/react'
import Avatar from './Avatar'
import Modal from './Modal'
import { useChat } from '../store/chat'
import { formatListTime } from '../lib/time'
import type { StoryViewer as StoryViewerEntry } from '../lib/types'

const STORY_MS = 5000

interface StoryViewerProps {
  ownerId: string
  onClose: () => void
}

export default function StoryViewer({ ownerId, onClose }: StoryViewerProps) {
  const meId = useChat((s) => s.meId)
  const stories = useChat((s) => s.stories)
  const markStorySeen = useChat((s) => s.markStorySeen)
  const deleteStory = useChat((s) => s.deleteStory)
  const fetchStoryViewers = useChat((s) => s.fetchStoryViewers)
  const toggleStoryReact = useChat((s) => s.toggleStoryReact)

  const group = stories.find((g) => g.user.id === ownerId)
  const [index, setIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [viewersOpen, setViewersOpen] = useState(false)
  const [viewers, setViewers] = useState<StoryViewerEntry[] | null>(null)
  const holdRef = useRef<{ x: number; startedAt: number; timer: ReturnType<typeof setTimeout> | null } | null>(null)

  const count = group?.stories.length ?? 0
  const story = group?.stories[Math.min(index, count - 1)]

  const goNext = useCallback(() => {
    if (index + 1 < count) {
      setIndex(index + 1)
      setProgress(0)
    } else {
      onClose()
    }
  }, [index, count, onClose])

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1))
    setProgress(0)
  }, [])

  // autoplay
  useEffect(() => {
    if (paused || viewersOpen || !story) return
    const startedAt = Date.now() - progress
    const timer = setInterval(() => {
      const p = Date.now() - startedAt
      setProgress(p)
      if (p >= STORY_MS) goNext()
    }, 100)
    return () => clearInterval(timer)
  }, [paused, story, index, goNext, progress, viewersOpen])

  // mark as seen whenever the active story changes (not for own stories)
  useEffect(() => {
    if (story && story.ownerId !== meId) markStorySeen(story.id)
  }, [story?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // clamp the index if stories were removed (e.g. own story deleted)
  useEffect(() => {
    if (group && index >= group.stories.length) {
      setIndex(Math.max(0, group.stories.length - 1))
      setProgress(0)
    }
  }, [group, index])

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, onClose])

  if (!group || !story) return null

  const isMine = story.ownerId === meId

  const onPointerDown = (e: React.PointerEvent) => {
    holdRef.current = {
      x: e.clientX,
      startedAt: Date.now(),
      timer: setTimeout(() => setPaused(true), 250),
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const hold = holdRef.current
    holdRef.current = null
    if (!hold) return
    if (hold.timer !== null) clearTimeout(hold.timer)
    if (paused) {
      setPaused(false)
      return
    }
    if (Date.now() - hold.startedAt > 200) return // was a long-press pause
    const w = e.currentTarget.clientWidth
    if (e.clientX < w * 0.3) goPrev()
    else if (e.clientX > w * 0.7) goNext()
    else setPaused(true)
  }

  const openViewers = async () => {
    if (!story) return
    setViewersOpen(true)
    setViewers(null)
    try {
      setViewers(await fetchStoryViewers(story.id))
    } catch {
      setViewers([])
    }
  }

  const stopPointer = (e: React.SyntheticEvent) => e.stopPropagation()

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 select-none bg-black"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        holdRef.current = null
        setPaused(false)
      }}
      role="dialog"
      aria-modal="true"
    >
      {/* progress segments */}
      <div className="absolute inset-x-0 top-0 z-10 flex gap-1 p-3">
        {group.stories.map((s, i) => (
          <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white transition-[width] duration-100 ease-linear"
              style={{ width: i < index ? '100%' : i > index ? '0%' : `${(progress / STORY_MS) * 100}%` }}
            />
          </div>
        ))}
      </div>

      {/* header */}
      <div className="absolute inset-x-0 top-4 z-10 flex items-center gap-2.5 px-4">
        <Avatar name={group.user.fullName} color={group.user.avatarColor} src={group.user.avatarUrl} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{group.user.fullName}</p>
          <p className="text-xs text-white/60">{formatListTime(story.createdAt)}</p>
        </div>
        {isMine && (
          <button
            type="button"
            aria-label="Who viewed this story"
            onClick={(e) => {
              e.stopPropagation()
              void openViewers()
            }}
            onPointerDown={stopPointer}
            onPointerUp={stopPointer}
            className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-white/25"
          >
            <Eye size={14} /> {story.viewCount}
          </button>
        )}
        {isMine && (
          <span
            className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white"
          >
            <Heart size={13} weight="fill" className="text-rose-400" /> {story.reactionCount}
          </span>
        )}
        {isMine && (
          <button
            type="button"
            aria-label="Delete story"
            onClick={(e) => {
              e.stopPropagation()
              void deleteStory(story.id)
            }}
            onPointerDown={stopPointer}
            onPointerUp={stopPointer}
            className="flex size-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            <Trash size={17} />
          </button>
        )}
        <button
          type="button"
          aria-label="Close"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          onPointerDown={stopPointer}
          onPointerUp={stopPointer}
          className="flex size-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
        >
          <X size={19} />
        </button>
      </div>

      {/* media */}
      <div className="flex h-full items-center justify-center px-14">
        <img
          src={story.mediaUrl}
          alt="Story"
          className="max-h-full max-w-full object-contain"
          draggable={false}
        />
      </div>

      {story.caption && (
        <p className="absolute inset-x-0 bottom-20 px-6 text-center text-sm text-white drop-shadow">{story.caption}</p>
      )}

      {!isMine && (
        <button
          type="button"
          aria-label={story.reacted ? 'Remove reaction' : 'Like this story'}
          onClick={(e) => {
            e.stopPropagation()
            toggleStoryReact(story.id)
          }}
          onPointerDown={stopPointer}
          onPointerUp={stopPointer}
          className="absolute right-4 bottom-4 z-10 flex size-12 items-center justify-center rounded-full transition active:scale-90"
        >
          <Heart
            key={`${story.id}-${story.reacted}`}
            size={30}
            weight={story.reacted ? 'fill' : 'regular'}
            className={story.reacted ? 'animate-heart-pop text-rose-500' : 'text-white/90 drop-shadow'}
          />
        </button>
      )}

      {/* nav hit zones */}
      <button
        type="button"
        aria-label="Previous story"
        onClick={(e) => {
          e.stopPropagation()
          goPrev()
        }}
        onPointerDown={stopPointer}
        onPointerUp={stopPointer}
        className="absolute top-1/2 left-2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <CaretLeft size={20} />
      </button>
      <button
        type="button"
        aria-label="Next story"
        onClick={(e) => {
          e.stopPropagation()
          goNext()
        }}
        onPointerDown={stopPointer}
        onPointerUp={stopPointer}
        className="absolute top-1/2 right-2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <CaretRight size={20} />
      </button>

      {/* seen-by sheet */}
      <div onPointerDown={stopPointer} onPointerUp={stopPointer}>
        <Modal
          open={viewersOpen}
          onClose={() => setViewersOpen(false)}
          title={`Seen by ${story.viewCount}`}
          width="max-w-sm"
        >
          {viewers === null ? (
            <div className="flex justify-center py-8">
              <SpinnerGap size={22} className="animate-spin text-ink-3" />
            </div>
          ) : viewers.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-3">No one has seen this story yet.</p>
          ) : (
            <ul className="flex max-h-[50dvh] flex-col gap-1 overflow-y-auto">
              {viewers.map((v) => (
                <li key={v.user.id} className="flex items-center gap-3 rounded-xl p-2">
                  <Avatar name={v.user.fullName} color={v.user.avatarColor} src={v.user.avatarUrl} size={36} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{v.user.fullName}</span>
                  <span className="shrink-0 text-xs text-ink-3">{formatListTime(v.seenAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      </div>
    </div>
  )
}
