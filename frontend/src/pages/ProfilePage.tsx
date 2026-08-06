import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Camera, Check, ImageSquare, Moon, SignOut, Sun } from '@phosphor-icons/react'
import Avatar from '../components/Avatar'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import type { UserStatus } from '../lib/types'

const STATUSES: { key: UserStatus; label: string }[] = [
  { key: 'available', label: 'Available' },
  { key: 'away', label: 'Away' },
  { key: 'busy', label: 'Busy' },
]

export default function ProfilePage() {
  const { user, updateProfile, uploadAvatar, logout } = useAuth()
  const destroySocket = useChat((s) => s.destroySocket)
  const chatReset = useChat((s) => s.reset)
  const navigate = useNavigate()

  const [fullName, setFullName] = useState(user?.fullName ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [status, setStatus] = useState<UserStatus>(user?.status ?? 'available')
  const [dark, setDark] = useState(() => localStorage.getItem('mazechat.theme') === 'dark')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false)
  const avatarRef = useRef<HTMLDivElement | null>(null)
  const cameraRef = useRef<HTMLInputElement | null>(null)
  const galleryRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) setAvatarMenuOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [])

  const onAvatarPick = (source: 'camera' | 'gallery') => {
    setAvatarMenuOpen(false)
    ;(source === 'camera' ? cameraRef : galleryRef).current?.click()
  }

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('mazechat.theme', next ? 'dark' : 'light')
  }

  const save = async () => {
    setError(null)
    setSaved(false)
    setBusy(true)
    try {
      await updateProfile({
        fullName: fullName.trim() || undefined,
        username: username.trim().toLowerCase() || undefined,
        bio: bio.trim() || undefined,
        status,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  const doLogout = () => {
    destroySocket()
    chatReset()
    logout()
    navigate('/', { replace: true })
  }

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await uploadAvatar(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Avatar upload failed')
    } finally {
      setBusy(false)
    }
  }

  if (!user) return null

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
        <p className="text-sm font-bold text-ink">My profile</p>
      </header>

      <div className="mx-auto w-full max-w-md flex-1 px-4 py-6">
        <div className="flex flex-col items-center gap-3">
          <div className="relative" ref={avatarRef}>
            <button
              type="button"
              aria-label="Change avatar"
              onClick={() => setAvatarMenuOpen((v) => !v)}
              className="block cursor-pointer rounded-full ring-2 ring-transparent transition hover:ring-accent"
            >
              <Avatar name={user.fullName} color={user.avatarColor} src={user.avatarUrl} size={96} />
            </button>
            {avatarMenuOpen && (
              <div className="animate-fade-in absolute top-full left-1/2 z-30 mt-2 w-48 -translate-x-1/2 overflow-hidden rounded-xl bg-surface py-1 shadow-xl ring-1 ring-line">
                <button
                  type="button"
                  onClick={() => onAvatarPick('camera')}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-ink transition hover:bg-surface-2"
                >
                  <Camera size={16} /> Take a photo
                </button>
                <button
                  type="button"
                  onClick={() => onAvatarPick('gallery')}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-ink transition hover:bg-surface-2"
                >
                  <ImageSquare size={16} /> Choose from gallery
                </button>
              </div>
            )}
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pickAvatar(e.target.files?.[0])} />
          <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickAvatar(e.target.files?.[0])} />
          <p className="text-xs text-ink-3">Tap the avatar to change your photo</p>
        </div>

        <div className="mt-6 flex flex-col gap-4">
          <Field label="Full name">
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={50}
              className="field"
            />
          </Field>

          <Field label="Username">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              pattern="[a-z0-9_]{3,20}"
              title="3-20 characters: letters, numbers, underscores"
              className="field font-mono"
            />
          </Field>

          <Field label="About">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={160}
              rows={2}
              placeholder="Say something about yourself…"
              className="field resize-none"
            />
            <span className="self-end text-[11px] text-ink-3">{bio.length}/160</span>
          </Field>

          <Field label="Status">
            <div className="flex gap-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStatus(s.key)}
                  className={`flex-1 rounded-full py-2 text-sm font-medium transition ${
                    status === s.key ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink-2 hover:bg-line hover:text-ink'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Appearance">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center justify-between rounded-input bg-surface-2 px-4 py-2.5 text-sm text-ink transition hover:bg-line"
            >
              <span className="flex items-center gap-2.5">
                {dark ? <Moon size={17} /> : <Sun size={17} />}
                {dark ? 'Dark mode' : 'Light mode'}
              </span>
              <span className="text-ink-3">Tap to switch</span>
            </button>
          </Field>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="flex items-center justify-center gap-2 rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong disabled:opacity-60"
          >
            {saved ? <Check size={17} /> : null}
            {busy ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
          </button>

          <button
            type="button"
            onClick={doLogout}
            className="flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-medium text-danger transition hover:bg-danger/10"
          >
            <SignOut size={17} /> Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-2">{label}</span>
      {children}
    </label>
  )
}
