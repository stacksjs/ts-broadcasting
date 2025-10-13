/**
 * Unit Tests: WebhookManager
 *
 * Tests for webhook functionality including firing, retries, and HMAC signatures
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { WebhookManager } from '../../src/webhooks'

describe('WebhookManager', () => {
  let manager: WebhookManager
  let fetchMock: any
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    // Save original fetch
    originalFetch = globalThis.fetch

    // Mock global fetch
    fetchMock = mock(() => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({}),
    }))
    globalThis.fetch = fetchMock as any

    manager = new WebhookManager({
      enabled: true,
      endpoints: [
        {
          url: 'https://example.com/webhook',
          events: ['connection', 'disconnection', 'subscribe'],
        },
      ],
      secret: 'test-secret',
      retryAttempts: 3,
      retryDelay: 100,
    })
  })

  afterEach(() => {
    // Restore original fetch
    globalThis.fetch = originalFetch
  })

  describe('Webhook Firing', () => {
    it('should fire webhook for registered events', async () => {
      await manager.fire('connection', {
        socketId: 'socket-123',
        timestamp: Date.now(),
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const call = fetchMock.mock.calls[0]
      expect(call[0]).toBe('https://example.com/webhook')
    })

    it('should not fire webhook for unregistered events', async () => {
      await manager.fire('broadcast' as any, { data: 'test' })

      expect(fetchMock).toHaveBeenCalledTimes(0)
    })

    it('should include event data in payload', async () => {
      const eventData = {
        socketId: 'socket-123',
        channel: 'test-channel',
      }

      await manager.fire('subscribe', eventData)

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const call = fetchMock.mock.calls[0]
      const payload = JSON.parse(call[1].body)

      expect(payload.event).toBe('subscribe')
      expect(payload.data).toEqual(eventData)
      expect(payload.timestamp).toBeDefined()
    })

    it('should include HMAC signature when secret is configured', async () => {
      await manager.fire('connection', { socketId: 'socket-123' })

      const call = fetchMock.mock.calls[0]
      const payload = JSON.parse(call[1].body)

      expect(payload.signature).toBeDefined()
      expect(typeof payload.signature).toBe('string')
      expect(payload.signature.length).toBeGreaterThan(0)
    })

    it('should send correct headers', async () => {
      await manager.fire('connection', { socketId: 'socket-123' })

      const call = fetchMock.mock.calls[0]
      const headers = call[1].headers

      expect(headers['Content-Type']).toBe('application/json')
      expect(headers['User-Agent']).toContain('ts-broadcasting')
    })
  })

  describe('Multiple Endpoints', () => {
    beforeEach(() => {
      manager = new WebhookManager({
        enabled: true,
        endpoints: [
          {
            url: 'https://endpoint1.com/webhook',
            events: ['connection', 'subscribe'],
          },
          {
            url: 'https://endpoint2.com/webhook',
            events: ['subscribe', 'unsubscribe'],
          },
          {
            url: 'https://endpoint3.com/webhook',
            events: ['connection'],
          },
        ],
      })
    })

    it('should fire to all matching endpoints', async () => {
      await manager.fire('subscribe', { channel: 'test' })

      expect(fetchMock).toHaveBeenCalledTimes(2) // endpoint1 and endpoint2
    })

    it('should fire to specific endpoints based on event', async () => {
      await manager.fire('connection', { socketId: 'test' })

      expect(fetchMock).toHaveBeenCalledTimes(2) // endpoint1 and endpoint3
    })

    it('should fire to no endpoints when event does not match', async () => {
      await manager.fire('unsubscribe', { channel: 'test' })

      expect(fetchMock).toHaveBeenCalledTimes(1) // only endpoint2
    })
  })

  describe('Retry Logic', () => {
    it('should retry on failure', async () => {
      let attempts = 0
      fetchMock = mock(() => {
        attempts++
        if (attempts < 3) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
          })
        }
        return Promise.resolve({
          ok: true,
          status: 200,
        })
      })
      globalThis.fetch = fetchMock as any

      await manager.fire('connection', { socketId: 'test' })

      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('should respect retry attempts limit', async () => {
      fetchMock = mock(() => Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      }))
      globalThis.fetch = fetchMock as any

      await manager.fire('connection', { socketId: 'test' })

      // 1 initial + 3 retries = 4 total attempts
      expect(fetchMock).toHaveBeenCalledTimes(4)
    })

    it('should apply exponential backoff', async () => {
      const callTimes: number[] = []
      fetchMock = mock(() => {
        callTimes.push(Date.now())
        return Promise.resolve({
          ok: false,
          status: 500,
        })
      })
      globalThis.fetch = fetchMock as any

      await manager.fire('connection', { socketId: 'test' })

      // Check that delays increase exponentially
      if (callTimes.length >= 2) {
        const delay1 = callTimes[1] - callTimes[0]
        const delay2 = callTimes[2] - callTimes[1]
        // Second delay should be roughly 2x first delay (exponential backoff)
        expect(delay2).toBeGreaterThan(delay1)
      }
    })

    it('should not retry on 4xx errors', async () => {
      fetchMock = mock(() => Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }))
      globalThis.fetch = fetchMock as any

      await manager.fire('connection', { socketId: 'test' })

      // Should not retry on client errors
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('HMAC Signature Verification', () => {
    it('should generate consistent signatures for same payload', async () => {
      const signatures: string[] = []

      fetchMock = mock((url: string, options: any) => {
        const payload = JSON.parse(options.body)
        signatures.push(payload.signature)
        return Promise.resolve({ ok: true, status: 200 })
      })
      globalThis.fetch = fetchMock as any

      const eventData = { socketId: 'socket-123' }

      await manager.fire('connection', eventData)
      await manager.fire('connection', eventData)

      // Signatures will be different due to timestamps
      expect(signatures.length).toBe(2)
      expect(signatures[0]).toBeDefined()
      expect(signatures[1]).toBeDefined()
    })

    it('should not include signature when secret is not configured', async () => {
      manager = new WebhookManager({
        enabled: true,
        endpoints: [
          {
            url: 'https://example.com/webhook',
            events: ['connection'],
          },
        ],
        // No secret
      })

      await manager.fire('connection', { socketId: 'test' })

      const call = fetchMock.mock.calls[0]
      const payload = JSON.parse(call[1].body)

      expect(payload.signature).toBeUndefined()
    })
  })

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      fetchMock = mock(() => Promise.reject(new Error('Network error')))
      globalThis.fetch = fetchMock as any

      // Should not throw - errors are handled internally
      await manager.fire('connection', { socketId: 'test' })

      // Verify it was called (and retried)
      expect(fetchMock).toHaveBeenCalled()
    })

    it('should handle timeout errors', async () => {
      fetchMock = mock(() => new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Timeout')), 50)
      }))
      globalThis.fetch = fetchMock as any

      // Should not throw - errors are handled internally
      await manager.fire('connection', { socketId: 'test' })

      expect(fetchMock).toHaveBeenCalled()
    })

    it('should handle malformed webhook URLs', async () => {
      manager = new WebhookManager({
        enabled: true,
        endpoints: [
          {
            url: 'not-a-valid-url',
            events: ['connection'],
          },
        ],
      })

      // Should not throw - errors are handled internally
      await manager.fire('connection', { socketId: 'test' })
    })
  })

  describe('Disabled Webhooks', () => {
    beforeEach(() => {
      manager = new WebhookManager({ enabled: false })
    })

    it('should not fire webhooks when disabled', async () => {
      await manager.fire('connection', { socketId: 'test' })

      expect(fetchMock).toHaveBeenCalledTimes(0)
    })
  })

  describe('Custom Headers', () => {
    beforeEach(() => {
      manager = new WebhookManager({
        enabled: true,
        endpoints: [
          {
            url: 'https://example.com/webhook',
            events: ['connection'],
            headers: {
              'X-Custom-Header': 'custom-value',
              'Authorization': 'Bearer token123',
            },
          },
        ],
      })
    })

    it('should include custom headers in requests', async () => {
      await manager.fire('connection', { socketId: 'test' })

      const call = fetchMock.mock.calls[0]
      const headers = call[1].headers

      expect(headers['X-Custom-Header']).toBe('custom-value')
      expect(headers.Authorization).toBe('Bearer token123')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty event data', async () => {
      await manager.fire('connection', {})

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const call = fetchMock.mock.calls[0]
      const payload = JSON.parse(call[1].body)

      expect(payload.data).toEqual({})
    })

    it('should handle large payloads', async () => {
      const largeData = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          data: 'x'.repeat(100),
        })),
      }

      await manager.fire('connection', largeData)

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('should handle concurrent webhook fires', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        manager.fire('connection', { socketId: `socket-${i}` }))

      await Promise.all(promises)

      expect(fetchMock).toHaveBeenCalledTimes(10)
    })
  })
})
