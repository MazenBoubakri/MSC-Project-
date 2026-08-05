import { ChatCircleDots, X } from '@phosphor-icons/react'
import { useChat, type Toast } from '../store/chat'
import { useNavigate } from 'react-router-dom'

export default function Toasts() {
  const toasts = useChat((s) => s.toasts)
  const dismiss = useChat((s) => s.dismissToast)
  const navigate = useNavigate()

  return (
    <div className="pointer-events-none fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+16px)] z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={dismiss} onOpen={navigate} />
      ))}
    </div>
  )
}

function ToastCard({
  toast,
  onDismiss,
  onOpen,
}: {
  toast: Toast
  onDismiss: (id: string) => void
  onOpen: (path: string) => void
}) {
  const open = () => {
    if (toast.payload?.conversationId) onOpen(`/app/c/${toast.payload.conversationId}`)
  }
  return (
    <button
      type="button"
      onClick={open}
      className="animate-sheet-up pointer-events-auto flex w-full cursor-pointer items-start gap-3 rounded-xl bg-surface p-3 text-left shadow-lg ring-1 ring-line"
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
        <ChatCircleDots size={18} weight="fill" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{toast.title}</span>
        {toast.body && <span className="mt-0.5 block truncate text-xs text-ink-2">{toast.body}</span>}
      </span>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation()
          onDismiss(toast.id)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onDismiss(toast.id)
        }}
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
      >
        <X size={14} />
      </span>
    </button>
  )
}
