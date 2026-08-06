import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Eye,
  EyeSlash,
  Hash,
  LockKey,
  Microphone,
  PaperPlaneTilt,
  SignIn,
  UserPlus,
  UsersThree,
} from '@phosphor-icons/react'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import Avatar from '../components/Avatar'
import TypingBubble from '../components/TypingBubble'

const COLORS = ['#2B5CFF', '#7C3AED', '#DB2777', '#EA580C', '#059669', '#0EA5E9', '#DC2626', '#18181B']

type Mode = 'create' | 'signin'

const FEATURES = [
  {
    icon: PaperPlaneTilt,
    title: 'Direct messages',
    body: 'Read receipts and typing indicators, delivered instantly.',
  },
  {
    icon: UsersThree,
    title: 'Chat rooms',
    body: 'Create a room for the crew and drop in whenever you like.',
  },
  {
    icon: Microphone,
    title: 'Voice notes and photos',
    body: 'Record a note or share a picture in one tap.',
  },
  {
    icon: LockKey,
    title: 'Private by default',
    body: 'Passwords are stored as scrypt hashes, never in plain text.',
  },
]

export default function Welcome() {
  const navigate = useNavigate()
  const { user, ready, register, login, uploadAvatar } = useAuth()
  const initSocket = useChat((s) => s.initSocket)

  const [mode, setMode] = useState<Mode>('create')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [color, setColor] = useState(COLORS[0])
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (ready && user) {
      initSocket()
      navigate('/app', { replace: true })
    }
  }, [ready, user, navigate, initSocket])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (mode === 'create') {
      if (password.length < 8) {
        setError('Password must be at least 8 characters')
        return
      }
      if (password !== confirm) {
        setError('Passwords do not match')
        return
      }
    }
    setBusy(true)
    try {
      if (mode === 'create') {
        await register({ username, fullName, password, avatarColor: color })
        if (avatarFile) await uploadAvatar(avatarFile).catch(() => {})
      } else {
        await login(username, password)
      }
      initSocket()
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const pickAvatar = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file')
      return
    }
    setAvatarFile(file)
    setAvatarUrl(URL.createObjectURL(file))
    setError(null)
  }

  return (
    <main className="relative flex min-h-dvh overflow-hidden bg-canvas">
      {/* backdrop: soft accent glow + dot grid */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-44 -left-44 size-[600px] rounded-full bg-accent/10 blur-[130px]" />
        <div className="absolute -right-48 -bottom-56 size-[520px] rounded-full bg-accent/5 blur-[120px]" />
        <div className="absolute inset-0 bg-dots opacity-60 [mask-image:radial-gradient(ellipse_75%_65%_at_50%_0%,black,transparent)] dark:opacity-40" />
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-10 px-4 pt-[calc(env(safe-area-inset-top)+16px)] pb-8 sm:px-8 lg:grid-cols-2 lg:gap-20 lg:px-10 lg:py-10">
        {/* compact brand header — mobile only */}
        <div className="order-1 flex items-center gap-3 lg:hidden">
          <img
            src="/logoMazeChat.png"
            alt="MazeChat"
            className="size-11 shrink-0 object-contain drop-shadow-[0_4px_12px_rgba(43,92,255,0.35)]"
          />
          <div>
            <p className="text-lg font-bold tracking-tight text-ink">MazeChat</p>
            <p className="text-xs text-ink-2">Say hello to your friends</p>
          </div>
        </div>

        {/* auth card */}
        <section className="order-2 w-full lg:order-2">
          <div className="mx-auto w-full max-w-[420px] rounded-2xl bg-surface p-5 shadow-xl shadow-black/[0.04] ring-1 ring-line dark:shadow-black/40 sm:p-6">
            <h2 className="text-lg font-bold tracking-tight text-ink">
              {mode === 'create' ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="mt-0.5 mb-5 text-sm text-ink-2">
              {mode === 'create' ? 'Takes under a minute.' : 'Sign in and pick up where you left off.'}
            </p>

            <div className="mb-5 flex rounded-full bg-surface-2 p-1">
              {(['create', 'signin'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m)
                    setError(null)
                  }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-sm font-medium transition-colors ${
                    mode === m ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  {m === 'create' ? <UserPlus size={15} /> : <SignIn size={15} />}
                  {m === 'create' ? 'Create account' : 'Sign in'}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="flex flex-col gap-4">
              {mode === 'create' && (
                <>
                  <div className="flex flex-col items-center gap-3">
                    <label className="cursor-pointer" title="Upload avatar">
                      <span className="block rounded-full ring-2 ring-transparent transition hover:ring-accent">
                        <Avatar name={fullName || '?'} color={color} src={avatarUrl} size={72} />
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        className="hidden"
                        onChange={(e) => pickAvatar(e.target.files?.[0])}
                      />
                    </label>
                    <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-label={`Avatar color ${c}`}
                          onClick={() => setColor(c)}
                          className={`size-6 rounded-full transition ${
                            color === c ? 'scale-110 ring-2 ring-ink ring-offset-2 ring-offset-surface' : 'hover:scale-110'
                          }`}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  </div>

                  <Field label="Full name">
                    <input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Mazen Khaled"
                      maxLength={50}
                      required
                      autoFocus
                      className="field"
                    />
                  </Field>
                </>
              )}

              <Field label="Username">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="e.g. salma_99"
                  pattern="[a-z0-9_]{3,20}"
                  title="3-20 characters: letters, numbers, underscores"
                  required
                  className="field font-mono"
                />
              </Field>

              <Field label="Password">
                <span className="relative block">
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    type={showPw ? 'text' : 'password'}
                    minLength={8}
                    maxLength={128}
                    required
                    className="field pr-10"
                    autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                  />
                  <button
                    type="button"
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-3 transition hover:text-ink"
                  >
                    {showPw ? <EyeSlash size={18} /> : <Eye size={18} />}
                  </button>
                </span>
              </Field>

              {mode === 'create' && (
                <Field label="Confirm password">
                  <input
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat your password"
                    type={showPw ? 'text' : 'password'}
                    minLength={8}
                    maxLength={128}
                    required
                    className="field"
                    autoComplete="new-password"
                  />
                </Field>
              )}

              {error && <p className="text-sm text-danger">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="press mt-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong disabled:opacity-60 disabled:hover:bg-accent"
              >
                {busy ? (mode === 'create' ? 'Creating…' : 'Signing in…') : mode === 'create' ? 'Create account' : 'Sign in'}
              </button>
            </form>
          </div>

          <p className="mx-auto mt-4 max-w-[420px] text-center text-xs text-ink-3">
            Passwords are stored as scrypt hashes — never in plain text.
          </p>
        </section>

        {/* product story panel */}
        <section className="order-3 lg:order-1">
          <div className="hidden items-center gap-3 lg:flex">
            <img
              src="/logoMazeChat.png"
              alt="MazeChat"
              className="size-12 shrink-0 object-contain drop-shadow-[0_4px_12px_rgba(43,92,255,0.35)]"
            />
            <p className="text-2xl font-bold tracking-tight text-ink">MazeChat</p>
          </div>

          <h1 className="mt-0 max-w-md text-4xl leading-[1.08] font-bold tracking-tight text-ink lg:mt-8 lg:text-5xl">
            Real-time chat, minus the noise.
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-ink-2">
            Direct messages with read receipts, chat rooms for the group, voice notes and photos —
            one calm messenger for the people you talk to every day.
          </p>

          <ul className="mt-8 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <f.icon size={18} weight="fill" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{f.title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>

          <MockChat />
        </section>
      </div>
    </main>
  )
}

// A live-looking chat preview built from the real UI components and tokens.
function MockChat() {
  return (
    <div className="mt-10 max-w-[420px] overflow-hidden rounded-2xl bg-surface shadow-xl shadow-black/[0.06] ring-1 ring-line dark:shadow-black/40">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Avatar name="Mazen Khaled" color="#DB2777" size={36} online />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">Mazen</p>
          <p className="text-xs text-ink-2">Active now</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent">
          <Hash size={12} weight="bold" /> weekend-plan
        </span>
      </div>

      <div className="flex flex-col gap-2.5 px-4 py-4">
        <div className="animate-msg-in max-w-[80%] self-start rounded-bubble rounded-bl-md bg-bubble-in px-3.5 py-2 text-[15px] leading-snug text-ink">
          Bus tonight at 8?
        </div>
        <div
          className="animate-msg-in max-w-[80%] self-end rounded-bubble rounded-br-md bg-bubble-out px-3.5 py-2 text-[15px] leading-snug text-bubble-in"
          style={{ animationDelay: '0.08s' }}
        >
          <p>On it. Meet at the usual spot</p>
          <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-bubble-in/70">
            <span className="font-semibold text-ok/90">✓✓</span>
          </span>
        </div>
        <div style={{ animationDelay: '0.16s' }}>
          <TypingBubble />
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
        <span className="h-8 flex-1 rounded-input bg-surface-2" />
        <span className="press flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
          <PaperPlaneTilt size={15} weight="fill" />
        </span>
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
