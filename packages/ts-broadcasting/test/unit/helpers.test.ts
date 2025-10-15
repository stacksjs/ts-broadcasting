/**
 * Unit Tests: BroadcastHelpers
 *
 * Tests for broadcasting helper utilities
 */

import type { Broadcaster } from '../../src/broadcaster'
import type { BroadcastServer } from '../../src/server'
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { BroadcastHelpers } from '../../src/helpers'

describe('BroadcastHelpers', () => {
  let helpers: BroadcastHelpers
  let mockServer: BroadcastServer
  let mockBroadcaster: Broadcaster

  beforeEach(() => {
    mockServer = {
      channels: {
        getSubscribers: mock(() => new Set(['socket-1', 'socket-2'])),
        getChannel: mock((_channel: string) => ({
          subscribers: new Set(['socket-1']),
        })),
        getPresenceMembers: mock(() => new Map([
          ['socket-1', { id: 'user-1', info: { name: 'John' } }],
          ['socket-2', { id: 'user-2', info: { name: 'Jane' } }],
        ])),
        getSubscriberCount: mock(() => 2),
      },
    } as any

    mockBroadcaster = {
      send: mock(() => {}),
    } as any

    helpers = new BroadcastHelpers(mockServer, mockBroadcaster)
  })

  describe('User Broadcasting', () => {
    it('should broadcast to single user', () => {
      helpers.toUser('user-123', 'notification', { message: 'Hello' })

      expect(mockBroadcaster.send).toHaveBeenCalledWith(
        'private-user.user-123',
        'notification',
        { message: 'Hello' },
      )
    })

    it('should broadcast to multiple users', () => {
      helpers.toUsers(['user-1', 'user-2'], 'notification', { message: 'Hello' })

      expect(mockBroadcaster.send).toHaveBeenCalledWith(
        ['private-user.user-1', 'private-user.user-2'],
        'notification',
        { message: 'Hello' },
      )
    })

    it('should handle numeric user IDs', () => {
      helpers.toUser(123, 'notification', { message: 'Test' })

      expect(mockBroadcaster.send).toHaveBeenCalledWith(
        'private-user.123',
        'notification',
        { message: 'Test' },
      )
    })

    it('should handle mixed numeric and string user IDs', () => {
      helpers.toUsers([123, 'user-456'], 'notification', { message: 'Test' })

      expect(mockBroadcaster.send).toHaveBeenCalledWith(
        ['private-user.123', 'private-user.user-456'],
        'notification',
        { message: 'Test' },
      )
    })
  })

  describe('Notifications', () => {
    it('should send notification to user', () => {
      helpers.notify('user-123', {
        title: 'New Message',
        body: 'You have a new message',
        type: 'info',
      })

      expect(mockBroadcaster.send).toHaveBeenCalledWith(
        'private-user.user-123',
        'notification',
        {
          title: 'New Message',
          body: 'You have a new message',
          type: 'info',
        },
      )
    })

    it('should send notifications to multiple users', () => {
      helpers.notifyUsers(['user-1', 'user-2'], {
        title: 'Update',
        body: 'System updated',
      })

      expect(mockBroadcaster.send).toHaveBeenCalledWith(
        ['private-user.user-1', 'private-user.user-2'],
        'notification',
        {
          title: 'Update',
          body: 'System updated',
        },
      )
    })

    it('should support notification types', () => {
      const types: Array<'info' | 'success' | 'warning' | 'error'> = [
        'info',
        'success',
        'warning',
        'error',
      ]

      for (const type of types) {
        helpers.notify('user-123', {
          title: 'Test',
          body: 'Test',
          type,
        })
      }

      expect(mockBroadcaster.send).toHaveBeenCalledTimes(4)
    })

    it('should include optional notification data', () => {
      helpers.notify('user-123', {
        title: 'Order Update',
        body: 'Your order has shipped',
        type: 'success',
        data: { orderId: 'ORD-123', trackingNumber: 'TRK-456' },
      })

      expect(mockBroadcaster.send).toHaveBeenCalledWith(
        'private-user.user-123',
        'notification',
        expect.objectContaining({
          data: { orderId: 'ORD-123', trackingNumber: 'TRK-456' },
        }),
      )
    })
  })

  describe('Global Broadcasting', () => {
    it('should broadcast to all users', () => {
      helpers.toAll('announcement', { message: 'Server maintenance' })

      expect(mockBroadcaster.send).toHaveBeenCalledWith(
        'broadcast',
        'announcement',
        { message: 'Server maintenance' },
      )
    })

    it('should send system message', () => {
      helpers.systemMessage('Server is restarting', 'warning')

      expect(mockBroadcaster.send).toHaveBeenCalledWith(
        'broadcast',
        'system.message',
        expect.objectContaining({
          message: 'Server is restarting',
          type: 'warning',
        }),
      )
    })

    it('should include timestamp in system messages', () => {
      const before = Date.now()
      helpers.systemMessage('Test', 'info')
      const after = Date.now()

      const call = (mockBroadcaster.send as any).mock.calls[0]
      const data = call[2]

      expect(data.timestamp).toBeGreaterThanOrEqual(before)
      expect(data.timestamp).toBeLessThanOrEqual(after)
    })

    it('should default to info type for system messages', () => {
      helpers.systemMessage('Test message')

      expect(mockBroadcaster.send).toHaveBeenCalledWith(
        'broadcast',
        'system.message',
        expect.objectContaining({ type: 'info' }),
      )
    })
  })

  describe('Role-Based Broadcasting', () => {
    it('should broadcast to role', () => {
      helpers.toRole('admin', 'permission.updated', { permission: 'users.delete' })

      expect(mockBroadcaster.send).toHaveBeenCalledWith(
        'role.admin',
        'permission.updated',
        { permission: 'users.delete' },
      )
    })

    it('should support different roles', () => {
      helpers.toRole('moderator', 'alert', { message: 'Check reports' })
      helpers.toRole('admin', 'alert', { message: 'System issue' })

      expect(mockBroadcaster.send).toHaveBeenCalledTimes(2)
    })
  })

  describe('Model Broadcasting', () => {
    it('should broadcast model created', () => {
      helpers.modelCreated('Post', { id: 1, title: 'New Post' })

      expect(mockBroadcaster.send).toHaveBeenCalledWith(
        'model.Post',
        'created',
        { id: 1, title: 'New Post' },
      )
    })

    it('should broadcast model updated', () => {
      helpers.modelUpdated('Post', 123, { title: 'Updated Title' })

      expect(mockBroadcaster.send).toHaveBeenCalledWith(
        'model.Post.123',
        'updated',
        { title: 'Updated Title' },
      )
    })

    it('should broadcast model deleted', () => {
      helpers.modelDeleted('Post', 123)

      expect(mockBroadcaster.send).toHaveBeenCalledWith(
        'model.Post.123',
        'deleted',
        { id: 123 },
      )
    })

    it('should handle string and numeric model IDs', () => {
      helpers.modelUpdated('Post', 'uuid-123', { title: 'Test' })
      helpers.modelUpdated('Post', 456, { title: 'Test' })

      expect(mockBroadcaster.send).toHaveBeenCalledTimes(2)
    })
  })

  describe('User Status', () => {
    it('should get user connection count', () => {
      const count = helpers.getUserConnectionCount('user-123')

      expect(count).toBe(2)
      expect(mockServer.channels.getSubscriberCount).toHaveBeenCalledWith(
        'private-user.user-123',
      )
    })

    it('should check if user is online', () => {
      mockServer.channels.getSubscriberCount = mock(() => 1)
      expect(helpers.isUserOnline('user-123')).toBe(true)

      mockServer.channels.getSubscriberCount = mock(() => 0)
      expect(helpers.isUserOnline('user-456')).toBe(false)
    })

    it('should handle numeric user IDs for status checks', () => {
      helpers.isUserOnline(123)

      expect(mockServer.channels.getSubscriberCount).toHaveBeenCalledWith(
        'private-user.123',
      )
    })
  })

  describe('Presence Helpers', () => {
    it('should get online users in presence channel', () => {
      const users = helpers.getOnlineUsers('chat.room1')

      expect(users).toHaveLength(2)
      expect(users).toContainEqual({ id: 'user-1', info: { name: 'John' } })
      expect(users).toContainEqual({ id: 'user-2', info: { name: 'Jane' } })
    })

    it('should handle presence- prefix automatically', () => {
      helpers.getOnlineUsers('chat.room1')
      expect(mockServer.channels.getPresenceMembers).toHaveBeenCalledWith(
        'presence-chat.room1',
      )

      helpers.getOnlineUsers('presence-chat.room1')
      expect(mockServer.channels.getPresenceMembers).toHaveBeenCalledWith(
        'presence-chat.room1',
      )
    })

    it('should return empty array when no members', () => {
      mockServer.channels.getPresenceMembers = mock(() => null)

      const users = helpers.getOnlineUsers('chat.empty')
      expect(users).toEqual([])
    })

    it('should get presence count', () => {
      const count = helpers.getPresenceCount('chat.room1')

      expect(count).toBe(2)
      expect(mockServer.channels.getSubscriberCount).toHaveBeenCalledWith(
        'presence-chat.room1',
      )
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty user arrays', () => {
      helpers.toUsers([], 'notification', { message: 'Test' })

      expect(mockBroadcaster.send).toHaveBeenCalledWith(
        [],
        'notification',
        { message: 'Test' },
      )
    })

    it('should handle empty notification data', () => {
      helpers.notify('user-123', {
        title: '',
        body: '',
      })

      expect(mockBroadcaster.send).toHaveBeenCalled()
    })

    it('should handle special characters in model names', () => {
      helpers.modelCreated('App\\Models\\User', { id: 1 })

      expect(mockBroadcaster.send).toHaveBeenCalledWith(
        'model.App\\Models\\User',
        'created',
        { id: 1 },
      )
    })
  })
})
