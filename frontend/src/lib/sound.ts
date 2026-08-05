// Tiny WebAudio notification sound — no asset files, synthesized on demand.
// Two short ascending tones (~90ms total), kept quiet.

const PREF_KEY = 'mazentalk.sound'
const THROTTLE_MS = 400

let ctx: AudioContext | null = null
let lastPlayedAt = 0

export function isSoundEnabled(): boolean {
  return localStorage.getItem(PREF_KEY) !== 'off'
}

export function setSoundEnabled(enabled: boolean): void {
  localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off')
}

function tone(context: AudioContext, at: number, freq: number, dur: number) {
  const osc = context.createOscillator()
  const gain = context.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, at)
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.12, at + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  osc.connect(gain)
  gain.connect(context.destination)
  osc.start(at)
  osc.stop(at + dur + 0.02)
}

export function playMessageSound(): void {
  if (!isSoundEnabled()) return
  const now = Date.now()
  if (now - lastPlayedAt < THROTTLE_MS) return
  lastPlayedAt = now
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    const t = ctx.currentTime
    tone(ctx, t, 987.77, 0.055)
    tone(ctx, t + 0.05, 1318.51, 0.055)
  } catch {
    // audio is best-effort; never throw into the socket path
  }
}
