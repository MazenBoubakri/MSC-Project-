import { useCallback, useEffect, useRef, useState } from 'react'
import { CaretLeft, CaretRight, Eye, Trash, X } from '@phosphor-icons/react'
import Avatar from './Avatar'
import { useChat } from '../store/chat'
import { formatListTime } from '../lib/time'

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

  const group = stories.find((g) => g.user.id === ownerId)
  const [index, setIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
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
    if (paused || !story) return
    const startedAt = Date.now() - progress
    const timer = setInterval(() => {
      const p = Date.now() - startedAt
      setProgress(p)
      if (p >= STORY_MS) goNext()
    }, 100)
    return () => clearInterval(timer)
  }, [paused, story, index, goNext, progress])

  // mark as seen whenever the active story changes
  useEffect(() => {
    if (story) markStorySeen(story.id)
  }, [story?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
          <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white">
            <Eye size={14} /> {story.viewCount}
          </span>
        )}
        {isMine && (
          <button
            type="button"
            aria-label="Delete story"
            onClick={() => {
              void deleteStory(story.id)
              if (count <= 1) onClose()
            }}
            className="flex size-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            <Trash size={17} />
          </button>
        )}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
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
        <p className="absolute inset-x-0 bottom-8 px-6 text-center text-sm text-white drop-shadow">{story.caption}</p>
      )}

      {/* nav hit zones */}
      <button
        type="button"
        aria-label="Previous story"
        onClick={(e) => {
          e.stopPropagation()
          goPrev()
        }}
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
        className="absolute top-1/2 right-2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <CaretRight size={20} />
      </button>
    </div>
  )
}
