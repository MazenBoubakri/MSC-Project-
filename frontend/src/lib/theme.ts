// Theme handling shared by boot (main.tsx) and the settings page. Stored in
// localStorage under 'mazechat.theme'; values: 'light' | 'dark' | 'system'.

export type ThemeMode = 'light' | 'dark' | 'system'

const THEME_KEY = 'mazechat.theme'

export function getStoredTheme(): ThemeMode {
  const v = localStorage.getItem(THEME_KEY)
  return v === 'dark' || v === 'light' || v === 'system' ? v : 'system'
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyTheme(theme: ThemeMode) {
  const dark = theme === 'dark' || (theme === 'system' && systemPrefersDark())
  document.documentElement.classList.toggle('dark', dark)
}

export function setStoredTheme(theme: ThemeMode) {
  localStorage.setItem(THEME_KEY, theme)
  applyTheme(theme)
}

/** Apply the stored theme immediately at startup, before first paint. */
export function initTheme() {
  applyTheme(getStoredTheme())
}
