import { describe, expect, it } from 'bun:test'
import { BroadcastCoalescer } from '../src/coalescer'

/**
 * Coalescing outbound frames.
 *
 * The properties that matter are in tension, which is why both are pinned
 * down: an idle channel must not be delayed at all, and a hot one must not
 * be able to emit more than one frame per window. A implementation that
 * only achieves the second is a laggy board; one that only achieves the
 * first is what we already had.
 */

function sink() {
  const sent: Array<{ channel: string, event: string, data: unknown }> = []
  return {
    sent,
    send: (channel: string, event: string, data: unknown) => void sent.push({ channel, event, data }),
  }
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('BroadcastCoalescer', () => {
  it('sends the first message immediately', async () => {
    const { sent, send } = sink()
    const coalescer = new BroadcastCoalescer(send, { windowMs: 50 })

    coalescer.push('odds', 'update', { n: 1 })

    // No await: an isolated update must not pay the window's latency.
    expect(sent).toHaveLength(1)
    expect(sent[0]!.data).toEqual({ n: 1 })
    coalescer.close()
  })

  it('collapses a burst into one follow-up frame carrying the latest', async () => {
    const { sent, send } = sink()
    const coalescer = new BroadcastCoalescer(send, { windowMs: 40 })

    // Fourteen books updating one channel inside a single tick.
    for (let n = 1; n <= 14; n++)
      coalescer.push('odds', 'update', { n })

    expect(sent).toHaveLength(1)

    await wait(80)

    // Leading edge plus exactly one collapsed frame, and it carries the
    // newest price rather than the oldest held one.
    expect(sent).toHaveLength(2)
    expect(sent[1]!.data).toEqual({ n: 14 })
    coalescer.close()
  })

  it('counts what it superseded rather than hiding it', async () => {
    const { send } = sink()
    const coalescer = new BroadcastCoalescer(send, { windowMs: 40 })

    for (let n = 1; n <= 5; n++)
      coalescer.push('odds', 'update', { n })

    await wait(80)

    const stats = coalescer.getStats()
    expect(stats.received).toBe(5)
    expect(stats.sent).toBe(2)
    expect(stats.dropped).toBe(3)
    coalescer.close()
  })

  it('keeps different channels apart', async () => {
    const { sent, send } = sink()
    const coalescer = new BroadcastCoalescer(send, { windowMs: 40 })

    coalescer.push('odds', 'update', { a: 1 })
    coalescer.push('scores', 'update', { b: 1 })

    // Two idle keys, two leading edges.
    expect(sent).toHaveLength(2)
    coalescer.close()
  })

  it('keeps different events on one channel apart', async () => {
    const { sent, send } = sink()
    const coalescer = new BroadcastCoalescer(send, { windowMs: 40 })

    coalescer.push('odds', 'price', { a: 1 })
    coalescer.push('odds', 'settled', { b: 1 })

    // A settlement is not a newer version of a price change.
    expect(sent).toHaveLength(2)
    coalescer.close()
  })

  it('goes idle again after a quiet window', async () => {
    const { sent, send } = sink()
    const coalescer = new BroadcastCoalescer(send, { windowMs: 30 })

    coalescer.push('odds', 'update', { n: 1 })
    await wait(70)

    // Nothing arrived during the window, so the next message is a fresh
    // leading edge and goes straight out.
    coalescer.push('odds', 'update', { n: 2 })
    expect(sent).toHaveLength(2)
    coalescer.close()
  })

  it('caps a sustained stream at one frame per window', async () => {
    const { sent, send } = sink()
    const coalescer = new BroadcastCoalescer(send, { windowMs: 25 })

    // Push continuously for ~150ms.
    const started = Date.now()
    while (Date.now() - started < 150) {
      coalescer.push('odds', 'update', { t: Date.now() })
      await wait(3)
    }
    await wait(60)

    // ~50 pushes over ~6 windows. Generous bound: the point is that it is
    // a small multiple of the window count, not of the message count.
    expect(sent.length).toBeLessThanOrEqual(10)
    expect(sent.length).toBeGreaterThan(1)
    coalescer.close()
  })

  it('passes everything straight through when disabled', () => {
    const { sent, send } = sink()
    const coalescer = new BroadcastCoalescer(send, { windowMs: 0 })

    for (let n = 1; n <= 5; n++)
      coalescer.push('odds', 'update', { n })

    expect(sent).toHaveLength(5)
    coalescer.close()
  })

  it('flushes held messages on close rather than dropping them', async () => {
    const { sent, send } = sink()
    const coalescer = new BroadcastCoalescer(send, { windowMs: 1000 })

    coalescer.push('odds', 'update', { n: 1 })
    coalescer.push('odds', 'update', { n: 2 })
    expect(sent).toHaveLength(1)

    // Shutting down must not silently discard the newest price.
    coalescer.close()

    expect(sent).toHaveLength(2)
    expect(sent[1]!.data).toEqual({ n: 2 })
  })

  it('ignores pushes after close', () => {
    const { sent, send } = sink()
    const coalescer = new BroadcastCoalescer(send, { windowMs: 20 })
    coalescer.close()

    coalescer.push('odds', 'update', { n: 1 })
    expect(sent).toHaveLength(0)
  })

  it('flushes on demand without waiting for the window', () => {
    const { sent, send } = sink()
    const coalescer = new BroadcastCoalescer(send, { windowMs: 1000 })

    coalescer.push('odds', 'update', { n: 1 })
    coalescer.push('odds', 'update', { n: 2 })
    expect(coalescer.pendingCount()).toBe(1)

    coalescer.flushAll()

    expect(sent).toHaveLength(2)
    expect(coalescer.pendingCount()).toBe(0)
    coalescer.close()
  })
})
