import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Welcome from './pages/Welcome'
import AppShell from './pages/AppShell'
import ChatView from './pages/ChatView'
import RoomView from './pages/RoomView'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'

const router = createBrowserRouter([
  { path: '/', element: <Welcome /> },
  {
    path: '/app',
    element: <AppShell />,
    children: [
      { index: true, element: <EmptyPane /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'c/:conversationId', element: <ChatView /> },
      { path: 'r/:roomId', element: <RoomView /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}

function EmptyPane() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <ChatBubbleIcon />
      </span>
      <div>
        <p className="text-lg font-bold text-ink">Your messages</p>
        <p className="mt-1 max-w-xs text-sm text-ink-2">
          Pick a conversation or find someone new from the search bar to start chatting.
        </p>
      </div>
    </div>
  )
}

function ChatBubbleIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 256 256" fill="currentColor" aria-hidden>
      <path d="M216,48H40A16,16,0,0,0,24,64V184a16,16,0,0,0,16,16H72v24a8,8,0,0,0,13.66,5.66L117.66,200H216a16,16,0,0,0,16-16V64A16,16,0,0,0,216,48Z" />
    </svg>
  )
}
