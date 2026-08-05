import { useRef, useState } from 'react'
import { ImageSquare, SpinnerGap } from '@phosphor-icons/react'
import Modal from './Modal'
import { useChat } from '../store/chat'
import { uploadFile } from '../lib/api'

interface CreateStoryModalProps {
  open: boolean
  onClose: () => void
}

export default function CreateStoryModal({ open, onClose }: CreateStoryModalProps) {
  const createStory = useChat((s) => s.createStory)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pickFile = (f: File | null) => {
    setError(null)
    if (!f) return
    if (!f.type.startsWith('image/')) {
      setError('Only images are supported')
      return
    }
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const close = () => {
    if (busy) return
    onClose()
    setPreview(null)
    setFile(null)
    setCaption('')
    setError(null)
  }

  const post = async () => {
    if (!file || busy) return
    setBusy(true)
    setError(null)
    try {
      const { url } = await uploadFile(file)
      await createStory(url, caption.trim())
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post story')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title="Add to your story" width="max-w-md">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />

      {!preview && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line py-14 text-ink-3 transition hover:border-ink-3 hover:text-ink-2"
        >
          <ImageSquare size={28} />
          <span className="text-sm font-medium">Choose a photo</span>
        </button>
      )}

      {preview && (
        <div className="flex flex-col gap-3">
          <div className="relative max-h-80 overflow-hidden rounded-xl bg-black/60">
            <img src={preview} alt="Story preview" className="mx-auto max-h-80 w-auto object-contain" />
          </div>
          <button
            type="button"
            onClick={() => {
              setPreview(null)
              setFile(null)
            }}
            className="text-left text-xs font-medium text-ink-3 transition hover:text-ink"
          >
            Choose a different photo
          </button>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, 500))}
            placeholder="Say something…"
            rows={2}
            className="resize-none rounded-input bg-surface-2 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:outline-none"
          />
          {error && <p className="text-xs font-medium text-danger">{error}</p>}
          <button
            type="button"
            onClick={post}
            disabled={busy}
            className="press flex w-full items-center justify-center gap-2 rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong disabled:opacity-60"
          >
            {busy && <SpinnerGap size={16} className="animate-spin" />}
            {busy ? 'Posting…' : 'Share to your story'}
          </button>
        </div>
      )}
    </Modal>
  )
}
