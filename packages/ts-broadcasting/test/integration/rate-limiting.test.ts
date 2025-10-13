/**
 * Integration Tests: Rate Limiting
 *
 * Tests for rate limiting functionality
 */

import type { BroadcastServer } from '../../src/server'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  cleanupTestServer,
  closeWebSocket,
  createTestClient,
  createTestServer,
  getServerPort,
  waitForMessage,
} from '../helpers/test-server'

describe('Rate Limiting', () => {
  let server: BroadcastServer
  let port: number

  beforeEach(async () => {
    server = await createTestServer({
      port: 0,
      rateLimit: true, // Uses default: 10 messages per second
    })
    port = getServerPort(server)
  })

  afterEach(async () => {
    await cleanupTestServer(server)
  })

  describe('Message Rate Limiting', () => {
    it('should allow messages within rate limit', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      // Send messages within limit
      for (let i = 0; i < 5; i++) {
        ws.send(JSON.stringify({ event: 'ping' }))
      }

      // Should receive pong responses
      let pongCount = 0
      const countPongs = new Promise<void>((resolve) => {
        const handler = (event: MessageEvent) => {
          const data = JSON.parse(event.data)
          if (data.event === 'pong') {
            pongCount++
            if (pongCount === 5) {
              ws.removeEventListener('message', handler)
              resolve()
            }
          }
        }
        ws.addEventListener('message', handler)
      })

      await countPongs
      expect(pongCount).toBe(5)

      await closeWebSocket(ws)
    })

    it('should block messages exceeding rate limit', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      // Send many messages to exceed limit
      for (let i = 0; i < 15; i++) {
        ws.send(JSON.stringify({ event: 'ping' }))
      }

      // Should eventually receive rate limit error
      const errorMessage = await waitForMessage(ws, 'error', 2000)

      expect(errorMessage.event).toBe('error')
      expect(errorMessage.data.type).toBe('RateLimitExceeded')

      await closeWebSocket(ws)
    })

    it('should provide retry-after information', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      // Exceed rate limit
      for (let i = 0; i < 15; i++) {
        ws.send(JSON.stringify({ event: 'ping' }))
      }

      const errorMessage = await waitForMessage(ws, 'error', 2000)

      expect(errorMessage.data).toHaveProperty('retryAfter')
      expect(typeof errorMessage.data.retryAfter).toBe('number')

      await closeWebSocket(ws)
    })

    it('should reset rate limit after window expires', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      // Send messages to approach limit
      for (let i = 0; i < 5; i++) {
        ws.send(JSON.stringify({ event: 'ping' }))
      }

      // Wait for rate limit window to reset
      await new Promise(resolve => setTimeout(resolve, 1100))

      // Should be able to send more messages
      ws.send(JSON.stringify({ event: 'ping' }))

      const response = await waitForMessage(ws, 'pong')
      expect(response.event).toBe('pong')

      await closeWebSocket(ws)
    })
  })

  describe('Per-Connection Rate Limiting', () => {
    it('should track rate limits separately per connection', async () => {
      const ws1 = await createTestClient(port)
      const ws1ConnPromise = waitForMessage(ws1, 'connection_established')

      const ws2 = await createTestClient(port)
      const ws2ConnPromise = waitForMessage(ws2, 'connection_established')

      await Promise.all([ws1ConnPromise, ws2ConnPromise])

      // Exceed limit on ws1
      for (let i = 0; i < 15; i++) {
        ws1.send(JSON.stringify({ event: 'ping' }))
      }

      // ws1 should be rate limited
      const error = await waitForMessage(ws1, 'error', 2000)
      expect(error.data.type).toBe('RateLimitExceeded')

      // ws2 should still work
      ws2.send(JSON.stringify({ event: 'ping' }))
      const pong = await waitForMessage(ws2, 'pong')
      expect(pong.event).toBe('pong')

      await closeWebSocket(ws1)
      await closeWebSocket(ws2)
    })
  })

  describe('Rate Limit Configuration', () => {
    it('should respect custom rate limits', async () => {
      await cleanupTestServer(server)

      // Create server with stricter limits
      server = await createTestServer({ port: 0 })
      server.rateLimit = {
        check: () => false, // Always allow
        getResetAt: () => Date.now() + 1000,
        stop: () => {},
      } as any
      port = getServerPort(server)

      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      // Should be able to send many messages
      for (let i = 0; i < 20; i++) {
        ws.send(JSON.stringify({ event: 'ping' }))
      }

      await new Promise(resolve => setTimeout(resolve, 200))

      await closeWebSocket(ws)
    })
  })

  describe('Error Handling', () => {
    it('should continue operating after rate limit', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      // Trigger rate limit
      for (let i = 0; i < 15; i++) {
        ws.send(JSON.stringify({ event: 'ping' }))
      }

      await waitForMessage(ws, 'error', 2000)

      // Connection should still be alive
      expect(ws.readyState).toBe(WebSocket.OPEN)

      // Wait for rate limit to reset
      await new Promise(resolve => setTimeout(resolve, 1100))

      // Should be able to send again
      ws.send(JSON.stringify({ event: 'ping' }))
      const response = await waitForMessage(ws, 'pong')

      expect(response.event).toBe('pong')

      await closeWebSocket(ws)
    })
  })
})
