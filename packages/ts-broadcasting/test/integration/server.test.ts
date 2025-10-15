/**
 * Integration Tests: BroadcastServer Core
 *
 * Tests for core server functionality
 */

import type { BroadcastServer } from '../../src/server'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  cleanupTestServer,
  closeWebSocket,
  createTestClient,
  createTestServer,
  getServerPort,
  sendAndWait,
  waitForMessage,
} from '../helpers/test-server'

describe('BroadcastServer - Core Functionality', () => {
  let server: BroadcastServer
  let port: number

  beforeEach(async () => {
    server = await createTestServer({ port: 0 })
    port = getServerPort(server)
  })

  afterEach(async () => {
    await cleanupTestServer(server)
  })

  describe('Server Lifecycle', () => {
    it('should start server successfully', () => {
      expect(server).toBeDefined()
      expect(port).toBeGreaterThan(0)
    })

    it('should stop server gracefully', async () => {
      // Create a separate server for this test to avoid affecting other tests
      const testServer = await createTestServer({ port: 0 })
      await testServer.stop()
      expect(testServer.getConnectionCount()).toBe(0)
    })

    it('should provide health endpoint', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/health`)
      const health = await response.json() as { status: string, redis: any }

      expect(response.status).toBe(200)
      expect(health.status).toBe('ok')
    })

    it('should provide stats endpoint', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/stats`)
      const stats = await response.json()

      expect(response.status).toBe(200)
      expect(stats).toHaveProperty('connections')
      expect(stats).toHaveProperty('channels')
    })

    it('should return 404 for unknown routes', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/unknown`)
      expect(response.status).toBe(404)
    })
  })

  describe('WebSocket Connection', () => {
    it('should accept WebSocket connections', async () => {
      const ws = await createTestClient(port)

      const message = await waitForMessage(ws, 'connection_established')

      expect(message.event).toBe('connection_established')
      expect(message.data).toHaveProperty('socket_id')

      await closeWebSocket(ws)
    })

    it('should assign unique socket IDs', async () => {
      const ws1 = await createTestClient(port)
      const msg1Promise = waitForMessage(ws1, 'connection_established')

      const ws2 = await createTestClient(port)
      const msg2Promise = waitForMessage(ws2, 'connection_established')

      const [msg1, msg2] = await Promise.all([msg1Promise, msg2Promise])

      expect(msg1.data.socket_id).not.toBe(msg2.data.socket_id)

      await closeWebSocket(ws1)
      await closeWebSocket(ws2)
    })

    it('should track connection count', async () => {
      const ws1 = await createTestClient(port)
      await waitForMessage(ws1, 'connection_established')

      expect(server.getConnectionCount()).toBe(1)

      const ws2 = await createTestClient(port)
      await waitForMessage(ws2, 'connection_established')

      expect(server.getConnectionCount()).toBe(2)

      await closeWebSocket(ws1)
      await closeWebSocket(ws2)
    })

    it('should support /ws endpoint', async () => {
      const ws = await createTestClient(port, '/ws')
      const message = await waitForMessage(ws, 'connection_established')

      expect(message.event).toBe('connection_established')
      await closeWebSocket(ws)
    })

    it('should support /app endpoint', async () => {
      const ws = await createTestClient(port, '/app')
      const message = await waitForMessage(ws, 'connection_established')

      expect(message.event).toBe('connection_established')
      await closeWebSocket(ws)
    })
  })

  describe('Ping/Pong', () => {
    it('should respond to ping messages', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      const response = await sendAndWait(ws, { event: 'ping' }, 'pong')

      expect(response.event).toBe('pong')

      await closeWebSocket(ws)
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid JSON', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      ws.send('invalid json{')

      // Server should not crash, connection should remain open
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(ws.readyState).toBe(WebSocket.OPEN)

      await closeWebSocket(ws)
    })

    it('should handle malformed messages gracefully', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      ws.send(JSON.stringify({ invalid: 'message' }))

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(ws.readyState).toBe(WebSocket.OPEN)

      await closeWebSocket(ws)
    })
  })

  describe('Connection Cleanup', () => {
    it('should clean up on disconnect', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      expect(server.getConnectionCount()).toBe(1)

      await closeWebSocket(ws)
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(server.getConnectionCount()).toBe(0)
    })

    it('should unsubscribe from channels on disconnect', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      await sendAndWait(ws, {
        event: 'subscribe',
        channel: 'news',
      }, 'subscription_succeeded')

      expect(server.getSubscriberCount('news')).toBe(1)

      await closeWebSocket(ws)
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(server.getSubscriberCount('news')).toBe(0)
    })
  })

  describe('Statistics', () => {
    it('should provide accurate statistics', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      await sendAndWait(ws, {
        event: 'subscribe',
        channel: 'news',
      }, 'subscription_succeeded')

      const stats = await server.getStats()

      expect(stats.connections).toBe(1)
      expect(stats.channels).toBeGreaterThanOrEqual(1)

      await closeWebSocket(ws)
    })
  })
})
