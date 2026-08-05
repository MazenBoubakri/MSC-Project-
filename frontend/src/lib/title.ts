// document.title unread badge, gated by the user preference.

const PREF_KEY = 'mazentalk.titlebadge'
const BASE_TITLE = 'MazenTalk'

export function isTitleBadgeEnabled(): boolean {
  return localStorage.getItem(PREF_KEY) !== 'off'
}

export function setTitleBadgeEnabled(enabled: boolean): void {
  localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off')
}

export function applyUnreadTitle(unread: number): void {
  const next = isTitleBadgeEnabled() && unread > 0 ? `(${unread > 99 ? '99+' : unread}) ${BASE_TITLE}` : BASE_TITLE
  if (document.title !== next) document.title = next
}
