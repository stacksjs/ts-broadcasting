import { describe, expect, it } from 'bun:test'
import { BroadcastServer } from '../../src/server'

/**
 * Zero-downtime deploys start the new release beside the old one, on the
 * same port. That only works when both bind with SO_REUSEPORT.
 */

const PORT = 46000 + Math.floor(Math.random() * 1000)

describe('reusePort', () => {
  it('lets a second server bind the same port while the first is serving', async () => {
    const first = new BroadcastServer({ host: '127.0.0.1', port: PORT, reusePort: true })
    const second = new BroadcastServer({ host: '127.0.0.1', port: PORT, reusePort: true })
    await first.start()
    try {
      await second.start()
      const response = await fetch(`http://127.0.0.1:${PORT}/health`)
      expect(response.ok).toBe(true)
    }
    finally {
      await second.stop()
      await first.stop()
    }
  })

  it('takes the option from the named connection too', async () => {
    const config = { default: 'bun', connections: { bun: { driver: 'bun' as const, host: '127.0.0.1', port: PORT + 1, reusePort: true } } }
    const first = new BroadcastServer(config)
    const second = new BroadcastServer(config)
    await first.start()
    try {
      await second.start()
    }
    finally {
      await second.stop()
      await first.stop()
    }
  })

  it('refuses a second listener without it', async () => {
    const first = new BroadcastServer({ host: '127.0.0.1', port: PORT + 2 })
    const second = new BroadcastServer({ host: '127.0.0.1', port: PORT + 2 })
    await first.start()
    try {
      await expect(second.start()).rejects.toThrow()
    }
    finally {
      await second.stop().catch(() => {})
      await first.stop()
    }
  })
})
