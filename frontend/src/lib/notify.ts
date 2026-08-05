// Best-effort desktop notifications (Web Notification API) for when the tab
// is hidden. Opt-in via Settings; permission requested on enable.

const PREF_KEY = 'mazentalk.notif'

export function isDesktopNotifEnabled(): boolean {
  return localStorage.getItem(PREF_KEY) === 'on'
}

export function setDesktopNotifEnabled(on: boolean) {
  localStorage.setItem(PREF_KEY, on ? 'on' : 'off')
  if (on) void requestNotifPermission()
}

export async function requestNotifPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

/** Fire a notification only when the tab is hidden and the pref is on. */
export function notifyMessage(title: string, body: string) {
  if (!isDesktopNotifEnabled()) return
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  if (!document.hidden) return
  try {
    new Notification(title, { body, tag: 'mazentalk-message' })
  } catch {
    // some browsers require a service worker — best effort
  }
}
