import { io, type Socket } from 'socket.io-client'
import { getToken } from './api'

let socket: Socket | null = null

// Same-origin by default (Vite proxy in dev, backend static serving in prod).
// Override with VITE_SOCKET_URL in frontend/.env.
const SOCKET_URL = ((import.meta.env.VITE_SOCKET_URL as string | undefined) ?? '').trim()

export function getSocket(): Socket | null {
  return socket
}

export function connectSocket(): Socket {
  if (socket?.connected) return socket
  if (socket) {
    socket.connect()
    return socket
  }
  socket = io(SOCKET_URL || undefined, {
    auth: { token: getToken() },
    transports: ['websocket'],
  })
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
