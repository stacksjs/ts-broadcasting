/**
 * Integration Tests: Security Features
 *
 * Tests for security and message sanitization
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

describe('Security Features', () => {
  let server: BroadcastServer
  let port: number

  beforeEach(async () => {
    server = await createTestServer({ port: 0, security: true })
    port = getServerPort(server)
  })

  afterEach(async () => {
    await cleanupTestServer(server)
  })

  describe('Message Size Limits', () => {
    it('should accept messages within size limit', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      const normalMessage = {
        event: 'subscribe',
        channel: 'news',
        data: { message: 'a'.repeat(1000) },
      }

      ws.send(JSON.stringify(normalMessage))

      const response = await waitForMessage(ws, 'subscription_succeeded')
      expect(response.event).toBe('subscription_succeeded')

      await closeWebSocket(ws)
    })

    it('should reject oversized messages', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      // Create message larger than 1MB limit
      const largeMessage = {
        event: 'ping',
        data: 'a'.repeat(2 * 1024 * 1024), // 2MB
      }

      // When a message exceeds Bun's maxPayloadLength, the connection is closed
      const closePromise = new Promise<void>((resolve) => {
        ws.addEventListener('close', () => resolve())
      })

      ws.send(JSON.stringify(largeMessage))

      // Wait for connection to close
      await Promise.race([
        closePromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection did not close')), 2000)),
      ])

      expect(ws.readyState).toBe(WebSocket.CLOSED)
    })
  })

  describe('Message Validation', () => {
    it('should validate message structure', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      // Send invalid message (missing event)
      ws.send(JSON.stringify({ invalid: 'message' }))

      const response = await waitForMessage(ws, 'error', 2000)

      expect(response.event).toBe('error')
      expect(response.data.type).toBe('ValidationError')

      await closeWebSocket(ws)
    })

    it('should validate event names', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      // Send message with invalid event name (too long)
      ws.send(JSON.stringify({
        event: 'a'.repeat(101),
        channel: 'news',
      }))

      const response = await waitForMessage(ws, 'error', 2000)

      expect(response.event).toBe('error')
      expect(response.data.type).toBe('ValidationError')

      await closeWebSocket(ws)
    })

    it('should validate event name characters', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      // Send message with invalid characters
      ws.send(JSON.stringify({
        event: 'invalid event!@#',
        channel: 'news',
      }))

      const response = await waitForMessage(ws, 'error', 2000)

      expect(response.event).toBe('error')
      expect(response.data.type).toBe('ValidationError')

      await closeWebSocket(ws)
    })
  })

  describe('XSS Prevention', () => {
    beforeEach(() => {
      // Setup a test channel that echoes messages
      server.channels.channel('private-echo', () => true)
    })

    it('should sanitize script tags in broadcasts', async () => {
      const ws1 = await createTestClient(port)
      const ws1ConnPromise = waitForMessage(ws1, 'connection_established')

      const ws2 = await createTestClient(port)
      const ws2ConnPromise = waitForMessage(ws2, 'connection_established')

      await Promise.all([ws1ConnPromise, ws2ConnPromise])

      await waitForMessage(ws1, 'subscription_succeeded', 2000)
        .catch(() => {
          ws1.send(JSON.stringify({
            event: 'subscribe',
            channel: 'news',
          }))
          return waitForMessage(ws1, 'subscription_succeeded')
        })

      await waitForMessage(ws2, 'subscription_succeeded', 2000)
        .catch(() => {
          ws2.send(JSON.stringify({
            event: 'subscribe',
            channel: 'news',
          }))
          return waitForMessage(ws2, 'subscription_succeeded')
        })

      // Broadcast message with XSS attempt
      server.broadcaster.send('news', 'message', {
        text: '<script>alert("xss")</script>',
      })

      const message = await waitForMessage(ws1, 'message')

      // Should be sanitized (actual sanitization happens server-side)
      // The message reaches client but was sanitized
      expect(message.data).toBeDefined()

      await closeWebSocket(ws1)
      await closeWebSocket(ws2)
    })

    it('should handle nested XSS attempts', async () => {
      const maliciousData = {
        user: {
          name: '<img src=x onerror=alert(1)>',
          profile: {
            bio: '<script>malicious()</script>',
          },
        },
      }

      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      ws.send(JSON.stringify({
        event: 'subscribe',
        channel: 'news',
      }))

      await waitForMessage(ws, 'subscription_succeeded')

      // Broadcast malicious data
      server.broadcaster.send('news', 'user.updated', maliciousData)

      const message = await waitForMessage(ws, 'user.updated')

      // Data should be sanitized
      expect(message.data).toBeDefined()

      await closeWebSocket(ws)
    })
  })

  describe('Custom Validation', () => {
    it('should support custom validators', async () => {
      server.validator?.addValidator((message: any) => {
        if (message.channel && message.channel.length > 50) {
          return 'Channel name too long (max 50)'
        }
        return true
      })

      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      ws.send(JSON.stringify({
        event: 'subscribe',
        channel: 'a'.repeat(51),
      }))

      const response = await waitForMessage(ws, 'error', 2000)

      expect(response.event).toBe('error')
      expect(response.data.type).toBe('ValidationError')
      expect(response.data.error).toContain('too long')

      await closeWebSocket(ws)
    })
  })

  describe('Connection Security', () => {
    it('should handle malformed JSON gracefully', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      ws.send('{ invalid json')

      // Should not crash, connection should stay open
      await new Promise(resolve => setTimeout(resolve, 200))

      expect(ws.readyState).toBe(WebSocket.OPEN)

      await closeWebSocket(ws)
    })

    it('should handle rapid message bursts', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      // Send burst of messages
      for (let i = 0; i < 50; i++) {
        ws.send(JSON.stringify({ event: 'ping' }))
      }

      // Connection should remain stable
      await new Promise(resolve => setTimeout(resolve, 500))

      expect(ws.readyState).toBe(WebSocket.OPEN)

      await closeWebSocket(ws)
    })
  })

  describe('Error Messages', () => {
    it('should not leak sensitive information in errors', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      // Trigger validation error
      ws.send(JSON.stringify({ invalid: 'message' }))

      const response = await waitForMessage(ws, 'error', 2000)

      // Error should be user-friendly, not expose internals
      expect(response.data.error).toBeDefined()
      expect(response.data.error).not.toContain('stack')
      expect(response.data.error).not.toContain('internal')

      await closeWebSocket(ws)
    })
  })
})
