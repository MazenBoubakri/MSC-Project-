// "someone is typing" indicator bubble, shared by the DM and room views.
export default function TypingBubble() {
  return (
    <div className="animate-msg-in flex justify-start px-2 pt-1">
      <div className="flex items-center gap-1 rounded-bubble rounded-bl-md bg-bubble-in px-4 py-3 shadow-sm">
        <span className="typing-dot size-1.5 rounded-full bg-ink-2" style={{ animationDelay: '0ms' }} />
        <span className="typing-dot size-1.5 rounded-full bg-ink-2" style={{ animationDelay: '150ms' }} />
        <span className="typing-dot size-1.5 rounded-full bg-ink-2" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}
