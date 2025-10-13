/**
 * Unit Tests: ChannelManager
 *
 * Tests for channel management, authorization, and subscriptions
 */

import { describe, expect, it, beforeEach } from 'bun:test'
import { ChannelManager } from '../../src/channels'
import type { ServerWebSocket } from 'bun'
import type { WebSocketData } from '../../src/types'

describe('ChannelManager', () => {
  let manager: ChannelManager
  let mockWebSocket: ServerWebSocket<WebSocketData>

  beforeEach(() => {
    manager = new ChannelManager()

    // Create mock WebSocket
    mockWebSocket = {
      data: {
        id: 'test-id',
        socketId: 'socket-123',
        channels: new Set<string>(),
        connectedAt: Date.now(),
      },
      send: () => 0,
      close: () => {},
      publish: () => 0,
      subscribe: () => {},
      unsubscribe: () => {},
      cork: () => {},
      readyState: 1,
    } as any
  })

  describe('Channel Types', () => {
    it('should identify public channels', () => {
      expect(manager.getChannelType('news')).toBe('public')
      expect(manager.getChannelType('announcements')).toBe('public')
    })

    it('should identify private channels', () => {
      expect(manager.getChannelType('private-user.123')).toBe('private')
      expect(manager.getChannelType('private-orders')).toBe('private')
    })

    it('should identify presence channels', () => {
      expect(manager.getChannelType('presence-chat.room1')).toBe('presence')
      expect(manager.getChannelType('presence-lobby')).toBe('presence')
    })
  })

  describe('Public Channel Subscriptions', () => {
    it('should allow subscription to public channels', async () => {
      const result = await manager.subscribe(mockWebSocket, 'news')

      expect(result).toBe(true)
      expect(mockWebSocket.data.channels.has('news')).toBe(true)
    })

    it('should track subscribers in public channels', async () => {
      await manager.subscribe(mockWebSocket, 'news')

      const subscribers = manager.getSubscribers('news')
      expect(subscribers.has('socket-123')).toBe(true)
      expect(manager.getSubscriberCount('news')).toBe(1)
    })

    it('should handle multiple subscribers in public channels', async () => {
      const ws2 = {
        ...mockWebSocket,
        data: { ...mockWebSocket.data, socketId: 'socket-456', channels: new Set() },
      } as any

      await manager.subscribe(mockWebSocket, 'news')
      await manager.subscribe(ws2, 'news')

      expect(manager.getSubscriberCount('news')).toBe(2)
    })
  })

  describe('Private Channel Authorization', () => {
    it('should require authorization callback for private channels', async () => {
      const result = await manager.subscribe(mockWebSocket, 'private-user.123')

      expect(result).toBe(false)
      expect(mockWebSocket.data.channels.has('private-user.123')).toBe(false)
    })

    it('should allow subscription when authorized', async () => {
      manager.channel('private-user.{userId}', () => true)

      const result = await manager.subscribe(mockWebSocket, 'private-user.123')

      expect(result).toBe(true)
      expect(mockWebSocket.data.channels.has('private-user.123')).toBe(true)
    })

    it('should deny subscription when not authorized', async () => {
      manager.channel('private-user.{userId}', () => false)

      const result = await manager.subscribe(mockWebSocket, 'private-user.123')

      expect(result).toBe(false)
      expect(mockWebSocket.data.channels.has('private-user.123')).toBe(false)
    })

    it('should support pattern-based authorization', async () => {
      manager.channel('private-user.{userId}', (ws, params) => {
        return params.userId === '123'
      })

      const result1 = await manager.subscribe(mockWebSocket, 'private-user.123')
      const result2 = await manager.subscribe(mockWebSocket, 'private-user.456')

      expect(result1).toBe(true)
      expect(result2).toBe(false)
    })

    it('should pass WebSocket data to authorization callback', async () => {
      mockWebSocket.data.user = { id: 123, name: 'John' }

      manager.channel('private-user.{userId}', (ws, params) => {
        return ws.data.user?.id === Number.parseInt(params.userId)
      })

      const result = await manager.subscribe(mockWebSocket, 'private-user.123')
      expect(result).toBe(true)
    })

    it('should handle async authorization callbacks', async () => {
      manager.channel('private-user.{userId}', async (ws, params) => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return true
      })

      const result = await manager.subscribe(mockWebSocket, 'private-user.123')
      expect(result).toBe(true)
    })
  })

  describe('Presence Channel Authorization', () => {
    it('should require member info for presence channels', async () => {
      manager.channel('presence-chat.{roomId}', () => ({
        id: 'user-123',
        info: { name: 'John Doe' },
      }))

      const result = await manager.subscribe(mockWebSocket, 'presence-chat.room1')

      // Result is true on successful subscription
      expect(result).toBe(true)

      // Check that member was added to presence channel
      const members = manager.getPresenceMembers('presence-chat.room1')
      expect(members?.get('socket-123')).toEqual({
        id: 'user-123',
        info: { name: 'John Doe' },
      })
    })

    it('should track presence members', async () => {
      manager.channel('presence-chat.{roomId}', () => ({
        id: 'user-123',
        info: { name: 'John Doe' },
      }))

      await manager.subscribe(mockWebSocket, 'presence-chat.room1')

      const members = manager.getPresenceMembers('presence-chat.room1')
      expect(members?.size).toBe(1)
      expect(members?.get('socket-123')).toEqual({
        id: 'user-123',
        info: { name: 'John Doe' },
      })
    })

    it('should support multiple members in presence channels', async () => {
      const ws2 = {
        ...mockWebSocket,
        data: { ...mockWebSocket.data, socketId: 'socket-456', channels: new Set() },
      } as any

      manager.channel('presence-chat.{roomId}', (ws) => ({
        id: ws.data.socketId,
        info: { name: `User ${ws.data.socketId}` },
      }))

      await manager.subscribe(mockWebSocket, 'presence-chat.room1')
      await manager.subscribe(ws2, 'presence-chat.room1')

      const members = manager.getPresenceMembers('presence-chat.room1')
      expect(members?.size).toBe(2)
    })

    it('should deny presence subscription when authorization fails', async () => {
      manager.channel('presence-chat.{roomId}', () => false)

      const result = await manager.subscribe(mockWebSocket, 'presence-chat.room1')

      expect(result).toBe(false)

      // Channel is created but has no members since auth failed
      const members = manager.getPresenceMembers('presence-chat.room1')
      expect(members?.size || 0).toBe(0)
    })
  })

  describe('Channel Unsubscription', () => {
    it('should remove subscriber from public channels', async () => {
      await manager.subscribe(mockWebSocket, 'news')
      manager.unsubscribe(mockWebSocket, 'news')

      expect(mockWebSocket.data.channels.has('news')).toBe(false)
      expect(manager.getSubscriberCount('news')).toBe(0)
    })

    it('should remove subscriber from private channels', async () => {
      manager.channel('private-user.{userId}', () => true)

      await manager.subscribe(mockWebSocket, 'private-user.123')
      manager.unsubscribe(mockWebSocket, 'private-user.123')

      expect(mockWebSocket.data.channels.has('private-user.123')).toBe(false)
      expect(manager.getSubscriberCount('private-user.123')).toBe(0)
    })

    it('should remove presence member when unsubscribing', async () => {
      manager.channel('presence-chat.{roomId}', () => ({
        id: 'user-123',
        info: { name: 'John' },
      }))

      await manager.subscribe(mockWebSocket, 'presence-chat.room1')
      manager.unsubscribe(mockWebSocket, 'presence-chat.room1')

      // Channel is cleaned up when all subscribers leave
      expect(manager.hasChannel('presence-chat.room1')).toBe(false)
    })

    it('should unsubscribe from all channels', async () => {
      await manager.subscribe(mockWebSocket, 'news')
      await manager.subscribe(mockWebSocket, 'announcements')

      manager.unsubscribeAll(mockWebSocket)

      expect(mockWebSocket.data.channels.size).toBe(0)
      expect(manager.getSubscriberCount('news')).toBe(0)
      expect(manager.getSubscriberCount('announcements')).toBe(0)
    })
  })

  describe('Channel Statistics', () => {
    it('should return correct channel count', async () => {
      await manager.subscribe(mockWebSocket, 'news')
      await manager.subscribe(mockWebSocket, 'announcements')

      expect(manager.getChannelCount()).toBe(2)
    })

    it('should return empty subscribers for non-existent channels', () => {
      const subscribers = manager.getSubscribers('non-existent')
      expect(subscribers.size).toBe(0)
    })

    it('should return null for presence members in non-presence channels', () => {
      const members = manager.getPresenceMembers('news')
      expect(members).toBeNull()
    })
  })

  describe('Pattern Matching', () => {
    it('should match wildcard patterns', async () => {
      manager.channel('private-user.{userId}', (ws, params) => true)

      const result1 = await manager.subscribe(mockWebSocket, 'private-user.123')
      const result2 = await manager.subscribe(mockWebSocket, 'private-user.abc')

      expect(result1).toBe(true)
      expect(result2).toBe(true)
    })

    it('should match complex patterns', async () => {
      manager.channel('private-order.{orderId}.items.{itemId}', (ws, params) => {
        return params.orderId && params.itemId
      })

      const result = await manager.subscribe(mockWebSocket, 'private-order.123.items.456')

      expect(result).toBe(true)
    })

    it('should extract pattern parameters correctly', async () => {
      let capturedParams: any

      manager.channel('private-user.{userId}.room.{roomId}', (ws, params) => {
        capturedParams = params
        return true
      })

      await manager.subscribe(mockWebSocket, 'private-user.123.room.456')

      expect(capturedParams.userId).toBe('123')
      expect(capturedParams.roomId).toBe('456')
    })
  })

  describe('Edge Cases', () => {
    it('should handle subscribing to same channel twice', async () => {
      await manager.subscribe(mockWebSocket, 'news')
      await manager.subscribe(mockWebSocket, 'news')

      expect(manager.getSubscriberCount('news')).toBe(1)
    })

    it('should handle unsubscribing from non-subscribed channel', () => {
      expect(() => {
        manager.unsubscribe(mockWebSocket, 'news')
      }).not.toThrow()
    })

    it('should handle empty channel names gracefully', async () => {
      const result = await manager.subscribe(mockWebSocket, '')
      expect(result).toBe(true)
    })
  })
})
