interface AvatarProps {
  name: string
  color: string
  src?: string | null
  size?: number
  online?: boolean
  className?: string
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export default function Avatar({ name, color, src, size = 40, online, className = '' }: AvatarProps) {
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      {src ? (
        <img
          src={src}
          alt={name}
          loading="lazy"
          className="size-full rounded-full object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <span
          className="flex size-full items-center justify-center rounded-full font-semibold text-white select-none"
          style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
        >
          {initials(name)}
        </span>
      )}
      {online !== undefined && (
        <span
          className={`absolute right-0 bottom-0 block rounded-full ring-2 ring-surface ${
            online ? 'bg-ok' : 'bg-ink-3'
          }`}
          style={{ width: Math.max(size * 0.28, 8), height: Math.max(size * 0.28, 8) }}
        />
      )}
    </span>
  )
}
