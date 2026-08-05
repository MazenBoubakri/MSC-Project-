// Selectable conversation background patterns. Pure CSS (gradients) so they
// adapt to light/dark theme via the --ink token; no image assets.
// Choice is persisted per device under 'mazentalk.wallpaper'.

export interface Wallpaper {
  id: string
  name: string
  /** css class applied to the chat scroll container; '' = plain background */
  className: string
}

export const WALLPAPERS: Wallpaper[] = [
  { id: 'none', name: 'Plain', className: '' },
  { id: 'dots', name: 'Dots', className: 'wp-dots' },
  { id: 'lines', name: 'Lines', className: 'wp-lines' },
  { id: 'grid', name: 'Grid', className: 'wp-grid' },
  { id: 'ripples', name: 'Ripples', className: 'wp-ripples' },
  { id: 'bubbles', name: 'Bubbles', className: 'wp-bubbles' },
]

const KEY = 'mazentalk.wallpaper'

export function getWallpaperId(): string {
  const v = localStorage.getItem(KEY)
  return WALLPAPERS.some((w) => w.id === v) ? (v as string) : 'none'
}

export function setWallpaperId(id: string) {
  localStorage.setItem(KEY, id)
}

export function wallpaperClass(id: string): string {
  return WALLPAPERS.find((w) => w.id === id)?.className ?? ''
}
