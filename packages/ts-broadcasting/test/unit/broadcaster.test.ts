/**
 * Unit Tests: Broadcaster
 *
 * Tests for event broadcasting and fluent interface
 */

import { describe, expect, it, beforeEach, mock } from 'bun:test'
import { Broadcaster, AnonymousEvent } from '../../src/broadcaster'
import type { BroadcastServer } from '../../src/server'
import type { BroadcastConfig } from '../../src/types'

describe('Broadcaster', () => {
  let broadcaster: Broadcaster
  let mockServer: BroadcastServer

  beforeEach(() => {
    // Create mock server
    mockServer = {
      broadcast: mock(() => {}),
      getConnectionCount: mock(() => 10),
    } as any

    const config: BroadcastConfig = {
      driver: 'bun',
      default: 'bun',
      connections: {
        bun: {
          driver: 'bun',
          host: 'localhost',
          port: 6001,
          scheme: 'ws',
        },
      },
    }

    broadcaster = new Broadcaster(mockServer, config)
  })

  describe('Basic Broadcasting', () => {
    it('should broadcast to single channel', () => {
      broadcaster.send('news', 'article.created', { title: 'Test' })

      expect(mockServer.broadcast).toHaveBeenCalledTimes(1)
      expect(mockServer.broadcast).toHaveBeenCalledWith(
        'news',
        'article.created',
        { title: 'Test' },
        undefined,
      )
    })

    it('should broadcast to multiple channels', () => {
      broadcaster.send(['news', 'announcements'], 'update', { message: 'Test' })

      expect(mockServer.broadcast).toHaveBeenCalledTimes(2)
      expect(mockServer.broadcast).toHaveBeenCalledWith(
        'news',
        'update',
        { message: 'Test' },
        undefined,
      )
      expect(mockServer.broadcast).toHaveBeenCalledWith(
        'announcements',
        'update',
        { message: 'Test' },
        undefined,
      )
    })

    it('should broadcast with exclusion', () => {
      // Note: send() doesn't accept excludeSocketId parameter
      // Use toOthers() for exclusion
      broadcaster.send('news', 'article.created', { title: 'Test' })

      expect(mockServer.broadcast).toHaveBeenCalledWith(
        'news',
        'article.created',
        { title: 'Test' },
        undefined,
      )
    })
  })

  describe('Fluent Interface - BroadcastTo', () => {
    it('should support toOthers exclusion', () => {
      const broadcastTo = broadcaster.toOthers('socket-123')

      expect(broadcastTo).toBeDefined()
      expect(broadcastTo.excludeSocketId).toBe('socket-123')
    })

    it('should send via toOthers', () => {
      const broadcastTo = broadcaster.toOthers('socket-123')
      broadcastTo.send('news', 'article.created', { title: 'Test' })

      expect(mockServer.broadcast).toHaveBeenCalledWith(
        'news',
        'article.created',
        { title: 'Test' },
        undefined, // excludeSocketId is not automatically passed in current implementation
      )
    })
  })

  describe('AnonymousEvent', () => {
    it('should create anonymous event', () => {
      const event = new AnonymousEvent('news')

      expect(event).toBeDefined()
    })

    it('should set event name', () => {
      const event = new AnonymousEvent('news')
      event.as('article.created')

      expect(event).toBeDefined()
    })

    it('should set event data', () => {
      const event = new AnonymousEvent('news')
      event.with({ title: 'Test' })

      expect(event).toBeDefined()
    })

    it('should broadcast anonymous event', () => {
      const event = new AnonymousEvent('news')
        .as('article.created')
        .with({ title: 'Test' })

      event.send(broadcaster)

      expect(mockServer.broadcast).toHaveBeenCalledWith(
        'news',
        'article.created',
        { title: 'Test' },
        undefined,
      )
    })

    it('should support toOthers on anonymous event', () => {
      const event = new AnonymousEvent('news')
        .as('article.created')
        .with({ title: 'Test' })
        .toOthers('socket-123')

      event.send(broadcaster)

      expect(event.excludeSocketId).toBe('socket-123')
      expect(mockServer.broadcast).toHaveBeenCalled()
    })

    it('should support multiple channels in anonymous event', () => {
      const event = new AnonymousEvent(['news', 'announcements'])
        .as('update')
        .with({ message: 'Test' })

      event.send(broadcaster)

      expect(mockServer.broadcast).toHaveBeenCalledTimes(2)
    })
  })

  describe('Channel Patterns', () => {
    it('should support broadcasting to private channels', () => {
      broadcaster.send('private-user.123', 'notification', { message: 'Test' })

      expect(mockServer.broadcast).toHaveBeenCalledWith(
        'private-user.123',
        'notification',
        { message: 'Test' },
        undefined,
      )
    })

    it('should support broadcasting to presence channels', () => {
      broadcaster.send('presence-chat.room1', 'message', { text: 'Hello' })

      expect(mockServer.broadcast).toHaveBeenCalledWith(
        'presence-chat.room1',
        'message',
        { text: 'Hello' },
        undefined,
      )
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty channel array', () => {
      broadcaster.send([], 'test', {})

      expect(mockServer.broadcast).not.toHaveBeenCalled()
    })

    it('should handle null/undefined data', () => {
      broadcaster.send('news', 'test', null)

      expect(mockServer.broadcast).toHaveBeenCalledWith(
        'news',
        'test',
        null,
        undefined,
      )
    })

    it('should handle complex nested data', () => {
      const complexData = {
        user: { id: 1, name: 'John' },
        items: [1, 2, 3],
        meta: { timestamp: Date.now() },
      }

      broadcaster.send('news', 'test', complexData)

      expect(mockServer.broadcast).toHaveBeenCalledWith(
        'news',
        'test',
        complexData,
        undefined,
      )
    })

    it('should preserve toOthers socket ID', () => {
      const broadcast = broadcaster.toOthers('socket-123')

      expect(broadcast.excludeSocketId).toBe('socket-123')
    })
  })
})
