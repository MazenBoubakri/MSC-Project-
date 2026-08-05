import { useEffect, useState } from 'react'
import { Outlet, useMatch, useNavigate } from 'react-router-dom'
import { WarningCircle } from '@phosphor-icons/react'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import Sidebar from '../components/Sidebar'
import Toasts from '../components/Toasts'
import { applyUnreadTitle } from '../lib/title'

export default function AppShell() {
  const { user, ready } = useAuth()
  const initSocket = useChat((s) => s.initSocket)
  const destroySocket = useChat((s) => s.destroySocket)
  const socketReady = useChat((s) => s.socketReady)
  const loadConversations = useChat((s) => s.loadConversations)
  const loadFriends = useChat((s) => s.loadFriends)
  const conversations = useChat((s) => s.conversations)
  const rooms = useChat((s) => s.rooms)
  const navigate = useNavigate()
  const chatMatch = useMatch('/app/c/:conversationId')
  const roomMatch = useMatch('/app/r/:roomId')
  const settingsMatch = useMatch('/app/settings')
  const profileMatch = useMatch('/app/profile')
  // detail pages (chat, room, settings, profile) replace the sidebar on mobile
  const detail = chatMatch ?? roomMatch ?? settingsMatch ?? profileMatch

  // show the reconnect pill only after the socket has been up once
  const [hadConnection, setHadConnection] = useState(false)
  useEffect(() => {
    if (socketReady) setHadConnection(true)
  }, [socketReady])

  const unread =
    conversations.reduce((n, c) => n + c.unread, 0) +
    rooms.reduce((n, r) => n + (r.member ? r.unread : 0), 0)

  useEffect(() => {
    applyUnreadTitle(unread)
    return () => {
      document.title = 'MazenTalk'
    }
  }, [unread])

  useEffect(() => {
    if (!ready) return
    if (!user) {
      navigate('/', { replace: true })
      return
    }
    initSocket()
    loadConversations().catch(() => {})
    loadFriends().catch(() => {})
    return () => destroySocket()
  }, [ready, user, navigate, initSocket, destroySocket, loadConversations, loadFriends])

  if (!ready) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-canvas">
        <img
          src="/logoMazenTalk.png"
          alt="MazenTalk"
          className="size-16 animate-pulse object-contain drop-shadow-[0_4px_16px_rgba(43,92,255,0.35)]"
        />
        <p className="text-sm font-semibold text-ink-2">MazenTalk</p>
      </div>
    )
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <aside
        className={`${
          detail ? 'hidden lg:flex' : 'flex'
        } w-full shrink-0 flex-col border-r border-line bg-surface pt-[env(safe-area-inset-top)] lg:w-[360px] lg:pt-0`}
      >
        <Sidebar />
      </aside>
      <section
        key={detail ? 'detail' : 'list'}
        className={`${detail ? 'flex' : 'hidden lg:flex'} min-w-0 flex-1 flex-col pt-[env(safe-area-inset-top)] lg:pt-0 ${
          detail ? 'animate-fade-in' : ''
        }`}
      >
        {hadConnection && !socketReady && (
          <div className="flex shrink-0 items-center justify-center gap-1.5 bg-danger/10 px-4 py-1.5 text-xs font-medium text-danger">
            <WarningCircle size={14} weight="bold" />
            Reconnecting…
          </div>
        )}
        <Outlet />
      </section>
      <Toasts />
    </div>
  )
}
