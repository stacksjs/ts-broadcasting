/**
 * Unit Tests: PresenceHeartbeatManager
 *
 * Tests for presence heartbeat and auto-removal
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { PresenceHeartbeatManager } from '../../src/presence-heartbeat'

describe('PresenceHeartbeatManager', () => {
  let manager: PresenceHeartbeatManager

  beforeEach(() => {
    manager = new PresenceHeartbeatManager({
      enabled: true,
      interval: 50, // Short interval for testing
      timeout: 100, // Short timeout for testing
    })
  })

  afterEach(() => {
    manager.stop()
  })

  describe('Heartbeat Tracking', () => {
    it('should register user heartbeat', () => {
      manager.heartbeat('test-channel', 'socket-123', { name: 'John' })

      const users = manager.getActiveUsers('test-channel')
      expect(users.length).toBe(1)
      expect(users[0].socketId).toBe('socket-123')
      expect(users[0].data).toEqual({ name: 'John' })
    })

    it('should update existing heartbeat', () => {
      manager.heartbeat('test-channel', 'socket-123', { name: 'John' })
      const firstTime = manager.getActiveUsers('test-channel')[0].lastSeen

      // Wait a bit and update
      setTimeout(() => {
        manager.heartbeat('test-channel', 'socket-123', { name: 'John Doe' })
        const users = manager.getActiveUsers('test-channel')

        expect(users.length).toBe(1)
        expect(users[0].lastSeen).toBeGreaterThan(firstTime)
        expect(users[0].data).toEqual({ name: 'John Doe' })
      }, 10)
    })

    it('should track multiple users per channel', () => {
      manager.heartbeat('test-channel', 'socket-1', { name: 'User 1' })
      manager.heartbeat('test-channel', 'socket-2', { name: 'User 2' })
      manager.heartbeat('test-channel', 'socket-3', { name: 'User 3' })

      const users = manager.getActiveUsers('test-channel')
      expect(users.length).toBe(3)
    })

    it('should track users across multiple channels', () => {
      manager.heartbeat('channel-1', 'socket-123', { data: '1' })
      manager.heartbeat('channel-2', 'socket-123', { data: '2' })

      expect(manager.getActiveUsers('channel-1').length).toBe(1)
      expect(manager.getActiveUsers('channel-2').length).toBe(1)
    })
  })

  describe('User Removal', () => {
    it('should manually remove user', () => {
      manager.heartbeat('test-channel', 'socket-123', { name: 'John' })
      manager.remove('test-channel', 'socket-123')

      const users = manager.getActiveUsers('test-channel')
      expect(users.length).toBe(0)
    })

    it('should not throw when removing non-existent user', () => {
      expect(() => {
        manager.remove('test-channel', 'non-existent')
      }).not.toThrow()
    })

    it('should clean up empty channels on removal', () => {
      manager.heartbeat('test-channel', 'socket-123', { name: 'John' })
      manager.remove('test-channel', 'socket-123')

      const users = manager.getActiveUsers('test-channel')
      expect(users).toEqual([])
    })
  })

  describe('Inactive User Detection', () => {
    it('should detect inactive users', async () => {
      let removedUser: any = null

      manager.onUserRemove((channel, socketId, user) => {
        removedUser = { channel, socketId, user }
      })

      manager.start()
      manager.heartbeat('test-channel', 'socket-123', { name: 'John' })

      // Wait for timeout + interval
      await new Promise(resolve => setTimeout(resolve, 200))

      expect(removedUser).not.toBeNull()
      expect(removedUser.channel).toBe('test-channel')
      expect(removedUser.socketId).toBe('socket-123')
    })

    it('should not remove active users', async () => {
      let removalCount = 0

      manager.onUserRemove(() => {
        removalCount++
      })

      manager.start()
      manager.heartbeat('test-channel', 'socket-123', { name: 'John' })

      // Keep sending heartbeats
      const interval = setInterval(() => {
        manager.heartbeat('test-channel', 'socket-123', { name: 'John' })
      }, 40)

      await new Promise(resolve => setTimeout(resolve, 200))
      clearInterval(interval)

      expect(removalCount).toBe(0)
    })
  })

  describe('Active User Checking', () => {
    it('should identify active users', () => {
      manager.heartbeat('test-channel', 'socket-123', { name: 'John' })

      expect(manager.isActive('test-channel', 'socket-123')).toBe(true)
    })

    it('should identify inactive users', async () => {
      manager.heartbeat('test-channel', 'socket-123', { name: 'John' })

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150))

      expect(manager.isActive('test-channel', 'socket-123')).toBe(false)
    })

    it('should return false for non-existent users', () => {
      expect(manager.isActive('test-channel', 'non-existent')).toBe(false)
    })
  })

  describe('Statistics', () => {
    it('should return statistics', () => {
      manager.heartbeat('channel-1', 'socket-1', {})
      manager.heartbeat('channel-1', 'socket-2', {})
      manager.heartbeat('channel-2', 'socket-3', {})

      const stats = manager.getStats()

      expect(stats.channels).toBe(2)
      expect(stats.totalUsers).toBe(3)
    })

    it('should return zero stats when empty', () => {
      const stats = manager.getStats()

      expect(stats.channels).toBe(0)
      expect(stats.totalUsers).toBe(0)
    })
  })

  describe('Start and Stop', () => {
    it('should start monitoring', () => {
      expect(() => manager.start()).not.toThrow()
    })

    it('should stop monitoring', () => {
      manager.start()
      expect(() => manager.stop()).not.toThrow()
    })

    it('should not monitor when not started', async () => {
      let removed = false
      manager.onUserRemove(() => {
        removed = true
      })

      manager.heartbeat('test-channel', 'socket-123', {})

      await new Promise(resolve => setTimeout(resolve, 200))

      expect(removed).toBe(false)
    })
  })

  describe('Disabled Heartbeat', () => {
    beforeEach(() => {
      manager = new PresenceHeartbeatManager({ enabled: false })
    })

    it('should not track heartbeats when disabled', () => {
      manager.heartbeat('test-channel', 'socket-123', {})

      const users = manager.getActiveUsers('test-channel')
      expect(users.length).toBe(0)
    })
  })
})
