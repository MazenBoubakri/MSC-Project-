import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Bell,
  GearSix,
  Moon,
  Palette,
  SignOut,
  Sun,
  UserCircle,
  Wall,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import Avatar from '../components/Avatar'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { isSoundEnabled, setSoundEnabled } from '../lib/sound'
import { isTitleBadgeEnabled, setTitleBadgeEnabled } from '../lib/title'
import { isDesktopNotifEnabled, setDesktopNotifEnabled } from '../lib/notify'
import { getStoredTheme, setStoredTheme, type ThemeMode } from '../lib/theme'
import { WALLPAPERS, getWallpaperId, setWallpaperId } from '../lib/wallpapers'
import type { UserStatus } from '../lib/types'

const STATUS_LABEL: Record<UserStatus, { label: string; className: string }> = {
  available: { label: 'Available', className: 'bg-ok/10 text-ok' },
  away: { label: 'Away', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  busy: { label: 'Busy', className: 'bg-danger/10 text-danger' },
}

export default function SettingsPage() {
  const user = useAuth((s) => s.user)
  const logout = useAuth((s) => s.logout)
  const destroySocket = useChat((s) => s.destroySocket)
  const chatReset = useChat((s) => s.reset)
  const navigate = useNavigate()

  const [sound, setSound] = useState(isSoundEnabled)
  const [titleBadge, setTitleBadge] = useState(isTitleBadgeEnabled)
  const [desktopNotif, setDesktopNotif] = useState(isDesktopNotifEnabled)
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme)
  const [wallpaper, setWallpaper] = useState(getWallpaperId)
  const [confirming, setConfirming] = useState(false)
  const disarmTimer = useRef<number | null>(null)

  useEffect(() => {
    setStoredTheme(theme)
  }, [theme])

  useEffect(() => {
    return () => {
      if (disarmTimer.current !== null) clearTimeout(disarmTimer.current)
    }
  }, [])

  const toggleSound = (v: boolean) => {
    setSound(v)
    setSoundEnabled(v)
  }

  const toggleTitleBadge = (v: boolean) => {
    setTitleBadge(v)
    setTitleBadgeEnabled(v)
  }

  const toggleDesktopNotif = (v: boolean) => {
    setDesktopNotif(v)
    setDesktopNotifEnabled(v)
  }

  const pickWallpaper = (id: string) => {
    setWallpaper(id)
    setWallpaperId(id)
  }

  const doSignOut = () => {
    if (!confirming) {
      setConfirming(true)
      disarmTimer.current = window.setTimeout(() => setConfirming(false), 4000)
      return
    }
    if (disarmTimer.current !== null) clearTimeout(disarmTimer.current)
    destroySocket()
    chatReset()
    logout()
    navigate('/', { replace: true })
  }

  if (!user) return null

  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : null
  const status = STATUS_LABEL[user.status] ?? STATUS_LABEL.available

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-canvas pb-[calc(env(safe-area-inset-bottom)+24px)]">
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 pt-[calc(env(safe-area-inset-top)+10px)] pb-2.5 lg:pt-2.5">
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate('/app')}
          className="flex size-10 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink lg:size-9"
        >
          <ArrowLeft size={20} />
        </button>
        <p className="text-sm font-bold text-ink">Settings</p>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <Section label="Notifications" icon={Bell}>
          <SettingRow
            title="Play sound for new messages"
            body="A short pop when a message arrives while you are not looking at that chat."
          >
            <Switch checked={sound} label="Play sound for new messages" onChange={toggleSound} />
          </SettingRow>
          <SettingRow
            title="Unread badge in tab title"
            body="Show the number of unread messages next to the app name in your browser tab."
          >
            <Switch checked={titleBadge} label="Show unread badge in tab title" onChange={toggleTitleBadge} />
          </SettingRow>
          <SettingRow
            title="Desktop notifications"
            body="Show a system notification when a message arrives while this tab is hidden."
          >
            <Switch checked={desktopNotif} label="Desktop notifications" onChange={toggleDesktopNotif} />
          </SettingRow>
        </Section>

        <Section label="Appearance" icon={Palette}>
          <SettingRow
            title="Theme"
            body="Switches between light and dark appearance on this device."
          >
            <div className="flex shrink-0 rounded-full bg-surface-2 p-1">
              {(
                [
                  ['light', 'Light', Sun],
                  ['dark', 'Dark', Moon],
                  ['system', 'System', GearSix],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTheme(key)}
                  aria-pressed={theme === key}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition lg:px-3.5 ${
                    theme === key ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
          </SettingRow>
        </Section>

        <Section label="Conversation" icon={Wall}>
          <div className="px-4 py-4">
            <p className="text-sm font-semibold text-ink">Chat wallpaper</p>
            <p className="mt-0.5 max-w-sm text-xs leading-relaxed text-ink-2">
              A subtle pattern behind your messages. Plain keeps the clean background.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {WALLPAPERS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  aria-label={`Wallpaper: ${w.name}`}
                  aria-pressed={wallpaper === w.id}
                  onClick={() => pickWallpaper(w.id)}
                  className={`flex flex-col items-center gap-1 rounded-xl p-1.5 transition hover:scale-105 active:scale-95 ${
                    wallpaper === w.id ? 'bg-accent-soft ring-2 ring-accent' : 'ring-1 ring-line hover:bg-surface-2'
                  }`}
                >
                  <span className={`chat-bg block size-11 rounded-lg ring-1 ring-line lg:size-12 ${w.className}`} />
                  <span className="text-[10px] font-medium text-ink-2">{w.name}</span>
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section label="Account" icon={UserCircle}>
          <div className="flex items-center gap-4 px-4 py-4">
            <Avatar name={user.fullName} color={user.avatarColor} src={user.avatarUrl} size={64} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-bold text-ink">{user.fullName}</p>
                <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>
                  <span className="size-1.5 rounded-full bg-current" />
                  {status.label}
                </span>
              </div>
              <p className="truncate font-mono text-xs text-ink-3">@{user.username}</p>
              {user.bio && <p className="mt-1 truncate text-xs text-ink-2">{user.bio}</p>}
              {memberSince && <p className="mt-1 text-[11px] text-ink-3">Member since {memberSince}</p>}
            </div>
            <button
              type="button"
              onClick={() => navigate('/app/profile')}
              className="press shrink-0 rounded-full bg-surface-2 px-4 py-2 text-xs font-semibold text-ink transition hover:bg-line"
            >
              Edit profile
            </button>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-line px-4 py-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Sign out</p>
              <p className="mt-0.5 text-xs text-ink-2">Ends this session on this device.</p>
            </div>
            <button
              type="button"
              onClick={doSignOut}
              className={`press flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition ${
                confirming
                  ? 'bg-danger text-white hover:bg-danger/90'
                  : 'bg-danger/10 text-danger hover:bg-danger/20'
              }`}
            >
              <SignOut size={14} weight="bold" />
              {confirming ? 'Confirm sign out?' : 'Sign out'}
            </button>
          </div>
        </Section>
      </div>
    </div>
  )
}

function Section({
  label,
  icon: Icon,
  danger = false,
  children,
}: {
  label: string
  icon: Icon
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="mb-8">
      <h2 className={`mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase ${danger ? 'text-danger' : 'text-ink-3'}`}>
        <Icon size={14} />
        {label}
      </h2>
      <div
        className={`divide-y divide-line overflow-hidden rounded-2xl bg-surface ring-1 ${
          danger ? 'ring-danger/25' : 'ring-line'
        }`}
      >
        {children}
      </div>
    </section>
  )
}

function SettingRow({
  title,
  body,
  children,
}: {
  title: string
  body: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 max-w-sm text-xs leading-relaxed text-ink-2">{body}</p>
      </div>
      {children}
    </div>
  )
}

function Switch({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-accent' : 'bg-surface-2 ring-1 ring-inset ring-line'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-150 ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  )
}
