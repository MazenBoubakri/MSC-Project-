export function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function formatListTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return formatTime(iso)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatDayDivider(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

export function lastSeenText(lastSeen: string | null, online: boolean): string {
  if (online) return 'Active now'
  if (!lastSeen) return 'Offline'
  const diff = Date.now() - new Date(lastSeen).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Active now'
  if (mins < 60) return `Active ${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Active ${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Active yesterday'
  return `Active ${new Date(lastSeen).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

export function isSameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

/** WhatsApp-style grouping: same sender, same day, within 5 minutes. */
export function isSameGroup(
  a: { senderId: string; createdAt: string },
  b: { senderId: string; createdAt: string }
): boolean {
  if (a.senderId !== b.senderId) return false
  if (!isSameDay(a.createdAt, b.createdAt)) return false
  return Math.abs(new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) < 5 * 60_000
}
