import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from './Modal'
import { useChat } from '../store/chat'
import { DEFAULT_ROOM_COLOR, ROOM_COLORS } from '../lib/colors'

// Create-a-room form (name + optional description + color). The creator
// becomes the owner and first member, then lands in the new room.
export default function NewRoomModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [avatarColor, setAvatarColor] = useState(DEFAULT_ROOM_COLOR)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const createRoom = useChat((s) => s.createRoom)
  const navigate = useNavigate()

  const submit = async () => {
    const roomName = name.trim()
    if (roomName.length < 1) {
      setError('Room name is required')
      return
    }
    setBusy(true)
    setError('')
    try {
      const room = await createRoom(roomName, description.trim(), avatarColor)
      if (room) {
        onClose()
        setName('')
        setDescription('')
        setAvatarColor(DEFAULT_ROOM_COLOR)
        navigate(`/app/r/${room.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New chat room">
      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-2" htmlFor="room-name">
            Room name
          </label>
          <input
            id="room-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            maxLength={50}
            placeholder="e.g. Project room"
            autoFocus
            className="field"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-2" htmlFor="room-desc">
            Description <span className="text-ink-3">(optional)</span>
          </label>
          <textarea
            id="room-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder="What's this room about?"
            className="field resize-none"
          />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-2">Room color</p>
          <div className="flex flex-wrap gap-2.5">
            {ROOM_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Room color ${c}`}
                aria-pressed={avatarColor === c}
                onClick={() => setAvatarColor(c)}
                className={`size-6 rounded-full transition ${
                  avatarColor === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() => void submit()}
          className="flex items-center justify-center rounded-full bg-accent py-2 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong disabled:opacity-60"
        >
          {busy ? 'Creating…' : 'Create room'}
        </button>
      </div>
    </Modal>
  )
}
