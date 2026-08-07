/**
 * Coalescing outbound broadcasts.
 *
 * `batch-operations.ts` already batches *inbound* requests — a client
 * subscribing to twenty channels at once. This is the other direction:
 * one channel being broadcast to far faster than any browser needs to
 * render it.
 *
 * The case that motivates it is a live price board. Fourteen sources
 * update the same channel roughly every second, so subscribers receive
 * fourteen frames a second when the only thing they can act on is the
 * latest one. The intermediate frames are not merely wasted bandwidth:
 * each one costs a serialize, a fan-out across every socket, and a render.
 *
 * ### Leading edge, then collapse
 *
 * The first message on an idle key goes out **immediately**. Adding
 * latency to an isolated update to protect against a burst that is not
 * happening is the wrong trade — an idle channel should feel instant.
 * Messages arriving during the window are held, the latest replacing the
 * one before it, and a single frame is sent when the window closes.
 *
 * So a quiet channel is never delayed, and a hot one is capped at one
 * frame per window. That is the whole idea.
 *
 * ### Why `maxWait` exists
 *
 * A channel updating faster than the window would otherwise have its
 * window pushed back forever if the timer restarted on each message.
 * It does not — the window is anchored to the first held message — but
 * `maxWait` is kept as an explicit ceiling so the guarantee is stated in
 * the configuration rather than implied by the implementation.
 *
 * Zero dependencies.
 */

export interface CoalesceOptions {
  /**
   * How long to hold messages after a send before flushing the latest.
   * Zero disables coalescing entirely — every message goes straight out.
   * @default 0
   */
  windowMs?: number

  /**
   * Hard ceiling on how long any message may be held, in ms. Defaults to
   * `windowMs`, which is already the guarantee; set it higher only if you
   * deliberately want a longer collapse under sustained load.
   */
  maxWaitMs?: number

  /**
   * How a message is keyed. Messages sharing a key collapse into one.
   * Defaults to channel + event, so two different events on one channel
   * are not mistaken for updates of each other.
   */
  key?: (channel: string, event: string) => string
}

export interface CoalescerStats {
  /** Messages handed to the coalescer. */
  received: number
  /** Frames actually sent. */
  sent: number
  /** Messages superseded before they were ever sent. */
  dropped: number
}

interface Pending<T> {
  channel: string
  event: string
  data: T
  timer: ReturnType<typeof setTimeout>
}

export type CoalescedSend<T = unknown> = (channel: string, event: string, data: T) => void

export class BroadcastCoalescer<T = unknown> {
  private readonly windowMs: number
  private readonly maxWaitMs: number
  private readonly keyFor: (channel: string, event: string) => string

  /** Keys currently inside a window, whether or not anything is held. */
  private readonly open = new Map<string, Pending<T> | null>()

  private stats: CoalescerStats = { received: 0, sent: 0, dropped: 0 }
  private closed = false

  constructor(
    private readonly send: CoalescedSend<T>,
    options: CoalesceOptions = {},
  ) {
    this.windowMs = Math.max(0, options.windowMs ?? 0)
    this.maxWaitMs = Math.max(this.windowMs, options.maxWaitMs ?? this.windowMs)
    this.keyFor = options.key ?? ((channel, event) => `${channel}::${event}`)
  }

  /**
   * Offer a message. Sent now if the key is idle, held otherwise.
   */
  push(channel: string, event: string, data: T): void {
    if (this.closed)
      return

    this.stats.received++

    if (this.windowMs === 0) {
      this.stats.sent++
      this.send(channel, event, data)
      return
    }

    const key = this.keyFor(channel, event)

    if (!this.open.has(key)) {
      // Idle: leading edge, straight out, and open a window behind it.
      this.stats.sent++
      this.send(channel, event, data)
      this.openWindow(key)
      return
    }

    const held = this.open.get(key)
    if (held) {
      // Supersede. The one it replaces was never sent, and never will be —
      // that is the point, but it is counted rather than hidden.
      this.stats.dropped++
      clearTimeout(held.timer)
    }

    const timer = setTimeout(() => this.flush(key), Math.min(this.windowMs, this.maxWaitMs))
    this.open.set(key, { channel, event, data, timer })
  }

  /** Send anything held right now, without waiting for its window. */
  flushAll(): void {
    for (const key of [...this.open.keys()])
      this.flush(key)
  }

  /** Stop coalescing. Held messages are flushed rather than discarded. */
  close(): void {
    this.flushAll()
    this.closed = true
  }

  getStats(): CoalescerStats {
    return { ...this.stats }
  }

  resetStats(): void {
    this.stats = { received: 0, sent: 0, dropped: 0 }
  }

  /** Keys with a message waiting. Useful in tests and diagnostics. */
  pendingCount(): number {
    let count = 0
    for (const held of this.open.values()) {
      if (held)
        count++
    }
    return count
  }

  private openWindow(key: string): void {
    this.open.set(key, null)
    const timer = setTimeout(() => {
      // Window elapsed with nothing held: the key goes idle again, so the
      // next message is a leading edge and goes out immediately.
      if (!this.open.get(key))
        this.open.delete(key)
    }, this.windowMs)

    // An idle-window timer must not keep a process alive on its own.
    if (typeof timer === 'object' && timer && 'unref' in timer)
      (timer as unknown as { unref: () => void }).unref()
  }

  private flush(key: string): void {
    const held = this.open.get(key)
    if (!held) {
      this.open.delete(key)
      return
    }

    clearTimeout(held.timer)
    this.stats.sent++
    this.send(held.channel, held.event, held.data)

    // Opening a fresh window behind the flush keeps the rate capped: a
    // channel under sustained load emits exactly one frame per window
    // rather than one per window plus a leading edge each time.
    this.openWindow(key)
  }
}
