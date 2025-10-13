/**
 * Unit Tests: AcknowledgmentManager
 *
 * Tests for message acknowledgments and delivery confirmation
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { AcknowledgmentManager } from '../../src/acknowledgments'

describe('AcknowledgmentManager', () => {
  let manager: AcknowledgmentManager

  beforeEach(() => {
    manager = new AcknowledgmentManager({
      enabled: true,
      timeout: 100, // Short timeout for testing
      retryAttempts: 3,
    })
  })

  afterEach(async () => {
    // Clear all pending and catch rejections
    const pending = manager.getPending()
    pending.forEach(p => {
      p.reject = () => {} // Replace reject to avoid unhandled promise rejections
    })
    manager.clear()
  })

  describe('Registration and Acknowledgment', () => {
    it('should register message awaiting acknowledgment', () => {
      const promise = manager.register(
        'msg-123',
        'test-channel',
        'test-event',
        { data: 'test' },
        'socket-123',
      )

      expect(promise).toBeInstanceOf(Promise)

      const pending = manager.getPendingById('msg-123')
      expect(pending).toBeDefined()
      expect(pending?.messageId).toBe('msg-123')
    })

    it('should resolve on acknowledgment', async () => {
      const promise = manager.register(
        'msg-123',
        'test-channel',
        'test-event',
        {},
        'socket-123',
      )

      manager.acknowledge('msg-123')

      await expect(promise).resolves.toBe(true)
    })

    it('should return false for non-existent acknowledgment', () => {
      const result = manager.acknowledge('non-existent')

      expect(result).toBe(false)
    })

    it('should remove from pending after acknowledgment', async () => {
      const promise = manager.register('msg-123', 'channel', 'event', {}, 'socket')

      manager.acknowledge('msg-123')
      await promise

      expect(manager.getPendingById('msg-123')).toBeUndefined()
    })
  })

  describe('Timeout Handling', () => {
    it('should timeout after configured duration', async () => {
      const promise = manager.register('msg-123', 'channel', 'event', {}, 'socket')

      await expect(promise).rejects.toThrow(/timeout/)
    })

    it('should retry on timeout', async () => {
      manager = new AcknowledgmentManager({
        enabled: true,
        timeout: 50,
        retryAttempts: 2,
      })

      const promise = manager.register('msg-123', 'channel', 'event', {}, 'socket')

      // Wait for retries to complete
      await expect(promise).rejects.toThrow(/2 attempts/)
    })

    it('should include attempt count in timeout error', async () => {
      const promise = manager.register('msg-123', 'channel', 'event', {}, 'socket')

      try {
        await promise
      }
      catch (error: any) {
        expect(error.message).toContain('3 attempts')
      }
    })
  })

  describe('Pending Acknowledgments', () => {
    beforeEach(() => {
      manager.register('msg-1', 'channel', 'event', {}, 'socket-1')
      manager.register('msg-2', 'channel', 'event', {}, 'socket-2')
      manager.register('msg-3', 'channel', 'event', {}, 'socket-3')
    })

    it('should return all pending acknowledgments', () => {
      const pending = manager.getPending()

      expect(pending.length).toBe(3)
      expect(pending.map(p => p.messageId)).toEqual(['msg-1', 'msg-2', 'msg-3'])
    })

    it('should return pending by ID', () => {
      const pending = manager.getPendingById('msg-2')

      expect(pending).toBeDefined()
      expect(pending?.messageId).toBe('msg-2')
      expect(pending?.socketId).toBe('socket-2')
    })

    it('should return undefined for non-existent pending', () => {
      const pending = manager.getPendingById('non-existent')

      expect(pending).toBeUndefined()
    })
  })

  describe('Clear Acknowledgments', () => {
    it('should clear all pending acknowledgments', async () => {
      const promise1 = manager.register('msg-1', 'channel', 'event', {}, 'socket')
      const promise2 = manager.register('msg-2', 'channel', 'event', {}, 'socket')

      manager.clear()

      await expect(promise1).rejects.toThrow(/cleared/)
      await expect(promise2).rejects.toThrow(/cleared/)
      expect(manager.getPending().length).toBe(0)
    })
  })

  describe('Statistics', () => {
    it('should return statistics', () => {
      manager.register('msg-1', 'channel', 'event', {}, 'socket')
      manager.register('msg-2', 'channel', 'event', {}, 'socket')

      const stats = manager.getStats()

      expect(stats.pending).toBe(2)
      expect(stats.oldest).toBeDefined()
    })

    it('should return zero stats when empty', () => {
      const stats = manager.getStats()

      expect(stats.pending).toBe(0)
      expect(stats.oldest).toBeUndefined()
    })

    it('should track oldest pending message', async () => {
      const time1 = Date.now()
      manager.register('msg-1', 'channel', 'event', {}, 'socket')

      await new Promise(resolve => setTimeout(resolve, 10))

      manager.register('msg-2', 'channel', 'event', {}, 'socket')

      const stats = manager.getStats()
      // Allow some tolerance for timing variations
      expect(stats.oldest).toBeLessThanOrEqual(time1 + 20)
    })
  })

  describe('Disabled Acknowledgments', () => {
    beforeEach(() => {
      manager = new AcknowledgmentManager({ enabled: false })
    })

    it('should immediately resolve when disabled', async () => {
      const promise = manager.register('msg-123', 'channel', 'event', {}, 'socket')

      await expect(promise).resolves.toBe(true)
    })

    it('should not track pending when disabled', async () => {
      await manager.register('msg-123', 'channel', 'event', {}, 'socket')

      expect(manager.getPending().length).toBe(0)
    })
  })

  describe('Enabled Check', () => {
    it('should return true when enabled', () => {
      expect(manager.isEnabled()).toBe(true)
    })

    it('should return false when disabled', () => {
      manager = new AcknowledgmentManager({ enabled: false })
      expect(manager.isEnabled()).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should handle multiple acknowledgments of same message', () => {
      manager.register('msg-123', 'channel', 'event', {}, 'socket')

      expect(manager.acknowledge('msg-123')).toBe(true)
      expect(manager.acknowledge('msg-123')).toBe(false) // Already acknowledged
    })

    it('should handle concurrent registrations', () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        manager.register(`msg-${i}`, 'channel', 'event', {}, 'socket'),
      )

      expect(manager.getPending().length).toBe(10)
    })

    it('should preserve message data in pending', () => {
      const data = { complex: { nested: 'object' }, array: [1, 2, 3] }
      manager.register('msg-123', 'channel', 'event', data, 'socket')

      const pending = manager.getPendingById('msg-123')
      expect(pending?.data).toEqual(data)
    })
  })
})
