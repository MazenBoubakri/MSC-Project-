import { useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, Microphone, PaperPlaneTilt, Trash, X } from '@phosphor-icons/react'

interface ComposerProps {
  draft: string
  setDraft: (v: string) => void
  onSubmit: () => void
  onTyping: (t: boolean) => void
  onPickImage: () => void
  onSendVoice: (blob: Blob, durationSec: number) => void
  /** message being replied to; renders the slim reply chip above the input row */
  replyingTo?: { senderName: string; body: string } | null
  onCancelReply?: () => void
}

// Shared input bar: text + image attach + voice recording. Used by both the
// direct-message view and the chat-room view.
export default function Composer({
  draft,
  setDraft,
  onSubmit,
  onTyping,
  onPickImage,
  onSendVoice,
  replyingTo = null,
  onCancelReply,
}: ComposerProps) {
  const [recording, setRecording] = useState(false)
  const [recordingSec, setRecordingSec] = useState(0)
  const [micError, setMicError] = useState(false)
  const recRef = useRef<{ rec: MediaRecorder; startedAt: number } | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const startRecording = async () => {
    setMicError(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        clearTimer()
      }
      const startedAt = Date.now()
      recRef.current = { rec, startedAt }
      rec.start()
      setRecording(true)
      setRecordingSec(0)
      timerRef.current = setInterval(() => {
        setRecordingSec(Math.floor((Date.now() - startedAt) / 1000))
      }, 250)
    } catch {
      setMicError(true)
      setTimeout(() => setMicError(false), 2500)
    }
  }

  const stopRecording = (send: boolean) => {
    const entry = recRef.current
    if (!entry) return
    recRef.current = null
    const { rec, startedAt } = entry
    const elapsed = (Date.now() - startedAt) / 1000
    rec.onstop = () => {
      rec.stream.getTracks().forEach((t) => t.stop())
      clearTimer()
      setRecording(false)
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
      chunksRef.current = []
      if (send && blob.size > 0 && elapsed >= 0.5) void onSendVoice(blob, elapsed)
    }
    try {
      rec.stop()
    } catch {
      /* noop */
    }
  }

  useEffect(() => () => clearTimer(), [])

  const canSend = draft.trim().length > 0

  return (
    <div className="shrink-0 border-t border-line bg-surface px-3 py-2.5 pb-[calc(env(safe-area-inset-bottom)+10px)] md:pb-2.5">
      {micError && <p className="pb-2 text-center text-xs text-danger">Microphone unavailable — check browser permissions.</p>}

      {replyingTo && (
        <div className="mb-1.5 flex items-center gap-2 rounded-lg border-l-2 border-accent bg-surface-2 px-3 py-1.5 text-ink-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">Replying to {replyingTo.senderName}</p>
            <p className="truncate text-xs">{replyingTo.body}</p>
          </div>
          <button
            type="button"
            aria-label="Cancel reply"
            onClick={onCancelReply}
            className="flex size-7 shrink-0 items-center justify-center rounded-full p-1 text-ink-3 transition hover:bg-line hover:text-ink active:scale-95 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X size={13} weight="bold" />
          </button>
        </div>
      )}

      {recording ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Cancel recording"
            onClick={() => stopRecording(false)}
            className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-2 transition hover:text-danger"
          >
            <Trash size={17} />
          </button>
          <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-input bg-danger/10 px-3.5">
            <span className="size-2.5 animate-pulse rounded-full bg-danger" />
            <span className="font-mono text-sm text-ink">
              {Math.floor(recordingSec / 60)}:{(recordingSec % 60).toString().padStart(2, '0')}
            </span>
            <span className="flex-1" />
            <span className="hidden text-xs text-ink-3 sm:block">Recording… tap stop to send</span>
          </div>
          <button
            type="button"
            aria-label="Stop and send"
            onClick={() => stopRecording(true)}
            className="press flex size-9 items-center justify-center rounded-full bg-danger text-white transition hover:opacity-90"
          >
            <PaperPlaneTilt size={16} weight="fill" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1.5">
          <button
            type="button"
            aria-label="Attach image"
            onClick={onPickImage}
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink active:scale-95"
          >
            <ImageIcon size={20} />
          </button>
          <button
            type="button"
            aria-label="Record voice message"
            onClick={() => void startRecording()}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2 transition hover:bg-line hover:text-ink active:scale-95"
          >
            <Microphone size={19} />
          </button>
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              onTyping(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void onSubmit()
              }
            }}
            rows={1}
            placeholder="Message…"
            enterKeyHint="send"
            autoCapitalize="sentences"
            className="field max-h-32 min-h-10 flex-1 resize-none py-2.5"
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 128)}px`
            }}
          />
          {canSend && (
            <button
              type="button"
              aria-label="Send"
              onClick={() => void onSubmit()}
              className="press flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition hover:bg-accent-strong"
            >
              <PaperPlaneTilt size={18} weight="fill" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
