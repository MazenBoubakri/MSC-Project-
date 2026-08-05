import type { Icon } from '@phosphor-icons/react'

interface EmptyStateProps {
  icon: Icon
  title: string
  body?: string
  action?: React.ReactNode
}

export default function EmptyState({ icon: Icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="animate-fade-in flex flex-col items-center gap-1.5 px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon size={22} weight="fill" />
      </span>
      <p className="mt-2 text-sm font-semibold text-ink">{title}</p>
      {body && <p className="max-w-56 text-xs leading-relaxed text-ink-2">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
