import { X } from '@phosphor-icons/react'
import { useEffect } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  width?: string
}

export default function Modal({ open, onClose, title, children, width = 'max-w-md' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="animate-fade-in fixed inset-0 z-40 flex items-center justify-center bg-overlay p-4"
      onClick={onClose}
    >
      <div
        className={`animate-sheet-up max-h-[90dvh] w-full ${width} overflow-y-auto rounded-2xl bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-2xl ring-1 ring-line sm:pb-5`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          {title && <h2 className="text-lg font-bold text-ink">{title}</h2>}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
