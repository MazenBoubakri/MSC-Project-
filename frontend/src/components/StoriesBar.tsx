import { Plus } from '@phosphor-icons/react'
import Avatar from './Avatar'
import { useChat } from '../store/chat'

interface StoriesBarProps {
  onCreate: () => void
  onOpenUser: (userId: string) => void
}

export default function StoriesBar({ onCreate, onOpenUser }: StoriesBarProps) {
  const meId = useChat((s) => s.meId)
  const stories = useChat((s) => s.stories)

  if (stories.length === 0) {
    return (
      <div className="px-4 pb-2">
        <button
          type="button"
          onClick={onCreate}
          className="flex w-full items-center gap-2 rounded-input bg-surface-2 px-3.5 py-2 text-sm font-medium text-ink-2 transition hover:bg-line hover:text-ink"
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-accent text-accent-ink">
            <Plus size={13} weight="bold" />
          </span>
          Add to your story
        </button>
      </div>
    )
  }

  return (
    <div className="flex gap-3 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        onClick={onCreate}
        aria-label="Add to your story"
        className="group flex shrink-0 flex-col items-center gap-1"
      >
        <span className="flex size-13 items-center justify-center rounded-full border-2 border-dashed border-line transition group-hover:border-ink-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-accent transition group-hover:bg-accent-soft">
            <Plus size={16} weight="bold" />
          </span>
        </span>
        <span className="text-[11px] text-ink-3">Your story</span>
      </button>
      {stories.map((g) => {
        const mine = g.user.id === meId
        const hasUnseen = !mine && g.stories.some((st) => !st.viewed)
        return (
          <button
            key={g.user.id}
            type="button"
            onClick={() => onOpenUser(g.user.id)}
            className="group flex shrink-0 flex-col items-center gap-1"
          >
            <span
              className={`flex items-center justify-center rounded-full p-0.5 transition group-hover:opacity-85 ${
                hasUnseen ? 'bg-gradient-to-tr from-amber-400 via-fuchsia-500 to-accent' : 'bg-line'
              }`}
            >
              <span className="flex items-center justify-center rounded-full bg-surface p-0.5">
                <Avatar name={g.user.fullName} color={g.user.avatarColor} src={g.user.avatarUrl} size={44} />
              </span>
            </span>
            <span className={`max-w-16 truncate text-[11px] ${mine ? 'font-semibold text-accent' : 'text-ink-3'}`}>
              {g.user.fullName.split(' ')[0]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
