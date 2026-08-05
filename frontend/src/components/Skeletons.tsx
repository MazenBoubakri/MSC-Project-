// Skeleton loaders that mirror the shape of the lists they replace.

export function SidebarListSkeleton() {
  return (
    <div className="flex flex-col gap-0.5 px-2" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl p-2.5">
          <span className="size-10 shrink-0 animate-pulse rounded-full bg-surface-2" />
          <span className="min-w-0 flex-1">
            <span className="block h-3 w-1/2 animate-pulse rounded-full bg-surface-2" />
            <span className="mt-2 block h-2.5 w-3/4 animate-pulse rounded-full bg-surface-2/70" />
          </span>
        </div>
      ))}
    </div>
  )
}

export function MessageListSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4" aria-hidden>
      {Array.from({ length: 7 }).map((_, i) => {
        const left = i % 3 !== 0
        return (
          <div key={i} className={`flex ${left ? 'justify-start' : 'justify-end'}`}>
            <span
              className={`animate-pulse rounded-bubble px-3.5 py-2 ${
                left ? 'rounded-bl-md bg-surface-2' : 'rounded-br-md bg-surface-2/70'
              }`}
              style={{ width: left ? `${Math.min(48 + i * 7, 72)}%` : '38%', maxWidth: 260 }}
            />
          </div>
        )
      })}
    </div>
  )
}
